
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

  const Array2D<Cell>& state() const { return state_; }

 private:
  Pointi dims_;
  float bomb_percentage_;
  Array2D<Cell> state_;
  Xoshiro256pp bitgen_;
};