
#include <filesystem>
#include <fstream>
#include <iostream>

#include "absl/strings/str_format.h"

#include "agent_websocket.h"

#include "minesweeper.h"
#include "point.h"


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


AgentWebSocket::AgentWebSocket(const Array2D<Cell>& state, int port, std::filesystem::path doc_root, int first_user)
    : clients_(), next_userid_(first_user), state_(state) {
  reset();

  server_.add_route("/minefield")
      .ws(beauty::ws_handler{
          .on_connect = [this](const beauty::ws_context& ctx) { this->on_connect(ctx); },
          .on_receive = [this](const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
            if (is_text) {
              this->on_receive(ctx, std::string(data, size));
            }
          },
          .on_disconnect = [this](const beauty::ws_context& ctx) { this->on_disconnect(ctx); },
      });

  // Bah, I don't see a way of doing wildcards that allow slashes, so have a cascade of routes.
  server_.add_route("/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("filename").as_string("index.html"));
      });
  server_.add_route("/:dir/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir").as_string() / req.a("filename").as_string("index.html"));
      });
  server_.add_route("/:dir1/:dir2/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir1").as_string() / req.a("dir2").as_string() / req.a("filename").as_string("index.html"));
      });
  server_.add_route("/:dir1/:dir2/:dir3/:filename")
      .get([doc_root](const beauty::request& req, beauty::response& res) {
          serve_file(res, doc_root / req.a("dir1").as_string() / req.a("dir2").as_string() / req.a("dir3").as_string() / req.a("filename").as_string("index.html"));
      });

  server_.listen(port);
  std::cout << "Web server started on http://localhost:" << port << std::endl;
  std::cout << "WebSocket server started on ws://localhost:" << port << "/minefield" << std::endl;

  const int frequency = 1;
  beauty::repeat(frequency, [this]() {
    for (auto& [_, client] : clients_) {
      if (auto s = client.session.lock(); s) {
        send_users(s, std::chrono::seconds(frequency + 1));  // Give a bit of a buffer
      }
    }
  });
}

AgentWebSocket::~AgentWebSocket() {
  server_.stop();
  beauty::stop();  // Stop the repeater
}

void AgentWebSocket::reset() {
  broadcast("reset");
}

