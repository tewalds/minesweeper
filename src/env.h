
#pragma once

#include <vector>

#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"
#include "random.h"

class Env {
 public:
  Env(Pointi dims, float bomb_percentage, uint64_t seed);
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
  Xoshiro256pp bitgen_;
};