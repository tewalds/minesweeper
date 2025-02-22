
#pragma once

#include <vector>

#include "kdtree.h"
#include "minesweeper.h"
#include "point.h"
#include "random.h"

class Env {
 public:
  Env(Pointi dims, float bomb_percentage, uint64_t seed = 0);
  std::vector<Update> reset();
  std::vector<Update> step(Action action);

  const Array2D<Cell>& state() const { return state_; }

  void validate() const;

 private:
  Pointi dims_;
  float bomb_percentage_;
  Array2D<Cell> state_;
  Xoshiro256pp bitgen_;
};


// An environment that takes updates to generate updated state. It does not know where the bombs
// are, or accept actions. This can be used in an agent, possibly even in a remote process.
class FakeEnv {
 public:
  FakeEnv(Pointi dims);
  void reset();
  void step(std::vector<Update> updates);

  const Array2D<Cell>& state() const { return state_; }

 private:
  Pointi dims_;
  Array2D<Cell> state_;
};

std::ostream& operator<<(std::ostream& stream, const Array2D<Cell>& state);