
#pragma once

#include "point.h"

class Neighbors {
 public:
  Neighbors(Pointi p, Pointi dims) : count(0) {
    int xm = p.x - 1;
    int xp = p.x + 1;
    int ym = p.y - 1;
    int yp = p.y + 1;
    if (xm >= 0) {
      if (ym >= 0)
        neighbors_[count++] = {xm, ym};
      neighbors_[count++] = {xm, p.y};
      if (yp < dims.y)
        neighbors_[count++] = {xm, yp};
    }
    if (ym >= 0)
      neighbors_[count++] = {p.x, ym};
    neighbors_[count++] = {p.x, p.y};
    if (yp < dims.y)
      neighbors_[count++] = {p.x, yp};
    if (xp < dims.x) {
      if (ym >= 0)
        neighbors_[count++] = {xp, ym};
      neighbors_[count++] = {xp, p.y};
      if (yp < dims.y)
        neighbors_[count++] = {xp, yp};
    }
  }

  Pointi* begin() { return neighbors_; }
  Pointi* end()   { return neighbors_ + count; }

 private:
  Pointi neighbors_[9];
  int count;
};


template<class T>
class Array2D {
 public:
  Array2D(Pointi dims) : dims_(dims) {
    array.resize(dims_.x * dims_.y);
  }

  T& operator[](Pointi p) {                return array[p.y * dims_.x + p.x]; }
  const T& operator[](Pointi p) const {    return array[p.y * dims_.x + p.x]; }
  T& operator()(int x, int y) {             return array[y * dims_.x + x]; }
  const T& operator()(int x, int y) const { return array[y * dims_.x + x]; }

  void fill(const T& v) {
    for (int i = 0; i < dims_.x * dims_.y; i++) {
      array[i] = v;
    }
  }
  int width() const { return dims_.x; }
  int height() const { return dims_.y; }
  Pointi dims() const { return dims_; }
  int size() const { return dims_.x * dims_.y; }

 private:
  Pointi dims_;
  std::vector<T> array;
};


enum CellState {
  ZERO = 0,
  ONE = 1,
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
  SIX = 6,
  SEVEN = 7,
  EIGHT = 8,
  BOMB = 9,
  HIDDEN = 10,
  MARKED = 11,
};

enum ActionType {
  PASS,
  OPEN, 
  MARK,

  RESET,
  PAUSE,
  QUIT,
};

struct Action {
  ActionType action;
  Pointi point;
  int user;
  bool operator==(const Action&) const = default;
  bool operator!=(const Action&) const = default;
};

struct Update {
  CellState state;
  Pointi point;
  int user;
};
