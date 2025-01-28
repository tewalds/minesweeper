#include <memory>


class KDTree {
 public:
  KDTree();

  struct Value {
    int value;
    union {
      int coords[2];
      struct { int x, y; };
    };
  };

  bool empty() const;
  int size() const;
  void clear();

  bool insert(Value v);
  bool remove(int x, int y);
  Value find_closest(int x, int y);
  Value pop_closest(int x, int y);
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

  static int distance(const int a[2], const int b[2]) {
    return std::abs(a[0] - b[0]) + std::abs(a[1] - b[1]);  // manhattan distance
    // return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]);
  }

  bool insert(std::unique_ptr<Node> &node, const Value &v, int depth);
  bool remove(std::unique_ptr<Node> &node, int coords[]);
  void find_closest(
      std::unique_ptr<Node> *node, int coords[], int &best_dist,
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
