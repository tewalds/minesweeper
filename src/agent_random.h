
#pragma once

#include <vector>

#include "absl/random/random.h"

#include "agent.h"
#include "minesweeper.h"
#include "point.h"


class AgentRandom : public Agent {
 public:
  AgentRandom(const Array2D<Cell>& state, int user);
  ~AgentRandom() = default;
  void reset();
  Action step(const std::vector<Update>& updates, bool paused = false);

 private:
  int user_;
  const Array2D<Cell>& state_;
  std::vector<Action> actions_;
  Pointf rolling_action_;
  absl::BitGen bitgen_;
};
