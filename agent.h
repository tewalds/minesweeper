
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"


class Agent {
 public:
  Agent(Pointi dims, int user);
  void reset();
  Action step(const std::vector<Update>& updates);

 private:
  Pointi dims_;
  int user_;
  Array2D<CellState> state_;
  // std::vector<Action> actions_;
  KDTree actions_;
  Pointf rolling_action_;
  absl::BitGen bitgen_;
};
