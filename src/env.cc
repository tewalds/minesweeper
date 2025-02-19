
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
      state_(x, y) = Cell(Neighbors({x, y}, dims_, false).size(),
                          absl::Uniform(bitgen_, 0.0, 1.0) < bomb_percentage_);
    }
  }

  // Find an empty place to start.
  while (true) {
    Pointi p(
        absl::Uniform(bitgen_, 0, dims_.x),
        absl::Uniform(bitgen_, 0, dims_.y));

    int b = 0;
    for (Pointi n : Neighbors(p, dims_, true)) {
      b += state_[n].bomb_;
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
      if (state_[a.point].state_ == MARKED) {
        if (state_[a.point].user_ == a.user) {
          // I marked it, so unmark.
          state_[a.point].state_ = HIDDEN;
          state_[a.point].user_ = a.user;
          for (Pointi n : Neighbors(a.point, dims_, false)) {
            state_[n].marked_ -= 1;
          }
          updates.push_back({HIDDEN, a.point, a.user});
        } else {
          // Someone else marked, so replace it with my mark.
          state_[a.point].user_ = a.user;
          updates.push_back({MARKED, a.point, a.user});
        }
      } else if (state_[a.point].state_ == HIDDEN) {
        // Mark it.
        state_[a.point].state_ = MARKED;
        state_[a.point].user_ = a.user;
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          state_[n].marked_ += 1;
        }
        updates.push_back({MARKED, a.point, a.user});
      } else {
        // std::cout << "Invalid mark action, already open\n";
      }
    } else if (a.action == OPEN) {
      if (state_[a.point].state_ == HIDDEN) {
        Neighbors neighbors(a.point, dims_, false);
        if (state_[a.point].bomb_) {
          CellState c = BOMB;
          state_[a.point].state_ = c;
          state_[a.point].user_ = a.user;
          for (Pointi n : neighbors) {
            state_[n].marked_ += 1;  // Treat as if it's marked, even though it can't be unmarked.
          }
          updates.push_back({c, a.point, a.user});
        } else {
          // Compute and reveal the true value.
          int8_t b = 0;
          for (Pointi n : neighbors) {
            b += state_[n].bomb_;
            state_[n].cleared_ += 1;
          }
          CellState c = CellState(b);
          state_[a.point].state_ = c;
          state_[a.point].user_ = a.user;
          updates.push_back({c, a.point, a.user});

          // Propagate to the neighbors.
          if (c == ZERO) {
            for (Pointi n : neighbors) {
              if (state_[n].state_ == HIDDEN) {
                q.push_back({OPEN, n, 0});
              }
            }
          }
        }
      } else if (cell.state_ == cell.neighbors_marked()) {  // Implicitly not marked/bomb or complete.
        // All bombs are found, assuming no mistaken marks, so open all remaining hidden.
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          if (state_[n].state_ == HIDDEN) {
            q.push_back({OPEN, n, a.user});
          }
        }
      }
    }
  }
  return updates;
}
