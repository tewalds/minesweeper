
#include "point.h"

std::ostream& operator<< (std::ostream& stream, const Pointi& p) {
  return stream << "{" << p.x << ", " << p.y << "}";
}


std::ostream& operator<< (std::ostream& stream, const Pointf& p) {
  return stream << "{" << p.x << ", " << p.y << "}";
}

std::ostream& operator<<(std::ostream& stream, const Recti& r) {
  return stream << "{" << r.tl << ", " << r.br << "}";
}

std::ostream& operator<<(std::ostream& stream, const Rectf& r) {
  return stream << "{" << r.tl << ", " << r.br << "}";
}

std::vector<Recti> Recti::difference(const Recti& o) const {
  // Read as: this - other.
  // +---+---+---+
  // | A | B | C |
  // +---+---+---+
  // | D |   | E |
  // +---+---+---+
  // | F | G | H |
  // +---+---+---+
  // There are a few cases:
  // - No intersection: That is just this.
  // - All corners of this inside other: That leaves nothing left.
  // - All corners of other inside this: We need to return four sides and four corners, and the 
  //   corners can be merged into the sides, so will be four rects.
  // - One corner of other inside this: we need to return two sides and a corner, and the corner 
  //   can be merged with one of the sides.
  // - Two corners of other inside this: we need to return three sides and two corners. The 
  //   corners can be merged into one of the sides.
  // - Two corners of this inside other: we need to return a single side.
  // Because the corners can always be merged with the sides, we can treat this as max four 
  // rects: ABC, D, E, FGH, where the corners may be dropped as necessary.

  std::vector<Recti> result;
  if (o.contains(*this)) {
    return result;
  }
  std::optional<Recti> inner = intersection(o);  // Defines the hole in the middle above.
  if (!inner || o.area() == 0) {
    result.push_back(*this);  // No intersection, so nothing to subtract.
    return result;
  }
  if (top() < inner->top()) {
    result.push_back(Recti(tl, {right(), inner->top()}));  // ABC
  }
  if (left() < inner->left()) {
    result.push_back(Recti({left(), inner->top()}, {inner->left(), inner->bottom()}));  // D
  }
  if (right() > inner->right()) {
    result.push_back(Recti({inner->right(), inner->top()}, {right(), inner->bottom()}));  // E
  }
  if (bottom() > inner->bottom()) {
    result.push_back(Recti({left(), inner->bottom()}, br));  // FGH
  }
  return result;
}

std::vector<Rectf> Rectf::difference(const Rectf& o) const {
  // Read as: this - other.
  // +---+---+---+
  // | A | B | C |
  // +---+---+---+
  // | D |   | E |
  // +---+---+---+
  // | F | G | H |
  // +---+---+---+
  // There are a few cases:
  // - No intersection: That is just this.
  // - All corners of this inside other: That leaves nothing left.
  // - All corners of other inside this: We need to return four sides and four corners, and the 
  //   corners can be merged into the sides, so will be four rects.
  // - One corner of other inside this: we need to return two sides and a corner, and the corner 
  //   can be merged with one of the sides.
  // - Two corners of other inside this: we need to return three sides and two corners. The 
  //   corners can be merged into one of the sides.
  // - Two corners of this inside other: we need to return a single side.
  // Because the corners can always be merged with the sides, we can treat this as max four 
  // rects: ABC, D, E, FGH, where the corners may be dropped as necessary.

  std::vector<Rectf> result;
  if (o.contains(*this)) {
    return result;
  }
  std::optional<Rectf> inner = intersection(o);  // Defines the hole in the middle above.
  if (!inner || o.area() == 0) {
    result.push_back(*this);  // No intersection, so nothing to subtract.
    return result;
  }
  if (top() < inner->top()) {
    result.push_back(Rectf(tl, {right(), inner->top()}));  // ABC
  }
  if (left() < inner->left()) {
    result.push_back(Rectf({left(), inner->top()}, {inner->left(), inner->bottom()}));  // D
  }
  if (right() > inner->right()) {
    result.push_back(Rectf({inner->right(), inner->top()}, {right(), inner->bottom()}));  // E
  }
  if (bottom() > inner->bottom()) {
    result.push_back(Rectf({left(), inner->bottom()}, br));  // FGH
  }
  return result;
}