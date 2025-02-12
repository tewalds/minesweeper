
#include <optional>
#include <vector>

#include "catch_amalgamated.h"
#include "point.h"

TEST_CASE("Recti", "[point]") {
  Recti r({5, 6}, {10, 15});
  
  SECTION("Dimensions") {
    REQUIRE(r.top() == 6);
    REQUIRE(r.bottom() == 15);
    REQUIRE(r.left() == 5);
    REQUIRE(r.right() == 10);
    REQUIRE(r.width() == 5);
    REQUIRE(r.height() == 9);
    REQUIRE(r.area() == 45);
    REQUIRE(r.center() == Pointi(7, 10));
    REQUIRE(r.centerf() == Pointf(7.5f, 10.5f));
    REQUIRE(r.size() == Pointi(5, 9));
  }

  SECTION("Comparison") {
    REQUIRE(r == r);
    REQUIRE(r != Recti({7, 8}, {9, 10}));
  }

  SECTION("Contains") {
    REQUIRE(r.contains({7, 9}) == true);
    REQUIRE(r.contains({1, 1}) == false);
    REQUIRE(r.contains({6, 1}) == false);
    REQUIRE(r.contains({5, 6}) == true);
    REQUIRE(r.contains({5, 15}) == false);
    REQUIRE(r.contains({10, 6}) == false);
    REQUIRE(r.contains({10, 15}) == false);

    REQUIRE(r.contains(Recti({6, 7}, {8, 9})) == true);
    REQUIRE(r.contains(Recti({5, 6}, {10, 15})) == true);
    REQUIRE(r.contains(Recti({4, 5}, {9, 10})) == false);
    REQUIRE(r.contains(Recti({4, 5}, {11, 16})) == false);
  }

  SECTION("Intersects") {
    REQUIRE(r.intersects(Recti({1, 2}, {3, 4})) == false);
    REQUIRE(r.intersects(Recti({7, 8}, {9, 10})) == true);
    REQUIRE(r.intersects(Recti({4, 5}, {9, 10})) == true);
    REQUIRE(r.intersects(Recti({4, 5}, {11, 16})) == true);

    // The boundaries match, but don't actually intersect.
    REQUIRE(r.intersects(Recti({10, 6}, {12, 15})) == false);  // r left of inline
    REQUIRE(r.intersects(Recti({2, 5}, {5, 16})) == false);  // r right of inline
    REQUIRE(r.intersects(Recti({7, 15}, {8, 20})) == false);  // r above inline
    REQUIRE(r.intersects(Recti({2, 3}, {8, 6})) == false);  // r below inline
    REQUIRE(r.intersects(Recti({10, 15}, {18, 19})) == false);  // r touches corner of inline
  }

  SECTION("union") {
    REQUIRE(r.union_(Recti({7, 8}, {9, 10})) == r);
    REQUIRE(r.union_(Recti({1, 2}, {3, 4})) == Recti({1, 2}, {10, 15}));
    REQUIRE(r.union_(Recti({7, 8}, {20, 21})) == Recti({5, 6}, {20, 21}));
  }

  SECTION("intersection") {
    REQUIRE(r.intersection(Recti({1, 2}, {3, 4})) == std::nullopt);
    REQUIRE(r.intersection(Recti({1, 2}, {15, 20})) == r);  // external
    REQUIRE(r.intersection(Recti({7, 8}, {9, 10})) == Recti({7, 8}, {9, 10}));  // internal
    REQUIRE(r.intersection(Recti({4, 5}, {9, 10})) == Recti({5, 6}, {9, 10}));  // top edge
    REQUIRE(r.intersection(Recti({7, 8}, {11, 16})) == Recti({7, 8}, {10, 15}));  // br corner

    // The boundaries match, but don't actually intersect.
    REQUIRE(r.intersection(Recti({10, 6}, {12, 15})) == std::nullopt);  // r left of inline
    REQUIRE(r.intersection(Recti({2, 5}, {5, 16})) == std::nullopt);  // r right of inline
    REQUIRE(r.intersection(Recti({7, 15}, {8, 20})) == std::nullopt);  // r above inline
    REQUIRE(r.intersection(Recti({2, 3}, {8, 6})) == std::nullopt);  // r below inline
    REQUIRE(r.intersection(Recti({10, 15}, {18, 19})) == std::nullopt);  // r touches corner of inline
  }

  SECTION("difference") {
    REQUIRE(r.difference(Recti({1, 2}, {3, 4})) == std::vector<Recti>{r});  // Removed nothing
    REQUIRE(r.difference(Recti({1, 2}, {15, 20})) == std::vector<Recti>());  // Removed everything
    REQUIRE(r.difference(Recti({7, 8}, {9, 10})) == std::vector<Recti>{  // Punched a hole
      Recti({5, 6}, {10, 8}),  // ABC
      Recti({5, 8}, {7, 10}),   // D
      Recti({9, 8}, {10, 10}),   // E
      Recti({5, 10}, {10, 15}),   // FGH
    });
  }
}

