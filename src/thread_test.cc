
#include <string>
#include <thread>
#include <vector>

#include "catch2/catch_amalgamated.h" 
#include "thread.h"

TEST_CASE("Thread", "[thread]") {

  SECTION("Construction") {
    SECTION("initialized") {
      MutexProtected<int> value(0);
      REQUIRE(*value.lock() == 0);
    }
    SECTION("default") {
      MutexProtected<std::string> value;
      REQUIRE(*value.lock() == "");
    }
    SECTION("constructor") {
      MutexProtected<std::string> value("hello");
      *value.lock() += " world";
      REQUIRE(*value.lock() == "hello world");
      REQUIRE(value.lock()->substr(6) == "world");
    }
    SECTION("default vector") {
      MutexProtected<std::vector<int>> value;
      {
        auto locked = value.lock();
        locked->push_back(1);
        locked->push_back(2);
        locked->push_back(3);
      }
      REQUIRE(*value.lock() == std::vector{1, 2, 3});
    }
    SECTION("initializer list") {
      MutexProtected<std::vector<int>> value{{1, 2, 3}};
      REQUIRE(*value.lock() == std::vector{1, 2, 3});
    }
  }

  SECTION("Correctness") {
    MutexProtected<int> value(0);

    std::vector<std::thread> threads;
    threads.reserve(10);
    for (int i = 0; i < 10; ++i) {
      threads.emplace_back([&value]() { 
        for (int j = 0; j < 10000; ++j) { 
          *value.lock() += 1; 
        }
      });
    }
    for (auto& thread : threads) {
      thread.join();
    }
    REQUIRE(*value.lock() == 100000);
  }

}