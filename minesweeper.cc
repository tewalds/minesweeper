
#include <cassert>
#include <chrono>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_format.h"

#include "agent.h"
#include "agent_last.h"
#include "agent_random.h"
#include "agent_sfml.h"
#include "agent_websocket.h"
#include "env.h"
#include "minesweeper.h"
#include "point.h"

ABSL_FLAG(int, size, 90, "Field size, multiplied by 16x9 for the actual size. 240 leads to a 4K size.");
ABSL_FLAG(float, mines, 0.16, "Mines percentage");
ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(int, aps, 0, "Actions per second");
ABSL_FLAG(int, port, 9001, "Port to run the websocket server on.");
ABSL_FLAG(int, agents, 1, "Agents");
ABSL_FLAG(bool, benchmark, false, "Exit after the first run");


int main(int argc, char **argv) {
  absl::ParseCommandLine(argc, argv);

  bool benchmark = absl::GetFlag(FLAGS_benchmark);

  int size = absl::GetFlag(FLAGS_size);
  Pointi dims(size * 16, size * 9);

  int apf = absl::GetFlag(FLAGS_aps) / 60;
  if (apf == 0) {
    apf = size * 16 / std::max(1, absl::GetFlag(FLAGS_agents));
  }

  std::cout << absl::StrFormat("grid: %ix%i, actions per frame: %i\n", dims.x, dims.y, apf);

  auto bench_start = std::chrono::steady_clock::now();
  long long bench_actions = 0;

  Env env(dims, absl::GetFlag(FLAGS_mines));
  std::vector<Update> updates = env.reset();

  std::vector<std::unique_ptr<Agent>> agents;
  if (absl::GetFlag(FLAGS_window) > 0) {
    agents.push_back(std::make_unique<AgentSFML>(dims, agents.size() + 1, absl::GetFlag(FLAGS_window)));
  }
  for (int i = 0; i < absl::GetFlag(FLAGS_agents); i++) {
    agents.push_back(std::make_unique<AgentRandom>(dims, agents.size() + 1));
    // currently broken: agents.push_back(std::make_unique<AgentLast>(dims, agents.size() + 1));
  }
  if (absl::GetFlag(FLAGS_port) > 0) {
    agents.push_back(std::make_unique<AgentWebSocket>(dims, absl::GetFlag(FLAGS_port), agents.size() + 1));
  }

  std::vector<Action> actions;

  bool paused = false;
  bool finished = false;
  bool quit = false;
  while (!quit && !(finished && benchmark)) {
    auto start = std::chrono::steady_clock::now();

    finished = false;
    for (int i = 0; i < apf && !quit && !finished; i++) {
      for (auto& agent : agents) {
        actions.push_back(agent->step(updates, paused));
      }
      updates.clear();
      finished = true;
      for (Action a : actions) {
        if (a.action == OPEN || a.action == MARK) {
          bench_actions += 1;
          finished = false;
          for (Update u : env.step(a)) {
            updates.push_back(u);
          }
        } else if (a.action == RESET) {
          updates = env.reset();
          for (auto& agent : agents) {
            agent->reset();
          }
          finished = false;
          break;
        } else if (a.action == PAUSE) {
          paused = !paused;
          break;
        } else if (a.action == QUIT) {
          quit = true;
          break;
        }
      }
      actions.clear();
    }

    if (!benchmark) {
      const auto frame_time = std::chrono::microseconds(1000000/60);
      std::this_thread::sleep_for(frame_time - (start - std::chrono::steady_clock::now()));
    }
  }

  auto duration_us = std::chrono::duration_cast<std::chrono::microseconds>(
      std::chrono::steady_clock::now() - bench_start).count();
  std::cout << "Actions: " << bench_actions
            << " action/s: " << bench_actions * 1000000 / duration_us << std::endl;

  return 0;
}