Action AgentWebSocket::step(const std::vector<Update>& updates, bool paused) {
  // Broadcast updates.
  for (Update u: updates) {
    int score = 0;
    if (auto user = users_.find(u.user); user != users_.end()) {
      if (u.state > SCORE_ZERO) {
        int count = u.state & (SCORE_ZERO - 1);
        score = count * count;
        users_[u.user].score += score;
      } else if (u.state == BOMB) {
        score = -std::max(100, users_[u.user].score);
        users_[u.user].score += score;
      }
    }
    for (auto& [_, client] : clients_) {
      if (client.userid > 0 && u.state < SCORE_ZERO && users_[client.userid].view.contains(u.point)) {
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

  auto actions = actions_.lock();
  if (!actions->empty()) {
    Action a = actions->front();
    actions->pop();
    return a;
  }
  return Action{PASS, {0, 0}, 0};
}

void AgentWebSocket::broadcast(const std::string& str) {
  for (auto& [_, client] : clients_) {
    if (auto s = client.session.lock(); s) {
      s->send(std::string(str));
    }
  }
}

void AgentWebSocket::send_update(const session_ptr& session, Update u) {
  session->send(absl::StrFormat("update %d %d %d %d", u.state & (SCORE_ZERO - 1), u.point.x, u.point.y, u.user));
}

int AgentWebSocket::send_rect(const session_ptr& session, Recti r) {
  // TODO: Send in a more compact format. Maybe different formats for dense vs sparse area.
  int sent = 0;
  for (int x = r.left(); x < r.right(); x++) {
    for (int y = r.top(); y < r.bottom(); y++) {
      Cell c = state_(x, y);
      if (c.state() != HIDDEN) {
        send_update(session, {c.state(), {x, y}, c.user()});
        sent++;
      }
    }
  }
  return sent;
}

void AgentWebSocket::send_user(const session_ptr& session, const User& u) {
  auto now = std::chrono::system_clock::now();
  session->send(absl::StrFormat(
    "user %d %s %d %d %d %d %d %d %d %d",
    u.userid, u.name, u.color, u.emoji, u.score, u.view.tl.x, u.view.tl.y, u.view.br.x, u.view.br.y,
    std::chrono::duration_cast<std::chrono::seconds>(now - u.last_active).count()));
}

void AgentWebSocket::send_users(const session_ptr& session, std::chrono::duration<float> limit) {
  auto now = std::chrono::system_clock::now();
  for (auto& [_, user] : users_) {
    if (now - user.last_active < limit) {
      send_user(session, user);
    }
  }
}

void AgentWebSocket::on_connect(const beauty::ws_context& ctx) {
  std::cout << "Connection opened" <<std::endl;
  clients_[ctx.uuid] = ClientInfo{
    .uuid = ctx.uuid,
    .session = ctx.ws_session,
    .userid = 0,
  };
  if (auto s = ctx.ws_session.lock(); s) {
    s->send(absl::StrFormat("grid %i %i", state_.width(), state_.height()));
  }
}

void AgentWebSocket::on_receive(const beauty::ws_context& ctx, const std::string& str) {
  std::istringstream iss(str);
  std::string command;

  iss >> command;
  int userid = clients_[ctx.uuid].userid;

  if (userid == 0) {
    if (command == "register") {
      std::string name;
      int color, emoji;
      iss >> name >> color >> emoji;
      userid = next_userid_++;
      name = name.substr(0, 32);
      clients_[ctx.uuid].userid = userid;
      users_[userid] = User{
        .userid = userid,
        .name = name,
        .color = color,
        .emoji = emoji,
        .score = 0,
        .view = Recti(),
        .mouse = Pointf(),
        .last_active = std::chrono::system_clock::now(),
      };
      std::cout << absl::StrFormat("New user id: %i, name: %s\n", userid, name);
    } else if (command == "login") {
      iss >> userid;
      // TODO: check a password
      // TODO: Only allow one connection per user?
      if (users_.find(userid) != users_.end()) {
        clients_[ctx.uuid].userid = userid;
        users_[userid].last_active =  std::chrono::system_clock::now();
      } else {
        if (auto s = ctx.ws_session.lock(); s) {
          s->send("error login failed");
        }
        return;
      }
    } else {
      std::cout << "Invalid command: " << str << "\n";
      return;
    }
    // Broadcast that you joined, including to yourself.
    for (auto& [_, client] : clients_) {
      if (auto s = client.session.lock(); s) {
        send_user(s, users_[userid]);
      }
    }
    if (auto s = ctx.ws_session.lock(); s) {
      s->send(absl::StrFormat("userid %d", userid));
      // Send a list of "active" users. Only connected users? Is 7 days too long?
      // Will send your user again. Oh well.
      send_users(s, std::chrono::days(7));
    }
  } else {
    users_[userid].last_active =  std::chrono::system_clock::now();
    if (command == "open") {
      int x, y;
      iss >> x >> y;
      Pointi p(x, y);
      if (state_.rect().contains(p)) {
        int user = clients_[ctx.uuid].userid;
        actions_.lock()->push({OPEN, p, user});
      }
    } else if (command == "mark") {
      int x, y;
      iss >> x >> y;
      Pointi p(x, y);
      if (state_.rect().contains(p)) {
        int user = clients_[ctx.uuid].userid;
        actions_.lock()->push({MARK, p, user});
      }
    } else if (command == "view") {
      int x1, y1, x2, y2, force;
      iss >> x1 >> y1 >> x2 >> y2 >> force;
      std::optional<Recti> new_view = state_.rect().intersection({{x1, y1}, {x2, y2}});
      if (new_view) {
        users_[userid].view = *new_view;
        if (auto s = ctx.ws_session.lock(); s) {
          if (force) {
            send_rect(s, *new_view);
          } else {
            for (Recti r : new_view->difference(users_[userid].view)) {
              send_rect(s, r);
            }
          }
        }
      }
    } else if (command == "mouse") {
      float x, y;
      iss >> x >> y;
      users_[userid].mouse = {x, y};
      Pointi mouse(x, y);
      auto time_limit = std::chrono::system_clock::now() - std::chrono::seconds(60);
      for (auto& [_, client] : clients_) {
        if (client.userid > 0 && client.userid != userid) {
          const User& user = users_[client.userid];
          if (user.view.contains(mouse) && user.last_active > time_limit) {
            if (auto s = client.session.lock(); s) {
              s->send(absl::StrFormat("mouse %d %.1f %.1f", userid, x, y));
            }
          }
        }
      }
    } else {
      std::cout << "Invalid command: " << str << "\n";
      return;
    }
  }
}

void AgentWebSocket::on_disconnect(const beauty::ws_context& ctx) {
  std::cout << "Connection closed" << std::endl;
  clients_.erase(ctx.uuid);
}
