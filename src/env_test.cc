
#include "catch2/catch_amalgamated.h"

#include "src/agent_random.h"
#include "src/env.h"
#include "src/minesweeper.h"
#include "src/point.h"


void Env::validate() const {
  for (int x = 0; x < dims_.x; x++) {
    for (int y = 0; y < dims_.y; y++) {
      Pointi p(x, y);
      int neighbors = 0;
      int cleared = 0;
      int marked = 0;
      int hidden = 0;
      int bombs = 0;
      for (Pointi n : Neighbors(p, dims_, false)) {
        neighbors++;
        bombs += (state_[n].bomb_);
        cleared += (state_[n].state_ <= EIGHT || state_[n].state_ >= SCORE_ZERO);
        marked += (state_[n].state_ == MARKED || state_[n].state_ == BOMB);
        hidden += (state_[n].state_ == HIDDEN);
      }
      CAPTURE(p, int((state_[p].state_)), neighbors, cleared, marked, hidden, bombs);

      if (state_[p].state_ != HIDDEN) {
        if (state_[p].bomb_) {
          REQUIRE((state_[p].state_ == BOMB || state_[p].state_ == MARKED));
        } else {
          REQUIRE(((state_[p].state_ & ~SCORE_ZERO) == CellState(bombs)));
        }
      }
      REQUIRE(neighbors == state_[p].neighbors());
      REQUIRE(cleared == state_[p].neighbors_cleared());
      REQUIRE(marked == state_[p].neighbors_marked());
      REQUIRE(hidden == state_[p].neighbors_hidden());
      REQUIRE((state_[p].state_ >= SCORE_ZERO) == state_[p].complete());
    }
  }
}


TEST_CASE("env", "[env]") {

  SECTION("solve known state") {
    Pointi dims(35, 20);
    Env env(dims, 0.1, 42);  // Pass a constant random seed.
    AgentRandom agent(env.state(), 1);
    std::vector<Update> updates = env.reset();
    while (true) {
      Action action = agent.step(updates);
      if (action.action == PASS) {
        break;
      }
      REQUIRE((action.action == OPEN || action.action == MARK));

      CAPTURE(int(action.action), action.point);
      INFO("Before:\n" << env.state());

      updates = env.step(action);

      INFO("After:\n" << env.state());

      env.validate();
    }

    INFO("Final:\n" << env.state());

    int bombs = 0;
    int marked = 0;
    int hidden = 0;
    int opened = 0;
    int complete = 0;
    int total = dims.x * dims.y;
    for (int x = 0; x < dims.x; ++x) {
      for (int y = 0; y < dims.y; ++y) {
        auto s = env.state()(x, y).state();
        if (s == HIDDEN) {
          hidden++;
        } else if (s == MARKED) {
          marked++;
        } else if (s == BOMB) {
          bombs++;
        } else if (s <= EIGHT) {
          opened++;
        } else if (s >= SCORE_ZERO) {
          complete++;
        } else {
          REQUIRE(false);
        }
      }
    }
    REQUIRE(bombs == 0);
    REQUIRE(hidden == 0);
    REQUIRE(opened == 0);  // All must be marked or complete.
    REQUIRE(total == marked + complete);
  }

  // Solve a random environment, make sure it's always in a valid state.
  SECTION("solve random") {
    Pointi dims(35, 20);
    Env env(dims, 0.1, Catch::getSeed());  // Very few bombs
    AgentRandom agent(env.state(), 1);
    std::vector<Update> updates = env.reset();
    while (true) {
      Action action = agent.step(updates);
      if (action.action == PASS) {
        break;
      }
      REQUIRE((action.action == OPEN || action.action == MARK));

      CAPTURE(int(action.action), action.point);
      INFO("Before:\n" << env.state());

      updates = env.step(action);

      INFO("After:\n" << env.state());

      env.validate();
    }
  }
}
