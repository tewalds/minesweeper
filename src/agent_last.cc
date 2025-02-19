
#include "agent_last.h"

#include <cmath>
#include <iostream>

#include <absl/random/distributions.h>

#include "minesweeper.h"
#include "point.h"


AgentLast::AgentLast(const Array2D<Cell>& state, int user)
    : user_(user), state_(state) {
  reset();
}

void AgentLast::reset() {
  actions_.clear();
  rolling_action_ = {
      // Encourage it to start heading in a random direction. Forces agents to diverge.
      absl::Uniform(bitgen_, 0.0f, float(state_.width())),
      absl::Uniform(bitgen_, 0.0f, float(state_.height())),
  };
}

Action AgentLast::step(const std::vector<Update>& updates, bool paused) {
  for (auto u : updates) {
    if (u.state >= SCORE_ZERO) {
      continue;  // All neighbors are cleared, so nothing left to do.
    }

    if (u.user == user_) {
      constexpr float decay = 0.05;  // Controls how fast it moves away from the last action.
      rolling_action_.x = rolling_action_.x * (1. - decay) + u.point.x * decay;
      rolling_action_.y = rolling_action_.y * (1. - decay) + u.point.y * decay;
    }
    actions_.remove(u.point);

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
            actions_.insert({int(act), nn});
          }
        }
      }
    }
  }

  if (!paused) {
    // if (!actions_.empty() && absl::Uniform(bitgen_, 0, 1000) == 0) {
    //   actions_.validate();
    //   std::cout << actions_.balance_str() << actions_;
    // }

    while (!actions_.empty()) {
      KDTree::Value a = actions_.pop_closest(
      // KDTree::Value a = actions_.find_closest(
          // Rounding fixes a systematic bias towards the top left from truncating.
          {int(std::round(rolling_action_.x)),
           int(std::round(rolling_action_.y))});
      if (state_[a.p].state() == HIDDEN) {
        return {ActionType(a.value), a.p, user_};
      } else {
        actions_.remove(a.p);
      }
    }
  }

  return Action{PASS, {0, 0}, user_};
}
