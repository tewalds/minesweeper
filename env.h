
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"

class Env {
 public:
  Env(Pointi dims, float bomb_percentage);
  std::vector<Update> reset();
  std::vector<Update> step(Action action);

 private:
  struct Cell {
    CellState state;
    bool bomb;
    int user;
  };

  Pointi dims_;
  float bomb_percentage_;
  Array2D<Cell> state_;
  absl::BitGen bitgen_;
};