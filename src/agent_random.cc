
#include "agent_random.h"

#include "minesweeper.h"
#include "point.h"


AgentRandom::AgentRandom(const Array2D<Cell>& state, int user)
    : user_(user), state_(state) {
  reset();
}

void AgentRandom::reset() {
  actions_.clear();
}

Action AgentRandom::step(const std::vector<Update>& updates, bool paused) {
  // Compute the resulting valid actions.
  for (auto u : updates) {
    for (Pointi n : Neighbors(u.point, state_.dims(), true)) {
      CellState ns = state_[n].state();
      if (ns != HIDDEN) {
        int hidden = 0;
        int marked = 0;
        Neighbors neighbors(n, state_.dims(), false);
        for (Pointi nn : neighbors) {
          CellState nns = state_[nn].state();
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
          if (state_[nn].state() == HIDDEN) {
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
      if (state_[a.point].state() == HIDDEN) {
        // std::cout << absl::StrFormat("send Action(%i, %i, %i, %i)",
        //     action.action, action.point.x, action.point.y, action.user) << std::endl;
        return a;
      }
    }
  }

  // std::cout << "send PASS\n";
  return Action{PASS, {0, 0}, user_};
}
