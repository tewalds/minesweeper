
#include "catch2/catch_amalgamated.h"
#include "random.h"

#include "absl/random/random.h"

TEMPLATE_TEST_CASE("Random", "[random]", Splitmix64, Xoshiro256pp) {

  SECTION("seed") {
    REQUIRE(TestType(42)() == TestType(42)());
    REQUIRE(TestType()() != TestType(42)());
  }

  SECTION("many") {
    TestType rng;
    std::vector<uint64_t> values;
    for (int i = 0; i < 100; ++i) {
      values.push_back(rng());
    }
    std::sort(values.begin(), values.end());
    for (int i = 0; i < values.size() - 1; ++i) {
      REQUIRE(values[i] < values[i + 1]);
    }
  }

  SECTION("uniform") {
    REQUIRE(absl::Uniform(TestType(), 0.0, 1.0) < 1.0);
  }
}
