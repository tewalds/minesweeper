
#include <iostream>

#include "absl/algorithm/container.h"
#include "absl/random/random.h"

#include "catch_amalgamated.h"
#include "kdtree.h"
#include "point.h"


TEST_CASE("KDtree", "[kdtree]") {
  KDTree tree;
  std::vector<Pointi> points;
  absl::BitGen bitgen;

  for (int i = 0; i < 50; i++) {
    Pointi p(absl::Uniform(bitgen, 0, 10), absl::Uniform(bitgen, 0, 10));
    bool missing = !absl::c_linear_search(points, p);
    if (missing) {
      points.push_back(p);
    }
    std::ostringstream before;
    tree.print_tree(before);
    CAPTURE(before.str(), points, i, p);
    bool inserted = tree.insert({i, p});

    std::ostringstream after;
    tree.print_tree(after);
    CAPTURE(after.str());

    REQUIRE(inserted == missing);
    REQUIRE(tree.validate());
  }

  INFO("Tree: " << tree);

  std::vector<KDTree::Value> values = tree.collect_values();
  REQUIRE(points.size() == tree.size());
  REQUIRE(points.size() == values.size());

  SECTION("Points are equal") {
    absl::c_sort(points);
    absl::c_sort(values, [](auto a, auto b) { return a.p < b.p; });
    for (int i = 0; i < points.size(); i++) {
      REQUIRE(points[i] == values[i].p);
    }
  }

  SECTION("Rebalance") {
    INFO("Before: " << tree.balance_str() << tree);
    tree.rebalance();
    INFO("After:  " << tree.balance_str() << tree);
    REQUIRE(tree.validate());
  }

  SECTION("Finding a known value returns that value") {
    for (KDTree::Value v : values) {
      REQUIRE(tree.find_closest(v.p) == v);
    }
  }

  SECTION("Remove works") {
    for (int x = 0; x < 10; x++) {
      for (int y = 0; y < 10; y++) {
        INFO("Remove " << Pointi(x, y) << "\n" << tree);
        REQUIRE(absl::c_linear_search(points, Pointi(x, y)) == tree.remove({x, y}));
        REQUIRE(tree.validate());
      }
    }
    REQUIRE(tree.empty());
  }

  SECTION("pop works") {
    REQUIRE(tree.size() == points.size());
    while (!tree.empty()) {
      // KDTree::Value closest = 
      tree.pop_closest({3, 4});
      REQUIRE(tree.validate());
    }
  }
}
