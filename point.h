
#pragma once

#include <ostream>

struct Pointi {
  union {
    struct { int x, y; };
    int coords[2];
  };

  Pointi() : x(0), y(0) {}
  Pointi(int x_, int y_) : x(x_), y(y_) {}

  bool operator==(const Pointi& o) const { return x == o.x && y == o.y; };
  bool operator!=(const Pointi& o) const { return !(*this == o); };
  bool operator<(const Pointi& o) const { return x != o.x ? x < o.x : y < o.y; };
};

std::ostream& operator<< (std::ostream& stream, const Pointi& p);


struct Pointf {
  float x, y;

  Pointf() : x(0), y(0) {}
  Pointf(float x_, float y_) : x(x_), y(y_) {}

  bool operator==(const Pointf& o) const { return x == o.x && y == o.y; };
  bool operator!=(const Pointf& o) const { return !(*this == o); };
  bool operator<(const Pointf& o) const { return x != o.x ? x < o.x : y < o.y; };
};

std::ostream& operator<< (std::ostream& stream, const Pointf& p);
