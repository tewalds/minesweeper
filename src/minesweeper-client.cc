
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
#include "absl/random/random.h"
#include "absl/strings/str_format.h"

#include "agent_sfml.h"
#include "minesweeper.h"
#include "point.h"
#include "thread.h"

ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(std::string, host, "localhost", "Websocket host.");
ABSL_FLAG(int, port, 9001, "Websocket port.");
ABSL_FLAG(std::string, name, std::getenv("USER"), "Username, default of $USER");


struct State {
  std::unique_ptr<AgentSFML> agent;
  std::vector<Update> updates;
  Pointi dims;
  int userid = 0;
};


int main(int argc, char **argv) {
  absl::SetProgramUsageMessage("Minesweeper client, connect to a server and play minesweeper.\n");
  absl::ParseCommandLine(argc, argv);

  std::string name = absl::GetFlag(FLAGS_name);
  name.erase(remove_if(name.begin(), name.end(), isspace), name.end());  // Remove spaces
  if (name.empty()) {
    std::cerr << "Username not specified. Please set the environment variable USER or use --name option." << std::endl;
    return 1;
  }

  std::string uri = absl::StrFormat("ws://%s:%i/minefield", absl::GetFlag(FLAGS_host), absl::GetFlag(FLAGS_port));
  std::cout << "Connecting to: " << uri << std::endl;

  bool done = false;
  MutexProtected<State> state;

  beauty::client client;

  client.ws(uri, beauty::ws_handler{
      .on_connect = [&client, &name](const beauty::ws_context& ctx) {
        std::cout << "Connected\n";
        absl::BitGen bitgen;
        std::cout << "Logging in as: " << name << std::endl;
        client.ws_send(absl::StrFormat("login %s", name));
        client.ws_send(absl::StrFormat("settings %d %d",
            absl::Uniform(bitgen, 0, 100), absl::Uniform(bitgen, 0, 100)));
      },
      .on_receive = [&state](const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
        assert(is_text);
        std::string str(data, size);
        std::istringstream iss(str);
        std::string command;
        iss >> command;

        if (command == "update") {
          int c, x, y, user;
          iss >> c >> x >> y >> user;
          Update update{CellState(c), {x, y}, user};
          state.lock()->updates.push_back(update);
        } else if (command == "mouse") {
          // TODO: Render the other player's mouse positions?
        } else if (command == "score") {
          // TODO: Render score events?
        } else if (command == "user") {
          // TODO: What would we do with this information?
          // - initialize our view from our own if we just logged in (ie not registered)?
          // - color marked cells based on the user's color?
          std::cout << str << std::endl;
        } else if (command == "grid") {
          int x, y;
          iss >> x >> y;
          std::cout << absl::StrFormat("grid: %ix%i\n", x, y);
          state.lock()->dims = Pointi(x, y);
        } else if (command == "userid") {
          int u;
          iss >> u;
          std::cout << absl::StrFormat("userid: %i\n", u);
          state.lock()->userid = u;
        } else if (command == "join") {
          int userid;
          std::string username;
          iss >> userid >> username;
          std::cout << absl::StrFormat("User id: %i, name: %s\n", userid, username);
        } else if (command == "reset") {
          auto s = state.lock();
          s->agent->reset();
          s->updates.clear();
        } else {
          std::cout << "Unknown command: " << str << "\n";
        }
      },
      .on_disconnect = [&done](const beauty::ws_context& ctx) {
        std::cout << "Disconnected from server\n";
        done = true;
      },
      .on_error = [&done](boost::system::error_code ec, const char* what) {
        std::cout << "Error: " << ec << " " << what << "\n";
        done = true;
      },
  });

  Recti view;
  Pointf mouse;
  try {
    while (!done) {
      if (state.lock()->agent) {
        Action action;
        Rectf cur_viewf;
        Pointf cur_mouse;
        {
          auto s = state.lock();
          action = s->agent->step(s->updates, false);
          s->updates.clear();
          cur_viewf = s->agent->get_view();
          cur_mouse = s->agent->get_mouse();
        }

        if (action.action == OPEN || action.action == MARK || action.action == UNMARK) {
          client.ws_send(absl::StrFormat("act %i %i %i", action.action, action.point.x, action.point.y));
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
        bool force = (view.area() == 0);
        if (view != cur_view) {
          view = cur_view;
          client.ws_send(absl::StrFormat(
              "view %i %i %i %i %i", view.tl.x, view.tl.y, view.br.x, view.br.y, force));
        }

        if (cur_mouse != Pointf() && cur_mouse.distance(mouse) > 0.2) {
          // TODO: Should the limit be relative to view size, so you don't send too often
          // if you're zoomed out? or maybe not at all if you're too zoomed out?
          mouse = cur_mouse;
          client.ws_send(absl::StrFormat("mouse %.1f %.1f", mouse.x, mouse.y));
        }
      } else {
        auto s = state.lock();
        if (s->dims.x > 0 && s->dims.y > 0 && s->userid > 0) {
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
