
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "agent.h"
#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"


class AgentLast : public Agent {
 public:
  AgentLast(const Array2D<Cell>& state, int user);
  ~AgentLast() = default;
  void reset();
  Action step(const std::vector<Update>& updates, bool paused = false);

 private:
  int user_;
  const Array2D<Cell>& state_;
  KDTree actions_;
  Pointf rolling_action_;
  absl::BitGen bitgen_;
};
