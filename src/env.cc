
#include "env.h"

#include <cassert>

#include "absl/random/random.h"
#include "absl/strings/str_format.h"

Env::Env(Pointi dims, float bomb_percentage, uint64_t seed) :
    dims_(dims), bomb_percentage_(bomb_percentage), state_(dims), bitgen_(seed) {
  assert(bomb_percentage > 0. && bomb_percentage < 1.);
}

std::vector<Update> Env::reset() {
  // Generate random bombs
  for (int x = 0; x < dims_.x; x++) {
    for (int y = 0; y < dims_.y; y++) {
      state_(x, y).state = HIDDEN;
      state_(x, y).bomb = (absl::Uniform(bitgen_, 0.0, 1.0) < bomb_percentage_);
      state_(x, y).user = 0;
    }
  }

  // Find an empty place to start.
  while (true) {
    Pointi p(
        absl::Uniform(bitgen_, 0, dims_.x),
        absl::Uniform(bitgen_, 0, dims_.y));

    int b = 0;
    for (Pointi n : Neighbors(p, dims_, true)) {
      b += state_[n].bomb;
    }
    if (b == 0) {
      return step(Action{OPEN, p, 0});
    }
  }
}

std::vector<Update> Env::step(Action action) {
  std::vector<Update> updates;

  std::vector<Action> q;
  q.push_back(action);
  while (!q.empty()) {
    Action a = q.back();
    q.pop_back();
    if (a.action == MARK) {
      if (state_[a.point].state == MARKED) {
        if (state_[a.point].user == a.user) {
          // I marked it, so unmark.
          state_[a.point].state = HIDDEN;
          state_[a.point].user = 0;
          updates.push_back({HIDDEN, a.point, a.user});
        } else {
          // Someone else marked, so replace it with my mark.
          state_[a.point].user = a.user;
          updates.push_back({MARKED, a.point, a.user});
        }
      } else if (state_[a.point].state == HIDDEN) {
        // Mark it.
        state_[a.point].state = MARKED;
        state_[a.point].user = a.user;
        updates.push_back({MARKED, a.point, a.user});
      } else {
        // std::cout << "Invalid mark action, already open\n";
      }
    } else if (a.action == OPEN) {
      if (state_[a.point].state == HIDDEN) {
        if (state_[a.point].bomb) {
          CellState c = BOMB;
          state_[a.point].state = c;
          updates.push_back({c, a.point, a.user});
        } else {
          // Compute and reveal the true value
          int b = 0;
          Neighbors neighbors(a.point, dims_, false);
          for (Pointi n : neighbors) {
            b += state_[n].bomb;
          }
          CellState c = CellState(b);
          state_[a.point].state = c;
          updates.push_back({c, a.point, a.user});

          // Propagate to the neighbors.
          if (c == ZERO) {
            for (Pointi n : neighbors) {
              if (state_[n].state == HIDDEN) {
                q.push_back({OPEN, n, 0});
              }
            }
          }
        }
      }
    }
  }
  return updates;
}
