
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "agent.h"
#include "minesweeper.h"
#include "point.h"


class AgentRandom : public Agent {
 public:
  AgentRandom(Pointi dims, int user);
  ~AgentRandom() = default;
  void reset();
  Action step(const std::vector<Update>& updates, bool paused);

 private:
  Pointi dims_;
  int user_;
  Array2D<CellState> state_;
  std::vector<Action> actions_;
  Pointf rolling_action_;
  absl::BitGen bitgen_;
};