TEST_CASE("Rectf", "[point]") {
  Rectf r({5, 6}, {10, 15});
  
  SECTION("Dimensions") {
    REQUIRE(r.top() == 6);
    REQUIRE(r.bottom() == 15);
    REQUIRE(r.left() == 5);
    REQUIRE(r.right() == 10);
    REQUIRE(r.width() == 5);
    REQUIRE(r.height() == 9);
    REQUIRE(r.area() == 45);
    REQUIRE(r.center() == Pointf(7.5f, 10.5f));
    REQUIRE(r.size() == Pointf(5, 9));
  }

  SECTION("Comparison") {
    REQUIRE(r == r);
    REQUIRE(r != Rectf({7, 8}, {9, 10}));
  }

  SECTION("Contains") {
    REQUIRE(r.contains({7, 9}) == true);
    REQUIRE(r.contains({1, 1}) == false);
    REQUIRE(r.contains({6, 1}) == false);

    REQUIRE(r.contains(Rectf({6, 7}, {8, 9})) == true);
    REQUIRE(r.contains(Rectf({5, 6}, {10, 15})) == true);
    REQUIRE(r.contains(Rectf({4, 5}, {9, 10})) == false);
    REQUIRE(r.contains(Rectf({4, 5}, {11, 16})) == false);
  }

  SECTION("Intersects") {
    REQUIRE(r.intersects(Rectf({1, 2}, {3, 4})) == false);
    REQUIRE(r.intersects(Rectf({7, 8}, {9, 10})) == true);
    REQUIRE(r.intersects(Rectf({4, 5}, {9, 10})) == true);
    REQUIRE(r.intersects(Rectf({4, 5}, {11, 16})) == true);
  }

  SECTION("union") {
    REQUIRE(r.union_(Rectf({7, 8}, {9, 10})) == r);
    REQUIRE(r.union_(Rectf({1, 2}, {3, 4})) == Rectf({1, 2}, {10, 15}));
    REQUIRE(r.union_(Rectf({7, 8}, {20, 21})) == Rectf({5, 6}, {20, 21}));
  }

  SECTION("intersection") {
    REQUIRE(r.intersection(Rectf({1, 2}, {3, 4})) == std::nullopt);
    REQUIRE(r.intersection(Rectf({1, 2}, {15, 20})) == r);  // external
    REQUIRE(r.intersection(Rectf({7, 8}, {9, 10})) == Rectf({7, 8}, {9, 10}));  // internal
    REQUIRE(r.intersection(Rectf({4, 5}, {9, 10})) == Rectf({5, 6}, {9, 10}));  // top edge
    REQUIRE(r.intersection(Rectf({7, 8}, {11, 16})) == Rectf({7, 8}, {10, 15}));  // br corner
  }

  SECTION("difference") {
    REQUIRE(r.difference(Rectf({1, 2}, {3, 4})) == std::vector<Rectf>{r});  // Removed nothing
    REQUIRE(r.difference(Rectf({1, 2}, {15, 20})) == std::vector<Rectf>());  // Removed everything
    REQUIRE(r.difference(Rectf({7, 8}, {9, 10})) == std::vector<Rectf>{  // Punched a hole
      Rectf({5, 6}, {10, 8}),  // ABC
      Rectf({5, 8}, {7, 10}),   // D
      Rectf({9, 8}, {10, 10}),   // E
      Rectf({5, 10}, {10, 15}),   // FGH
    });
  }
}
