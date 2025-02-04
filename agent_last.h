
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "agent.h"
#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"


class AgentLast : public Agent {
 public:
  AgentLast(Pointi dims, int user);
  ~AgentLast() = default;
  void reset();
  Action step(const std::vector<Update>& updates, bool paused);

 private:
  Pointi dims_;
  int user_;
  Array2D<CellState> state_;
  KDTree actions_;
  Pointf rolling_action_;
  absl::BitGen bitgen_;
};
