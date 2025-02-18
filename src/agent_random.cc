
#include "agent_random.h"

#include "minesweeper.h"
#include "point.h"


AgentRandom::AgentRandom(Pointi dims, int user)
    : dims_(dims), user_(user), state_(dims) {
  reset();
}

void AgentRandom::reset() {
  state_.fill(HIDDEN);
  actions_.clear();
}

Action AgentRandom::step(const std::vector<Update>& updates, bool paused) {
  // Update state.
  for (auto u : updates) {
    // std::cout << absl::StrFormat("AgentRandom.step: got Update(%i, %i, %i, %i)",
    //                              u.state, u.point.x, u.point.y, u.user) << std::endl;
    state_[u.point] = u.state;
  }

  // Compute the resulting valid actions.
  for (auto u : updates) {
    for (Pointi n : Neighbors(u.point, dims_, true)) {
      CellState ns = state_[n];
      if (ns != HIDDEN) {
        int hidden = 0;
        int marked = 0;
        Neighbors neighbors(n, dims_, false);
        for (Pointi nn : neighbors) {
          CellState nns = state_[nn];
          if (nns == HIDDEN) {
            hidden += 1;
          } else if (nns == MARKED || nns == BOMB) {
            marked += 1;
          }
        }
        if (hidden == 0) {
          continue;  // No possible actions.
        }

        ActionType act = PASS;
        if (ns == marked) {
          // All bombs are found.
          act = OPEN;
        } else if (ns == hidden + marked) {
          // All remaining hidden must be bombs
          act = MARK;
        } else {
          continue;  // Still unknown.
        }

        for (Pointi nn : neighbors) {
          if (state_[nn] == HIDDEN) {
            actions_.push_back({act, nn, user_});
          }
        }
      }
    }
  }

  if (!paused) {
    // Return an arbitrary valid action from the action queue.
    while (!actions_.empty()) {
      std::swap(actions_[actions_.size() - 1],
                actions_[absl::Uniform(bitgen_, 0u, actions_.size())]);
      Action a = actions_.back();
      actions_.pop_back();
      if (state_[a.point] == HIDDEN) {
        // std::cout << absl::StrFormat("send Action(%i, %i, %i, %i)",
        //     action.action, action.point.x, action.point.y, action.user) << std::endl;
        return a;
      }
    }
  }

  // std::cout << "send PASS\n";
  return Action{PASS, {0, 0}, user_};
}
