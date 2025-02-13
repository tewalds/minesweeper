
#pragma once

#include <ostream>
#include <memory>
#include <vector>

#include "point.h"

class KDTree {
 public:
  KDTree();

  struct Value {
    int value;
    Pointi p;

    bool operator==(const Value& o) const = default;
    bool operator!=(const Value& o) const = default;
  };

 private:
  struct Node {
    Value value;
    int depth;
    std::unique_ptr<Node> children[2];

    Node(Value v, int d) : value(v), depth(d) {}
  };

 public:
  class Iterator {
   public:
    using iterator_category = std::input_iterator_tag;
    using value_type = Value;
    using pointer = Value*;
    using reference = Value&;
    using difference_type = std::ptrdiff_t;

    Iterator();
    Iterator(const Node* n);

    const Value& operator*() const;
    const Value* operator->() const;
    Iterator& operator++();
    Iterator operator++(int);
    bool operator==(const Iterator&) const = default;
    bool operator!=(const Iterator&) const = default;
   private:
    std::vector<const Node*> stack;
  };
  typedef const Iterator const_iterator;

  bool empty() const;
  int size() const;
  void clear();

  Iterator begin() const;
  Iterator end() const;

  bool insert(Value v);
  bool remove(Pointi p);
  bool exists(Pointi p) const;
  std::optional<Value> find(Pointi p) const;
  Value find_closest(Pointi p);
  Value pop_closest(Pointi p);

  void print_tree(std::ostream& stream = std::cout) const;
  bool validate() const;

  void rebalance();
  std::string balance_str() const;
  int depth_max() const;
  float depth_avg() const;
  double depth_stddev() const;
  float balance_factor() const;

 private:
  std::unique_ptr<Node> root;
  int count;
  int sum_depth;

  static int distance(Pointi a, Pointi b) {
    return std::abs(a.x - b.x) + std::abs(a.y - b.y);  // manhattan distance
    // return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  }

  void find_closest(
      std::unique_ptr<Node> *node, Pointi p, int &best_dist,
      std::unique_ptr<Node> *&best_node) const;

  void find_leftmost_along_axis(
      std::unique_ptr<Node> *node, int coord, int axis, int &best_dist,
      std::unique_ptr<Node> *&best_node) const;
  void remove_node(std::unique_ptr<Node> &node);

  void print_tree(std::ostream& stream, const Node* node, std::string prefix, bool first) const;
  void validate(const Node* node, int depth, Pointi min, Pointi max) const;

  int depth_max(const Node* node) const;
  int sum_node_depth(const Node* node) const;
  int leaf_count(const Node* node) const;
  std::pair<int, double> depth_variance(Node *node) const;

  void collect_values(std::unique_ptr<Node> &node, std::vector<Value> &values);
  std::unique_ptr<Node> build_balanced_tree(std::vector<Value>::iterator start, std::vector<Value>::iterator end, int depth);
};

std::ostream& operator<<(std::ostream& stream, const KDTree::Value& v);
std::ostream& operator<<(std::ostream& stream, const KDTree& t);
