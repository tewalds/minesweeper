
#include <cassert>
#include <chrono>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include <beauty/beauty.hpp>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/flags/usage.h"
#include "absl/strings/str_format.h"

#include "agent_sfml.h"
#include "minesweeper.h"
#include "point.h"
#include "thread.h"

ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(std::string, host, "localhost", "Websocket host.");
ABSL_FLAG(int, port, 9001, "Websocket port.");
ABSL_FLAG(std::string, name, "wsclient", "Username");


struct State {
  std::unique_ptr<AgentSFML> agent;
  std::vector<Update> updates;
  Pointi dims;
  int userid = 0;
};


int main(int argc, char **argv) {
  absl::SetProgramUsageMessage("Minesweeper client, connect to a server and play minesweeper.\n");
  absl::ParseCommandLine(argc, argv);

  std::string uri = absl::StrFormat("ws://%s:%i/minefield", absl::GetFlag(FLAGS_host), absl::GetFlag(FLAGS_port));
  std::cout << "Connecting to: " << uri << std::endl;

  bool done = false;
  MutexProtected<State> state;

  beauty::client client;

  beauty::ws_handler handler;
  handler.on_connect = [](const beauty::ws_context& ctx) { };
  handler.on_receive = [&state](const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
    assert(is_text);
    std::istringstream iss(std::string(data, size));
    std::string command;
    iss >> command;

    if (command == "grid") {
      int x, y, u;
      iss >> x >> y >> u;
      std::cout << absl::StrFormat("grid: %ix%i, userid: %i\n", x, y, u);
      auto s = state.lock();
      s->dims = Pointi(x, y);
      s->userid = u;
    } else if (command == "update") {
      int c, x, y, user;
      iss >> c >> x >> y >> user;
      Update update{CellState(c), {x, y}, user};
      state.lock()->updates.push_back(update);
    } else if (command == "join") {
      int userid;
      std::string username;
      iss >> userid >> username;
      std::cout << absl::StrFormat("User id: %i, name: %s\n", userid, username);
    } else if (command == "reset") {
      auto s = state.lock();
      s->agent->reset();
      s->updates.clear();
    }
  };
  handler.on_disconnect = [&done](const beauty::ws_context& ctx) { done = true; };
  handler.on_error = [&done](boost::system::error_code ec, const char* what) { done = true; };

  client.ws(uri, std::move(handler));

  Recti view;
  try {
    while (!done) {
      if (state.lock()->agent) {
        Action action;
        Rectf cur_viewf;
        {
          auto s = state.lock();
          action = s->agent->step(s->updates, false);
          s->updates.clear();
          cur_viewf = s->agent->get_view();
        }

        if (action.action == OPEN) {
          client.ws_send(absl::StrFormat("open %i %i", action.point.x, action.point.y));
        } else if (action.action == MARK) {
          client.ws_send(absl::StrFormat("mark %i %i", action.point.x, action.point.y));
        } else if (action.action == PASS) {
          // ignore
        } else if (action.action == QUIT) {
          done = true;
        } else {
          std::cout << "Dropping action: " << action.action << std::endl;
        }

        // Add a small buffer so you can scroll a bit or zoom out once without latency.
        cur_viewf = Rectf::from_center_size(cur_viewf.center(), cur_viewf.size() * 1.5);
        Recti cur_view = cur_viewf.recti();
        if (view != cur_view) {
          view = cur_view;
          client.ws_send(absl::StrFormat(
              "view %i %i %i %i", view.tl.x, view.tl.y, view.br.x, view.br.y));
        }
      } else {
        auto s = state.lock();
        if (s->userid > 0) {
          assert(s->dims.x > 0 && s->dims.y > 0);
          client.ws_send(absl::StrFormat("register %s", absl::GetFlag(FLAGS_name)));
          s->agent = std::make_unique<AgentSFML>(s->dims, s->userid, absl::GetFlag(FLAGS_window));
        }
      }

      std::this_thread::sleep_for(std::chrono::microseconds(1000000/60));
    }
  } catch(const std::exception& ex) {
    std::cout << "exception: " << ex.what() << std::endl;
    return 1;
  }
  return 0;
}
