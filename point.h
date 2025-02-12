
#pragma once

#include <cmath>
#include <optional>
#include <ostream>
#include <vector>

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

  Pointi operator+(const Pointi& o) const { return Pointi(x + o.x, y + o.y); };
  Pointi operator+(int   v) const { return Pointi(x + v, y + v); };
  Pointi operator-(const Pointi& o) const { return Pointi(x - o.x, y - o.y); };
  Pointi operator-(int   v) const { return Pointi(x - v, y - v); };
  Pointi operator*(int   v) const { return Pointi(x * v, y * v); };
  Pointi operator*(float v) const { return Pointi(x * v, y * v); };
};

std::ostream& operator<< (std::ostream& stream, const Pointi& p);


struct Pointf {
  float x, y;

  Pointf() : x(0), y(0) {}
  Pointf(float x_, float y_) : x(x_), y(y_) {}

  bool operator==(const Pointf& o) const { return x == o.x && y == o.y; };
  bool operator!=(const Pointf& o) const { return !(*this == o); };
  bool operator<(const Pointf& o) const { return x != o.x ? x < o.x : y < o.y; };

  Pointf operator+(const Pointf& o) const { return Pointf(x + o.x, y + o.y); };
  Pointf operator+(float v) const { return Pointf(x + v, y + v); }
  Pointf operator-(const Pointf& o) const { return Pointf(x - o.x, y - o.y); };
  Pointf operator-(float v) const { return Pointf(x - v, y - v); }
  Pointf operator*(float v) const { return Pointf(x * v, y * v); }
  Pointf operator/(float v) const { return Pointf(x / v, y / v); }
};

std::ostream& operator<< (std::ostream& stream, const Pointf& p);


struct Recti {
  Pointi tl;
  Pointi br;

  Recti() : tl(0, 0), br(0, 0) {}
  Recti(Pointi tl_, Pointi br_) : tl(tl_), br(br_) {}

  int top() const { return tl.y; }
  int left() const { return tl.x; }
  int bottom() const { return br.y; }
  int right() const { return br.x; }
  int width() const { return br.x - tl.x; }
  int height() const { return br.y - tl.y; }
  int area() const { return width() * height(); }
  Pointi center() const { return Pointi((left() + right()) / 2, (top() + bottom()) / 2); }
  Pointf centerf() const { return Pointf((left() + right()) / 2.0f, (top() + bottom()) / 2.0f); }
  Pointi size() const { return Pointi(width(), height()); }

  bool contains(const Pointi& p) const {
    return left() <= p.x && p.x <= right() && top() <= p.y && p.y <= bottom();
  }

  bool contains(const Recti& o) const {
    return (left() <= o.left() && right() >= o.right() && 
            top() <= o.top() && bottom() >= o.bottom());
  }

  bool intersects(const Recti& o) const {
    return !(left() > o.right() || right() < o.left() || 
             top() > o.bottom() || bottom() < o.top());
  }

  std::optional<Recti> intersection(const Recti& o) const {
    if (!intersects(o)) {
      return std::nullopt;
    }
    return Recti(
      {std::max(left(), o.left()), std::max(top(), o.top())},
      {std::min(right(), o.right()), std::min(bottom(), o.bottom())});
  }

  Recti union_(const Recti& o) const {
    return Recti(
      {std::min(left(), o.left()), std::min(top(), o.top())},
      {std::max(right(), o.right()), std::max(bottom(), o.bottom())});
  }

  std::vector<Recti> difference(const Recti& o) const;

  bool operator==(const Recti& o) const { return tl == o.tl && br == o.br; };
  bool operator!=(const Recti& o) const { return !(*this == o); };
};

std::ostream& operator<<(std::ostream& stream, const Recti& r);


struct Rectf {
  Pointf tl;
  Pointf br;

  Rectf() : tl(0, 0), br(0, 0) {}
  Rectf(Pointf tl_, Pointf br_) : tl(tl_), br(br_) {}
  static Rectf from_center_size(Pointf center, Pointf size) {
    return Rectf(center - size / 2, center + size / 2);
  }

  float top() const { return tl.y; }
  float left() const { return tl.x; }
  float bottom() const { return br.y; }
  float right() const { return br.x; }
  float width() const { return br.x - tl.x; }
  float height() const { return br.y - tl.y; }
  float area() const { return width() * height(); }
  Pointf center() const { return Pointf((left() + right()) / 2, (top() + bottom()) / 2); }
  Pointf size() const { return Pointf(width(), height()); }

  Recti recti() const {
    return Recti({int(std::floor(tl.x)), int(std::floor(tl.y))},
                 {int(std::ceil(br.x)), int(std::ceil(br.y))});
  }

  bool contains(const Pointf& p) const {
    return left() <= p.x && p.x <= right() && top() <= p.y && p.y <= bottom();
  }

  bool contains(const Rectf& o) const {
    return (left() <= o.left() && right() >= o.right() && 
            top() <= o.top() && bottom() >= o.bottom());
  }

  bool intersects(const Rectf& o) const {
    return !(left() > o.right() || right() < o.left() || 
             top() > o.bottom() || bottom() < o.top());
  }

  std::optional<Rectf> intersection(const Rectf& o) const {
    if (!intersects(o)) {
      return std::nullopt;
    }
    return Rectf(
      {std::max(left(), o.left()), std::max(top(), o.top())},
      {std::min(right(), o.right()), std::min(bottom(), o.bottom())});
  }

  Rectf union_(const Rectf& o) const {
    return Rectf(
      {std::min(left(), o.left()), std::min(top(), o.top())},
      {std::max(right(), o.right()), std::max(bottom(), o.bottom())});
  }

  std::vector<Rectf> difference(const Rectf& o) const;

  bool operator==(const Rectf& o) const { return tl == o.tl && br == o.br; };
  bool operator!=(const Rectf& o) const { return !(*this == o); };
};

std::ostream& operator<<(std::ostream& stream, const Rectf& r);
