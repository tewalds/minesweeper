
#include <cassert>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "absl/container/flat_hash_map.h"
#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/flags/usage.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_format.h"

#include "beauty/beauty.hpp"
#include "env.h"
#include "minesweeper.h"
#include "point.h"

ABSL_FLAG(int, size, 1000, "Field size, squared.");
ABSL_FLAG(float, mines, 0.16, "Mines percentage");
ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(int, port, 9001, "Port to run the websocket server on.");
ABSL_FLAG(int, seed, 0, "Random seed for the environment.");

using session_ptr = std::shared_ptr<beauty::websocket_session>;


std::string read_file_content(const std::filesystem::path& filename) {
  std::ifstream file{filename};
  return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}

void serve_file(beauty::response& res, const std::filesystem::path& path) {
  if (path.string().find("..") != std::string::npos) {
    throw beauty::http_error::client::bad_request("bad request");
  }

  std::string ext = path.extension();
  if (auto t = beauty::content_type::types.find(ext); t != beauty::content_type::types.end()) {
    res.set(t->second);
  } else {
    // The more correct thing to do would be to set the content type to
    // application/octet-stream, but I don't want to serve unknown file types.
    throw beauty::http_error::client::forbidden("forbidden");
  }

  if (!std::filesystem::exists(path)) {
    throw beauty::http_error::client::not_found("not found");
  }

  res.body() = read_file_content(path);
}

struct ClientInfo {
  std::weak_ptr<beauty::websocket_session> session;
  int userid;
};

struct User {
  int userid;
  std::string name;
  int color;
  int emoji;
  int score;
  Recti view;
  Pointf mouse;
  std::chrono::time_point<std::chrono::system_clock> last_active;
};

void send_update(const session_ptr& session, Update u) {
  session->send(absl::StrFormat("update %d %d %d %d", u.state & (SCORE_ZERO - 1), u.point.x, u.point.y, u.user));
}

int send_rect(const session_ptr& session, const Array2D<Cell>& state, Recti r) {
  // TODO: Send in a more compact format. Maybe different formats for dense vs sparse area.
  int sent = 0;
  for (int x = r.left(); x < r.right(); x++) {
    for (int y = r.top(); y < r.bottom(); y++) {
      Cell c = state(x, y);
      if (c.state() != HIDDEN || c.user() != 0) {  // Could have been unmarked.
        send_update(session, {c.state(), {x, y}, c.user()});
        sent++;
      }
    }
  }
  return sent;
}

void send_user(const session_ptr& session, const User& u) {
  auto now = std::chrono::system_clock::now();
  session->send(absl::StrFormat(
    "user %d %s %d %d %d %d %d %d %d %d",
    u.userid, u.name, u.color, u.emoji, u.score, u.view.tl.x, u.view.tl.y, u.view.br.x, u.view.br.y,
    std::chrono::duration_cast<std::chrono::seconds>(now - u.last_active).count()));
}

void send_users(const session_ptr& session, const absl::flat_hash_map<int, User>& users, std::chrono::duration<float> limit) {
  auto now = std::chrono::system_clock::now();
  for (auto& [_, user] : users) {
    if (now - user.last_active < limit) {
      send_user(session, user);
    }
  }
}


