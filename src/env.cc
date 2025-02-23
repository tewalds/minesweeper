
#include "env.h"

#include <cassert>

#include "absl/random/random.h"
#include "absl/strings/str_format.h"

#include "ansi-colors.h"
#include "minesweeper.h"
#include "point.h"

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
      if (cell.state_ == HIDDEN) {
        // Mark it.
        cell.state_ = MARKED;
        cell.user_ = a.user;
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          state_[n].marked_ += 1;
        }
        updates.push_back({MARKED, a.point, a.user});
      } else if (cell.complete()) {
        // All non-bombs are opened, so mark all remaining hidden.
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          if (state_[n].state_ == HIDDEN) {
            q.push_back({MARK, n, a.user});
          }
        }
      }
    } else if (a.action == UNMARK) {
      if (cell.state_ == MARKED) {
        cell.state_ = HIDDEN;
        cell.user_ = a.user;
        for (Pointi n : Neighbors(a.point, dims_, false)) {
          state_[n].marked_ -= 1;
        }
        updates.push_back({HIDDEN, a.point, a.user});
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
          cell.state_ = CellState(b);
          cell.user_ = a.user;
          updates.push_back({cell.state_, a.point, a.user});

          if (cell.complete()) {
            // Don't merge open and score updates, as they may be treated differently by the agent.
            cell.state_ = CellState(cell.state_ | SCORE_ZERO);
            updates.push_back({cell.state_, a.point, a.user});
          }

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


FakeEnv::FakeEnv(Pointi dims) : dims_(dims), state_(dims) {
  reset();
}

void FakeEnv::reset() {
  for (int x = 0; x < dims_.x; x++) {
    for (int y = 0; y < dims_.y; y++) {
      state_(x, y) = Cell(Neighbors({x, y}, dims_, false).size(), false);
    }
  }
}

void FakeEnv::step(std::vector<Update> updates) {
  for (Update u : updates) {
    Cell& cell = state_[u.point];
    Neighbors neighbors(u.point, dims_, false);

    cell.user_ = u.user;

    if (u.state == HIDDEN) {
      if (cell.state_ == MARKED) {
        // Must have unmarked the cell.
        cell.state_ = HIDDEN;
        for (Pointi n : neighbors) {
          state_[n].marked_ -= 1;
        }
      }
    } else if (u.state == MARKED) {
      if (cell.state_ == HIDDEN) {
        cell.state_ = MARKED;
        for (Pointi n : neighbors) {
          state_[n].marked_ += 1;
        }
      } else if (cell.state_ == MARKED) {
        // Someone replaced the mark.
      }
    } else if (u.state == BOMB) {
      if (cell.state_ == HIDDEN) {
        cell.state_ = BOMB;
        for (Pointi n : neighbors) {
          state_[n].marked_ += 1;  // Treat as if it's marked, even though it can't be unmarked.
        }
      }
    } else if (u.state <= EIGHT) {
      if (cell.state_ != MARKED) {
        for (Pointi n : neighbors) {
          Cell& nc = state_[n];
          nc.cleared_ += 1;
          if (nc.complete()) {
            nc.state_ = CellState(nc.state_ | SCORE_ZERO);
          }
        }
        cell.state_ = u.state;
        if (cell.complete()) {
          cell.state_ = CellState(cell.state_ | SCORE_ZERO);
        }
      }
    } else if (u.state >= SCORE_ZERO) {
      // Are SCORE_ variants sent over the wire? They can be ignored.
    } else {
      // std::cout << "Invalid update? " << int(u.state) << ", point: " << u.point << "\n";
      assert(false);
    }
  }
}


std::ostream& operator<<(std::ostream& stream, const Array2D<Cell>& state) {
  using namespace rang;

  stream << fgB::blue << " ";
  for (int x = 0; x < state.width(); ++x) {
    stream << " " << (x % 10);
  }
  stream << style::reset << "\n";
  for (int y = 0; y < state.height(); ++y) {
    stream << fgB::blue << (y % 10) << style::reset << " ";
    for (int x = 0; x < state.width(); ++x) {
      CellState c = state(x, y).state();
      switch (c) {
        case ZERO:
          stream << fg::green << "-" << style::reset;
          break;
        case ONE:
        case TWO:
        case THREE:
        case FOUR:
        case FIVE:
        case SIX:
        case SEVEN:
        case EIGHT:
          stream << fg::green << int(c) << style::reset;
          break;

        case BOMB:
          stream << fgB::red << "*" << style::reset;
          break;

        case HIDDEN:
          stream << fgB::yellow << "#" << style::reset;
          break;

        case MARKED:
          stream << fgB::blue << "@" << style::reset;
          break;

        case SCORE_ZERO:
          stream << "-";
          break;
        case SCORE_ONE:
        case SCORE_TWO:
        case SCORE_THREE:
        case SCORE_FOUR:
        case SCORE_FIVE:
        case SCORE_SIX:
        case SCORE_SEVEN:
        case SCORE_EIGHT:
          stream << int(c & ~SCORE_ZERO);
          break;
      }
      if (x < state.width() - 1) {
        stream << " ";
      }
    }
    stream << "\n";
  }
  return stream;
}
