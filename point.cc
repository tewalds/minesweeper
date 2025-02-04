
#include "point.h"

std::ostream& operator<< (std::ostream& stream, const Pointi& p) {
  return stream << "{" << p.x << ", " << p.y << "}";
}


std::ostream& operator<< (std::ostream& stream, const Pointf& p) {
  return stream << "{" << p.x << ", " << p.y << "}";
}
