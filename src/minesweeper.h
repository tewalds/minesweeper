
#pragma once

#include "point.h"

class Neighbors {
 public:
  Neighbors(Pointi p, Pointi dims, bool center) : count_(0) {
    int xm = p.x - 1;
    int xp = p.x + 1;
    int ym = p.y - 1;
    int yp = p.y + 1;
    if (xm >= 0) {
      if (ym >= 0)
        neighbors_[count_++] = {xm, ym};
      neighbors_[count_++] = {xm, p.y};
      if (yp < dims.y)
        neighbors_[count_++] = {xm, yp};
    }
    if (ym >= 0)
      neighbors_[count_++] = {p.x, ym};
    if (center)
      neighbors_[count_++] = {p.x, p.y};
    if (yp < dims.y)
      neighbors_[count_++] = {p.x, yp};
    if (xp < dims.x) {
      if (ym >= 0)
        neighbors_[count_++] = {xp, ym};
      neighbors_[count_++] = {xp, p.y};
      if (yp < dims.y)
        neighbors_[count_++] = {xp, yp};
    }
  }

  Pointi* begin() { return neighbors_; }
  Pointi* end()   { return neighbors_ + count_; }
  int size() const { return count_; }

 private:
  Pointi neighbors_[9];
  int count_;
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
  Recti rect() const { return Recti({0, 0}, dims_); }
  int size() const { return dims_.x * dims_.y; }

 private:
  Pointi dims_;
  std::vector<T> array;
};


enum CellState : int8_t {
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

  SCORE_ZERO = 16,
  SCORE_ONE = 17,
  SCORE_TWO = 18,
  SCORE_THREE = 19,
  SCORE_FOUR = 20,
  SCORE_FIVE = 21,
  SCORE_SIX = 22,
  SCORE_SEVEN = 23,
  SCORE_EIGHT = 24,
};
static_assert(sizeof(CellState) == 1, "CellState must be one byte");


class Env;
class FakeEnv;

class Cell {
 public:

 // This constructor is only useful for initializing a vector of Cells. All must be replaced by Env.
  Cell() : state_(ZERO), bomb_(false), neighbors_(0), cleared_(0), marked_(0), user_(0) {}

  CellState state() const { return state_; }
  int8_t neighbors() const { return neighbors_; }  // Num neighbors.
  int8_t neighbors_cleared() const { return cleared_; }  // that are opened and not a bomb.
  int8_t neighbors_marked() const { return marked_; }  // that are marked or a bomb.
  int8_t neighbors_hidden() const { return neighbors_ - cleared_ - marked_; }  // that are hidden.
  bool complete() const {  // All hidden can be marked. Doesn't make sense on bombs/hidden/marked.
    int count = state_ & ~SCORE_ZERO;
    return count <= EIGHT && neighbors_ == cleared_ + count;
  }
  int user() const { return user_; }

 private:
  Cell(int neighbors, bool bomb = false)
      : state_(HIDDEN), bomb_(bomb), neighbors_(neighbors), cleared_(0), marked_(0), user_(0) {}
  bool bomb() const { return bomb_; }  // The ground truth, only visible to Env.

  CellState state_;
  bool bomb_ : 1;
  int neighbors_ : 7;
  int8_t cleared_;
  int8_t marked_;
  int user_;

  friend Env;
  friend FakeEnv;
 };
 static_assert(sizeof(Cell) == 8, "Cell should pack nicely.");


enum ActionType : int8_t {
  PASS,
  OPEN,
  MARK,
  UNMARK,

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
