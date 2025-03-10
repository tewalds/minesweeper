
#include "catch2/catch_amalgamated.h"

#include <array>
#include <iostream>
#include <vector>

#include "src/agent_last.h"
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

TEMPLATE_TEST_CASE("env benchmark", "[env]", AgentRandom, AgentLast) {
  BENCHMARK("solve known state") {
    Pointi dims(120, 60);  // Small enough to be printed in a high resolution console.
    Env env(dims, 0.15, 42);  // Pass a constant random seed.
    TestType agent(env.state(), 1);
    std::vector<Update> updates = env.reset();
    while (true) {
      Action action = agent.step(updates);
      if (action.action == PASS) {
        break;
      }
      updates = env.step(action);
    }
  };
}

void check_equal(const Array2D<Cell>& a, const Array2D<Cell>& b) {
  REQUIRE(a.dims() == b.dims());
  for (int x = 0; x < a.width(); ++x) {
    for (int y = 0; y < a.height(); ++y) {
      CAPTURE(x, y);
      REQUIRE(a(x, y).state() == b(x, y).state());
      REQUIRE(a(x, y).neighbors() == b(x, y).neighbors());
      REQUIRE(a(x, y).neighbors_cleared() == b(x, y).neighbors_cleared());
      REQUIRE(a(x, y).neighbors_marked() == b(x, y).neighbors_marked());
      REQUIRE(a(x, y).neighbors_hidden() == b(x, y).neighbors_hidden());
      REQUIRE(a(x, y).complete() == b(x, y).complete());
      REQUIRE(a(x, y).user() == b(x, y).user());
    }
  }
}

TEST_CASE("fake env", "[env]") {
  Pointi dims(35, 20);
  Env env(dims, 0.1, Catch::getSeed());
  FakeEnv fake_env(dims);

  std::array<AgentRandom, 2> agents{  // Make sure the user is set correctly too.
      AgentRandom(env.state(), 1),
      AgentRandom(env.state(), 2),
  };

  std::vector<Update> updates = env.reset();
  fake_env.step(updates);

  check_equal(env.state(), fake_env.state());

  std::vector<Action> actions;
  bool done = false;
  while (!done) {
    done = true;

    for (auto &agent : agents) {
      Action action = agent.step(updates);
      if (action.action != PASS) {
        done = false;
        actions.push_back(action);
      }
    }
    updates.clear();

    for (auto action : actions) {
      for (Update u : env.step(action)) {
        updates.push_back(u);
      }
    }
    fake_env.step(updates);

    check_equal(env.state(), fake_env.state());
  }
}
