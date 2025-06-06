
#include <cassert>
#include <chrono>
#include <csignal>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>
#include <vector>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/flags/usage.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_format.h"

#include "agent.h"
#include "agent_last.h"
#include "agent_random.h"
#include "agent_sfml.h"
#include "env.h"
#include "minesweeper.h"
#include "point.h"

ABSL_FLAG(int, size, 90, "Field size, multiplied by 16x9 for the actual size. 240 leads to a 4K size.");
ABSL_FLAG(float, mines, 0.16, "Mines percentage");
ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(int, aps, 0, "Actions per second");
ABSL_FLAG(int, agents, 1, "Agents");
ABSL_FLAG(int, seed, 0, "Random seed for the environment.");
ABSL_FLAG(bool, benchmark, false, "Exit after the first run");

namespace {
    volatile std::sig_atomic_t signal_status;
}

void signal_handler(int signal) {
  signal_status = signal;
}

int main(int argc, char **argv) {
  absl::SetProgramUsageMessage("Minesweeper: including an agent and UI.\n");
  absl::ParseCommandLine(argc, argv);
  std::signal(SIGINT, signal_handler);

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

  Env env(dims, absl::GetFlag(FLAGS_mines), (uint64_t)absl::GetFlag(FLAGS_seed));
  std::vector<Update> updates = env.reset();

  std::vector<std::unique_ptr<Agent>> agents;
  if (absl::GetFlag(FLAGS_window) > 0) {
    agents.push_back(std::make_unique<AgentSFML>(dims, agents.size() + 1, absl::GetFlag(FLAGS_window)));
  }
  for (int i = 0; i < absl::GetFlag(FLAGS_agents); i++) {
    // agents.push_back(std::make_unique<AgentRandom>(env.state(), agents.size() + 1));
    agents.push_back(std::make_unique<AgentLast>(env.state(), agents.size() + 1));
  }

  std::vector<Action> actions;

  bool paused = false;
  bool finished = false;
  bool quit = false;
  while (!quit && !signal_status && !(finished && benchmark)) {
    auto start = std::chrono::steady_clock::now();

    finished = false;
    for (int i = 0; i < apf && !quit && !finished; i++) {
      for (auto& agent : agents) {
        actions.push_back(agent->step(updates, paused));
      }
      updates.clear();
      finished = true;
      for (Action a : actions) {
        if (a.action == OPEN || a.action == MARK || a.action == UNMARK) {
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
  std::cout << absl::StrFormat("Actions: %d, actions/s: %d\n", bench_actions, bench_actions * 1000000 / duration_us);

  int hidden = 0;
  int total = dims.x * dims.y;
  for (int x = 0; x < dims.x; ++x) {
    for (int y = 0; y < dims.y; ++y) {
      if (env.state()(x, y).state() == HIDDEN) {
        hidden++;
      }
    }
  }
  std::cout << absl::StrFormat("Hidden: %d / %d = %.6f%%\n", hidden, total, hidden * 100.0 / total);

  return 0;
}
