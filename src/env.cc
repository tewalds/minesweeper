
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
    Cell& cell = state_[a.point];
    if (a.action == MARK) {
      if (cell.state_ == MARKED) {
        if (cell.user_ == a.user) {
          // I marked it, so unmark.
          cell.state_ = HIDDEN;
          cell.user_ = a.user;
          for (Pointi n : Neighbors(a.point, dims_, false)) {
            state_[n].marked_ -= 1;
          }
          updates.push_back({HIDDEN, a.point, a.user});
        } else {
          // Someone else marked, so replace it with my mark.
          cell.user_ = a.user;
          updates.push_back({MARKED, a.point, a.user});
        }
      } else if (cell.state_ == HIDDEN) {
        // Mark it.
        cell.state_ = MARKED;
        cell.user_ = a.user;
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          state_[n].marked_ += 1;
        }
        updates.push_back({MARKED, a.point, a.user});
      } else {
        // std::cout << "Invalid mark action, already open\n";
      }
    } else if (a.action == OPEN) {
      if (cell.state_ == HIDDEN) {
        Neighbors neighbors(a.point, dims_, false);
        if (cell.bomb_) {
          cell.state_ = BOMB;
          cell.user_ = a.user;
          for (Pointi n : neighbors) {
            state_[n].marked_ += 1;  // Treat as if it's marked, even though it can't be unmarked.
          }
          updates.push_back({BOMB, a.point, a.user});
        } else {
          // Compute and reveal the true value.
          int8_t b = 0;
          for (Pointi n : neighbors) {
            Cell& nc = state_[n];
            b += nc.bomb_;
            nc.cleared_ += 1;
            if (nc.complete()) {
              nc.state_ = CellState(nc.state_ | SCORE_ZERO);
              nc.user_ = a.user;
              updates.push_back({nc.state_, n, a.user});
            }
          }
          cell.state_ = CellState(cell.complete() ? (b | SCORE_ZERO) : b);
          cell.user_ = a.user;
          updates.push_back({cell.state_, a.point, a.user});

          // Propagate to the neighbors.
          if (b == 0) {
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
