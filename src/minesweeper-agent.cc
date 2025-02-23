
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

#include "agent_last.h"
#include "env.h"
#include "minesweeper.h"
#include "point.h"
#include "thread.h"

ABSL_FLAG(std::string, host, "localhost", "Websocket host.");
ABSL_FLAG(int, port, 9001, "Websocket port.");
ABSL_FLAG(std::string, name, "wsagent", "Username");
ABSL_FLAG(float, sleep, 0.1, "How long to sleep (in seconds) between actions.");


struct State {
  std::unique_ptr<Agent> agent;
  std::unique_ptr<FakeEnv> env;
  std::vector<Update> updates;
  Pointi dims;
  int userid = 0;
};

class PingPong {
 public:
  PingPong& send(beauty::client& client) {
    sent++;
    client.ws_send(absl::StrFormat("ping %d", sent));
    return *this;  // for chaining
  }
  void receive(int i) {
    received++;
    assert(received == i);
    cv.notify_all();
  }
  void wait() {
    std::unique_lock<std::mutex> lk(mutex);
    cv.wait(lk, [this]{ return received < sent; });
  }
 private:
  int sent = 0;
  int received = 0;
  std::mutex mutex;
  std::condition_variable cv;
};


int main(int argc, char **argv) {
  absl::SetProgramUsageMessage("Minesweeper agent, connect to a server.\n");
  absl::ParseCommandLine(argc, argv);

  std::string uri = absl::StrFormat("ws://%s:%i/minefield", absl::GetFlag(FLAGS_host), absl::GetFlag(FLAGS_port));
  std::cout << "Connecting to: " << uri << std::endl;

  auto sleep = std::chrono::microseconds(int(1000000.0 * absl::GetFlag(FLAGS_sleep)));

  bool done = false;
  PingPong ping_pong;
  MutexProtected<State> state;

  beauty::client client;

  client.ws(uri, beauty::ws_handler{
      .on_connect = [&client](const beauty::ws_context& ctx) {
        std::cout << "Connected\n";
        absl::BitGen bitgen;
        std::cout << "Logging in as: " << absl::GetFlag(FLAGS_name) << std::endl;
        client.ws_send(absl::StrFormat("login %s", absl::GetFlag(FLAGS_name)));
        client.ws_send(absl::StrFormat("settings %d %d",
            absl::Uniform(bitgen, 0, 100), absl::Uniform(bitgen, 0, 100)));
      },
      .on_receive = [&state, &ping_pong](const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
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
        } else if (command == "score") {
        } else if (command == "user") {
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
          s->env->reset();
          s->agent->reset();
          s->updates.clear();
        } else if (command == "pong") {
          int i;
          iss >> i;
          ping_pong.receive(i);
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

  try {
    while (!done) {
      if (state.lock()->agent) {
        Action action;
        {
          auto s = state.lock();
          s->env->step(s->updates);  // Update the state for the agent.
          action = s->agent->step(s->updates, false);
          s->updates.clear();
        }

        if (action.action == OPEN || action.action == MARK || action.action == UNMARK) {
          client.ws_send(absl::StrFormat("mouse %i.5 %i.5", action.point.x, action.point.y));
          client.ws_send(absl::StrFormat("act %i %i %i", action.action, action.point.x, action.point.y));
          ping_pong.send(client).wait();
        } else if (action.action == QUIT) {
          done = true;
          break;
        } else {
          // Ignore PASS, RESET, PAUSE.
        }
      } else {
        auto s = state.lock();
        if (s->dims.x > 0 && s->dims.y > 0 && s->userid > 0) {
          s->env = std::make_unique<FakeEnv>(s->dims);
          s->agent = std::make_unique<AgentLast>(s->env->state(), s->userid);
          client.ws_send(absl::StrFormat("view 0 0 %i %i 1", s->dims.x, s->dims.y));
          ping_pong.send(client).wait();
          std::cout << "Loaded field\n";
        }
      }

      std::this_thread::sleep_for(sleep);
    }
  } catch(const std::exception& ex) {
    std::cout << "exception: " << ex.what() << std::endl;
    return 1;
  }
  return 0;
}