int main(int argc, char **argv) {
  absl::SetProgramUsageMessage("Minesweeper server.\n");
  absl::ParseCommandLine(argc, argv);

  int size = absl::GetFlag(FLAGS_size);
  Pointi dims(size, size);

  std::cout << absl::StrFormat("grid: %ix%i\n", dims.x, dims.y);

  Env env(dims, absl::GetFlag(FLAGS_mines), (uint64_t)absl::GetFlag(FLAGS_seed));
  std::vector<Update> updates = env.reset();
  std::vector<Action> actions;

  beauty::server server;
  absl::flat_hash_map<std::string, ClientInfo> clients;  // uuid -> client info
  absl::flat_hash_map<int, User> users;  // userid -> User
  absl::flat_hash_map<std::string, int> usernames;  // username -> userid
  int next_userid = 1;

  server.add_route("/minefield")
      .ws(beauty::ws_handler{
          .on_connect = [&clients, &dims](const beauty::ws_context& ctx) { 
            std::cout << "Connection opened" <<std::endl;
            clients[ctx.uuid] = ClientInfo{
              .session = ctx.ws_session,
              .userid = 0,
            };
            if (auto s = ctx.ws_session.lock(); s) {
              s->send(absl::StrFormat("grid %i %i", dims.x, dims.y));
            }
          },
          .on_receive = [&clients, &users, &usernames, &next_userid, &env](
              const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
            if (!is_text) {
              return;
            }
            std::string str(data, size);
            std::istringstream iss(str);
            std::string command;

            iss >> command;
            
            if (command == "ping") {
              // Useful for testing latency. Most messages are async events that may result in an arbitrary
              // number of responses, from none to millions, or not be a response at all. This one is
              // guaranteed to be sent back immediately with a single response. Unfortunately it's not that
              // useful for synchronization, as an action sent before this can lead to updates sent after
              // this response. It at least lets you wait for some of the send/receive buffers to clear.
              if (auto s = ctx.ws_session.lock(); s) {
                s->send(absl::StrFormat("pong%s", str.substr(4)));
              }
              return;
            }
            
            int userid = clients[ctx.uuid].userid;
            if (userid == 0) {
              if (command == "login") {
                std::string name;
                iss >> name;  // TODO password
                name = name.substr(0, 32);
                if (usernames.find(name) != usernames.end()) {
                  userid = usernames[name];
                  users[userid].last_active =  std::chrono::system_clock::now();
                } else {
                  userid = next_userid++;
                  usernames[name] = userid;
                  users[userid] = User{
                    .userid = userid,
                    .name = name,
                    .color = -1,
                    .emoji = -1,
                    .score = 0,
                    .view = Recti(),
                    .mouse = Pointf(),
                    .last_active = std::chrono::system_clock::now(),
                  };
                  std::cout << absl::StrFormat("New user id: %i, name: %s\n", userid, name);
                }
                // TODO: Make sure there's only one connection per user.
                clients[ctx.uuid].userid = userid;
                if (auto s = ctx.ws_session.lock(); s) {
                  s->send(absl::StrFormat("userid %d", userid));
                  // Send a list of "active" users. Only connected users? Is 7 days too long?
                  send_users(s, users, std::chrono::days(7));
                }
                // Broadcast that you joined.
                for (auto& [_, client] : clients) {
                  if (client.userid != userid) {
                    if (auto s = client.session.lock(); s) {
                      send_user(s, users[userid]);
                    }
                  }
                }
              } else {
                std::cout << "Invalid command: " << str << "\n";
                return;
              }
            } else {
              users[userid].last_active =  std::chrono::system_clock::now();
              if (command == "act") {
                int a, x, y;
                iss >> a >> x >> y;
                ActionType action= static_cast<ActionType>(a);
                Pointi p(x, y);
                if (env.state().rect().contains(p) && (action == OPEN || action == MARK || action == UNMARK)) {
                  std::vector<Update> updates = env.step({action, p, userid});
                  for (Update u: updates) {
                    int score = 0;
                    if (u.user > 0) {
                      if (u.state > SCORE_ZERO) {
                        int count = u.state & (SCORE_ZERO - 1);
                        score = count * count;
                        users[u.user].score += score;
                      } else if (u.state == BOMB) {
                        score = -std::max(100, users[u.user].score);
                        users[u.user].score += score;
                      }
                    }
                    for (auto& [_, client] : clients) {
                      if (client.userid > 0 && u.state < SCORE_ZERO && users[client.userid].view.contains(u.point)) {
                        if (auto s = client.session.lock(); s) {
                          send_update(s, u);
                        }
                      }
                      if (score > 0 && client.userid == u.user) {
                        if (auto s = client.session.lock(); s) {
                          s->send(absl::StrFormat("score %d %d %d", score, u.point.x, u.point.y));
                        }
                      }
                    }
                  }
                }
              } else if (command == "view") {
                int x1, y1, x2, y2, force;
                iss >> x1 >> y1 >> x2 >> y2 >> force;
                std::optional<Recti> new_view = env.state().rect().intersection({{x1, y1}, {x2, y2}});
                if (new_view) {
                  users[userid].view = *new_view;
                  if (auto s = ctx.ws_session.lock(); s) {
                    if (force) {
                      send_rect(s, env.state(), *new_view);
                    } else {
                      for (Recti r : new_view->difference(users[userid].view)) {
                        send_rect(s, env.state(), r);
                      }
                    }
                  }
                }
              } else if (command == "mouse") {
                float x, y;
                iss >> x >> y;
                users[userid].mouse = {x, y};
                Pointi mouse(x, y);
                auto time_limit = std::chrono::system_clock::now() - std::chrono::seconds(60);
                for (auto& [_, client] : clients) {
                  if (client.userid > 0 && client.userid != userid) {
                    const User& user = users[client.userid];
                    if (user.view.contains(mouse) && user.last_active > time_limit) {
                      if (auto s = client.session.lock(); s) {
                        s->send(absl::StrFormat("mouse %d %.1f %.1f", userid, x, y));
                      }
                    }
                  }
                }
              } else if (command == "settings") {
                int color, emoji;
                iss >> color >> emoji;
                users[userid].color = color;
                users[userid].emoji = emoji;
              } else {
                std::cout << "Invalid command: " << str << "\n";
                return;
              }
            }
          },
          .on_disconnect = [&clients](const beauty::ws_context& ctx) { 
            std::cout << "Connection closed" << std::endl;
            clients.erase(ctx.uuid);
          },
      });

  // Bah, I don't see a way of doing wildcards that allow slashes, so have a cascade of routes.
  std::filesystem::path doc_root = std::filesystem::current_path() / "client/";
  server.add_route("/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("filename").as_string("index.html"));
      });
  server.add_route("/:dir/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir").as_string() / req.a("filename").as_string("index.html"));
      });
  server.add_route("/:dir1/:dir2/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir1").as_string() / req.a("dir2").as_string() / req.a("filename").as_string("index.html"));
      });
  server.add_route("/:dir1/:dir2/:dir3/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir1").as_string() / req.a("dir2").as_string() / req.a("dir3").as_string() / req.a("filename").as_string("index.html"));
      });

  int port = absl::GetFlag(FLAGS_port);
  server.concurrency(1);
  server.listen(port);
  std::cout << "Web server started on http://localhost:" << port << std::endl;
  std::cout << "WebSocket server started on ws://localhost:" << port << "/minefield" << std::endl;

  const int frequency = 1;
  beauty::repeat(frequency, [&clients, &users]() {
    for (auto& [_, client] : clients) {
      if (auto s = client.session.lock(); s) {
        send_users(s, users, std::chrono::seconds(frequency + 1));  // Give a bit of a buffer
      }
    }
  });

  beauty::signal(SIGINT, [](int s) { beauty::stop(); });

  beauty::wait();

  server.stop();
  beauty::stop();  // Stop the repeater

  return 0;
}
