
#include "agent.h"

#include "minesweeper.h"
#include "point.h"


Agent::Agent(Pointi dims, int user)
    : dims_(dims), user_(user), state_(dims) {
  reset();
}

void Agent::reset() {
  state_.fill(HIDDEN);
  actions_.clear();
  rolling_action_ = {
      // Encourage it to start heading in a random direction. Forces agents to diverge.
      absl::Uniform(bitgen_, 0.0f, float(dims_.x)),
      absl::Uniform(bitgen_, 0.0f, float(dims_.y)),
  };
}

Action Agent::step(const std::vector<Update>& updates) {
  // Update state.
  for (auto u : updates) {
    // std::cout << absl::StrFormat("Agent.step: got Update(%i, %i, %i, %i)", 
    //                              u.state, u.point.x, u.point.y, u.user) << std::endl;
    state_[u.point] = u.state;
    if (u.user == user_) {
      constexpr float decay = 0.05;  // Controls how fast it moves away from the last action.
      rolling_action_.x = rolling_action_.x * (1. - decay) + u.point.x * decay;
      rolling_action_.y = rolling_action_.y * (1. - decay) + u.point.y * decay;
    }
    actions_.remove(u.point);
  }

  // Compute the resulting valid actions.
  for (auto u : updates) {
    for (Pointi n : Neighbors(u.point, dims_)) {
      CellState ns = state_[n];
      if (ns != HIDDEN) {
        int hidden = 0;
        int marked = 0;
        Neighbors neighbors(n, dims_);
        for (Pointi nn : neighbors) {
          if (state_[nn] == HIDDEN) {
            hidden += 1;
          } else if (state_[nn] == MARKED) {
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
            // actions_.push_back({act, nn, user_});
            actions_.insert({int(act), nn});
          }
        }
      }
    }
  }

  // Return an arbitrary valid action from the action queue.
  // while (!actions_.empty()) {
  //   unsigned int i = absl::Uniform(bitgen_, 0u, actions_.size());
  //   Action a = actions_[i];
  //   actions_[i] = actions_.back();
  //   // Action a = actions_.back();
  //   actions_.pop_back();
  //   if (state[a.point] == HIDDEN) {
  //     // std::cout << absl::StrFormat("send Action(%i, %i, %i, %i)",
  //     //     action.action, action.point.x, action.point.y, action.user) << std::endl;
  //     return a;
  //   }
  // }

  // if (!actions_.empty() && absl::Uniform(bitgen_, 0, 1000) == 0) {
  //   actions_.validate();
  //   std::cout << "size: " << actions_.size()
  //             << " max depth: " << actions_.depth_max()
  //             << " avg depth: " << actions_.depth_avg()
  //             << " std dev: " << actions_.depth_stddev()
  //             << " balance: " << actions_.balance_factor() << std::endl;
  //   // actions_.print_tree();
  // }

  while (!actions_.empty()) {
    KDTree::Value a = actions_.pop_closest(
        // Rounding fixes a systematic bias towards the top left from truncating.
        {int(std::round(rolling_action_.x)),
          int(std::round(rolling_action_.y))});
    if (state_[a.p] == HIDDEN) {
      return {ActionType(a.value), a.p, user_};
    }
  }

  // std::cout << "send PASS\n";
  return Action{PASS, {0, 0}, user_};
}