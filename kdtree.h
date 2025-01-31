#include <memory>

#include "point.h"

class KDTree {
 public:
  KDTree();

  struct Value {
    int value;
    Pointi p;
  };

  bool empty() const;
  int size() const;
  void clear();

  bool insert(Value v);
  bool remove(Pointi p);
  Value find_closest(Pointi p);
  Value pop_closest(Pointi p);
  void print_tree() const;
  bool validate() const;
  void rebalance();
  int depth_max() const;
  float depth_avg() const;
  float balance_factor() const;
  double depth_stddev() const;

 private:
  struct Node {
    Value value;
    int depth;
    std::unique_ptr<Node> children[2];

    Node(Value v, int d) : value(v), depth(d) {}
  };
  std::unique_ptr<Node> root;
  int count;
  int sum_depth;

  static int distance(Pointi a, Pointi b) {
    return std::abs(a.x - b.x) + std::abs(a.y - b.y);  // manhattan distance
    // return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  }

  bool insert(std::unique_ptr<Node> &node, const Value &v, int depth);
  bool remove(std::unique_ptr<Node> &node, Pointi p);
  void find_closest(
      std::unique_ptr<Node> *node, Pointi p, int &best_dist,
      std::unique_ptr<Node> *&best_node) const;
  void find_closest_along_axis(
      std::unique_ptr<Node> *node, int coord, int axis, int &best_dist,
      std::unique_ptr<Node> *&best_node) const;
  void remove_node(std::unique_ptr<Node> &node);
  void print_tree(const Node* node, int depth) const;
  bool validate(const Node* node, int depth) const;
  int depth_max(const Node* node) const;
  int sum_node_depth(const Node* node) const;
  int leaf_count(const Node* node) const;
  std::pair<int, double> depth_variance(Node *node) const;
  void collect_values(Node *node, std::vector<Value> &values);
  std::unique_ptr<Node> build_balanced_tree(std::vector<Value> &values, int depth, int start, int end);
};
