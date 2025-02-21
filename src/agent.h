
#pragma once

#include <vector>

#include "minesweeper.h"


class Agent {
 public:
  Agent() = default;
  virtual ~Agent() = default;
  virtual void reset() {}
  virtual Action step(const std::vector<Update>& updates, bool paused = false) {
    return {PASS, {0, 0}, 0};
  }
};
