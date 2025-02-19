
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
    if (u.state >= SCORE_ZERO) {
      continue;  // All neighbors are cleared, so nothing left to do.
    }

    for (Pointi n : Neighbors(u.point, state_.dims(), true)) {
      Cell nc = state_[n];
      if (nc.state() != HIDDEN && nc.neighbors_hidden() > 0) {
        ActionType act = PASS;
        if (nc.state() == nc.neighbors_marked()) {
          // All bombs are found, assuming no mistaken marks.
          act = OPEN;
        } else if (nc.complete()) {
          // All remaining hidden must be bombs
          act = MARK;
        } else {
          continue;  // Still unknown.
        }

        for (Pointi nn : Neighbors(n, state_.dims(), false)) {
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
        return a;
      }
    }
  }

  return Action{PASS, {0, 0}, user_};
}
