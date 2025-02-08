#include <algorithm>
#include <bit>
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <memory>
#include <vector>

#include "absl/strings/str_format.h"

#include "kdtree.h"


std::ostream& operator<< (std::ostream& stream, const KDTree::Value& v) {
  return stream << "Value(" << v.value << ", {" << v.p.x << ", " << v.p.y << "})";
}


KDTree::KDTree() : root(nullptr), count(0), sum_depth(0) {}

bool KDTree::empty() const {
  return root == nullptr;
}

int KDTree::size() const {
  return count;
}

void KDTree::clear() {
  root.reset();
  count = 0;
}

KDTree::Iterator KDTree::begin() const {
  return KDTree::Iterator(root.get());
}
KDTree::Iterator KDTree::end() const {
  return KDTree::Iterator();
}

KDTree::Iterator::Iterator() {}
KDTree::Iterator::Iterator(const KDTree::Node* n) {
  stack.push_back(n);
}

const KDTree::Value& KDTree::Iterator::operator*() const {
  assert(!stack.empty());
  return stack.back()->value;
}
const KDTree::Value* KDTree::Iterator::operator->() const {
  assert(!stack.empty());
  return &stack.back()->value;
}

KDTree::Iterator& KDTree::Iterator::operator++() {
  assert(!stack.empty());
  const Node* node = stack.back();
  stack.pop_back();
  if (node->children[1]) {
    stack.push_back(node->children[1].get());
  }
  if (node->children[0]) {
    stack.push_back(node->children[0].get());
  }
  return *this;
}
KDTree::Iterator KDTree::Iterator::operator++(int){
  auto tmp = *this;
  ++*this;
  return tmp;
}


bool KDTree::insert(Value v) {
  std::unique_ptr<Node>* node = &root;
  int depth = 0;
  while (*node) {
    if ((*node)->value.p == v.p) {
      return false; // Value already exists
    }
    int axis = depth % 2;
    int child = (v.p.coords[axis] < (*node)->value.p.coords[axis] ? 0 : 1);
    node = &(*node)->children[child];
    depth += 1;
  }
  *node = std::make_unique<Node>(v, depth);
  count += 1;
  sum_depth += depth;

  if (sum_depth > std::bit_width((unsigned)count) * count + 1) {
    // `bit_width(count)` is the max depth for a complete balanced tree.
    // `sum_depth / count` is the average depth, which should be a 1-2 less than the
    // max for a balanced tree, but will exceed that if it's suffiently unbalanced.
    // Move `/ count` to the other side to avoid division, in particular by 0.
    // There may be better metrics for how balanced a tree is, but this one is cheap
    // and easy to compute incrementally and seems to work.
    rebalance();
  }

  return true;
}

bool KDTree::remove(Pointi p) {
  std::unique_ptr<Node>* node = &root;
  while (*node) {
    if ((*node)->value.p == p) {
      remove_node(*node);
      return true;
    }
    int axis = (*node)->depth % 2;
    int child = (p.coords[axis] < (*node)->value.p.coords[axis] ? 0 : 1);
    node = &(*node)->children[child];
  }
  return false;
}

bool KDTree::exists(Pointi p) const {
  return bool(find(p));
}

std::optional<KDTree::Value> KDTree::find(Pointi p) const {
  Node* node = root.get();
  while (node) {
    if (node->value.p == p) {
      return node->value;
    }
    int axis = node->depth % 2;
    int child = (p.coords[axis] < node->value.p.coords[axis] ? 0 : 1);
    node = node->children[child].get();
  }
  return {};
}

KDTree::Value KDTree::find_closest(Pointi p) {
  assert(root != nullptr);
  std::unique_ptr<Node> *best_node = nullptr;
  int best_dist = std::numeric_limits<int>::max();
  find_closest(&root, p, best_dist, best_node);
  assert(best_node);
  return (*best_node)->value;
}

void KDTree::find_closest(
    std::unique_ptr<Node> *node, Pointi p, int &best_dist,
    std::unique_ptr<Node> *&best_node) const {
  if (!*node) {
    return;
  }

  int dist = distance(p, (*node)->value.p);
  if (dist < best_dist) {
    best_dist = dist;
    best_node = node;
  }

  int axis = (*node)->depth % 2;
  int search_first = (p.coords[axis] < (*node)->value.p.coords[axis]) ? 0 : 1;
  find_closest(&(*node)->children[search_first], p, best_dist, best_node);
  if (std::abs(p.coords[axis] - (*node)->value.p.coords[axis]) < best_dist) {
    find_closest(&(*node)->children[!search_first], p, best_dist, best_node);
  }
}

void KDTree::find_leftmost_along_axis(
    std::unique_ptr<Node> *node, int coord, int axis, int &best_dist,
    std::unique_ptr<Node> *&best_node) const {
  if (!*node) {
    return;
  }

  int dist = (*node)->value.p.coords[axis] - coord;
  if (dist < best_dist ||
      (dist == best_dist && (!best_node || (*node)->depth > (*best_node)->depth))) {
    // Prioritizing the deepest means less cascading of intermediate nodes being replaced
    // by deeper nodes, or rebuilding a smaller tree.
    best_dist = dist;
    best_node = node;
  }

  find_leftmost_along_axis(&(*node)->children[0], coord, axis, best_dist, best_node);
  if (axis != (*node)->depth % 2) {
    // No need to search the right side if we're searching along the axis as they have
    // values greater or equal than this node. It's plausible there's a deeper node with
    // equal value, but it's probably not worth the effort to search for. We do need to
    // search the right side for off-axis levels as we make no claim about them.
    find_leftmost_along_axis(&(*node)->children[1], coord, axis, best_dist, best_node);
  }
}

void KDTree::remove_node(std::unique_ptr<Node> &node) {
  if (!node) {
    return;
  } else if (node->children[1]) {
    // It is valid to replace this node with any of the leftmost nodes in the right subtree.
    // There may be multiple leftmost nodes, but any will do as they will all sort to the
    // right of any of the others.
    std::unique_ptr<Node> *best_node = nullptr;
    int best_dist = std::numeric_limits<int>::max();
    int axis = node->depth % 2;
    int coord = node->value.p.coords[axis];
    find_leftmost_along_axis(&node->children[1], coord, axis, best_dist, best_node);

    // If there is a right subtree, there will be a left-most node with value >= this one.
    assert(best_dist >= 0);
    assert(best_node);

    node->value = (*best_node)->value;
    remove_node(*best_node);
    return;
  } else if (node->children[0]) {
    // It is NOT valid to replace this node with the rightmost node of the left subtree,
    // as promoting that node would break the invariant for all nodes that have a value
    // equal to it along that axis, so they'd need to move from the left subtree to the
    // right subtree. Finding/moving all of those would be a pain, so just rebuild instead.
    int depth = node->depth;
    sum_depth -= depth;
    count -= 1;
    std::vector<Value> values;
    // Skip collecting this node as it's being removed.
    collect_values(node->children[0], values);
    assert(!node->children[1]);  // Otherwise we'd have replaced this node above.
    node = build_balanced_tree(values.begin(), values.end(), depth);
    return;
  } else {
    // A leaf node can just be removed.
    sum_depth -= node->depth;
    count -= 1;
    node.reset();
    return;
  }
}

KDTree::Value KDTree::pop_closest(Pointi p) {
  assert(root != nullptr);
  std::unique_ptr<Node> *best_node = nullptr;
  int best_dist = std::numeric_limits<int>::max();
  find_closest(&root, p, best_dist, best_node);
  assert(best_node);
  Value out = (*best_node)->value;
  remove_node(*best_node);
  return out;
}

void KDTree::print_tree(std::ostream& stream) const {
  if (root) {
    stream << root->value << std::endl;
    print_tree(stream, root->children[0].get(), "", true);
    print_tree(stream, root->children[1].get(), "", false);
  }
}

std::ostream& operator<<(std::ostream& stream, const KDTree& t) {
  t.print_tree(stream);
  return stream;
}

void KDTree::print_tree(std::ostream& stream, const Node* node, std::string prefix, bool first) const {
  if (!node) {
    return;
  }
  stream << prefix << (first ? "├─" : "└─") << node->value << std::endl;
  prefix += (first ? "│ " : "  ");
  print_tree(stream, node->children[0].get(), prefix, true);
  print_tree(stream, node->children[1].get(), prefix, false);
}

bool KDTree::validate() const {
  int min = std::numeric_limits<int>::min();
  int max = std::numeric_limits<int>::max();
  validate(root.get(), 0, Pointi(min, min), Pointi(max, max));
  return true;
}
void KDTree::validate(const Node* node, int depth, Pointi min, Pointi max) const {
  if (!node) {
    return;
  }
   
  // Assert instead of return false so that gdb will give a backtrace.
  assert(node->depth == depth);
  assert(node->value.p.x >= min.x);
  assert(node->value.p.y >= min.y);
  assert(node->value.p.x < max.x);
  assert(node->value.p.y < max.y);

  if (depth % 2 == 0) {
    validate(
        node->children[0].get(), depth + 1,
        Pointi(min.x, min.y), Pointi(node->value.p.x, max.y));
    validate(
        node->children[1].get(), depth + 1,
        Pointi(node->value.p.x, min.y), Pointi(max.x, max.y));
  } else {
    validate(
        node->children[0].get(), depth + 1,
        Pointi(min.x, min.y), Pointi(max.x, node->value.p.y));
    validate(
        node->children[1].get(), depth + 1,
        Pointi(min.x, node->value.p.y), Pointi(max.x, max.y));
  }
}

void KDTree::collect_values(std::unique_ptr<Node> &node, std::vector<Value> &values) {
  if (!node) {
    return;
  }
  values.push_back(node->value);
  collect_values(node->children[0], values);
  collect_values(node->children[1], values);
  sum_depth -= node->depth;
  count -= 1;
  node.reset();
}

void KDTree::rebalance() {
  if (!root) {
    return;
  }

  // std::cout << "before " << balance_str() << std::endl;

  std::vector<Value> values;
  values.reserve(count);
  collect_values(root, values);

  assert(!root);
  assert(sum_depth == 0);
  assert(count == 0);

  root = build_balanced_tree(values.begin(), values.end(), 0);
  assert(values.size() == size());

  // std::cout << "after  " << balance_str() << std::endl;
}

std::unique_ptr<KDTree::Node> KDTree::build_balanced_tree(
    std::vector<Value>::iterator start, std::vector<Value>::iterator end, int depth) {
  if (start == end) {
    return nullptr;
  }

  int axis = depth % 2;

  // Choose the pivot.
  std::vector<Value>::iterator mid = std::next(start, std::distance(start, end) / 2);
  // Find the pivot value
  std::nth_element(start, mid, end, [axis](const Value &a, const Value &b) {
      return a.p.coords[axis] < b.p.coords[axis]; });
  Value pivot = *mid;
  // Find the pivot's true location, as it has to be the first of that value.
  mid = std::partition(start, mid, [axis, pivot](const Value& a) {
      return a.p.coords[axis] < pivot.p.coords[axis]; });

  auto node = std::make_unique<Node>(*mid, depth);
  sum_depth += depth;
  count += 1;
  node->children[0] = build_balanced_tree(start, mid, depth + 1);
  node->children[1] = build_balanced_tree(mid + 1, end, depth + 1);

  return node;
}

std::string KDTree::balance_str() const {
  return absl::StrFormat(
      "size: %i, max depth: %i, avg depth: %.3f, std dev: %.3f, balance: %.3f",
      size(), depth_max(), depth_avg(), depth_stddev(), balance_factor());
}

int KDTree::depth_max() const {
  return depth_max(root.get());
}
int KDTree::depth_max(const Node* node) const {
  if (!node) {
    return 0;
  }
  return std::max({
    node->depth,
    depth_max(node->children[0].get()),
    depth_max(node->children[1].get())
  });
}

float KDTree::depth_avg() const {
  if (count > 0) {
    return float(sum_depth) / count;
    // return float(sum_node_depth(root.get())) / count;
  } else {
    return 0;
  }
}
int KDTree::sum_node_depth(const Node* node) const {
  if (!node) {
    return 0;
  } else {
    return (sum_node_depth(node->children[0].get()) + 
            sum_node_depth(node->children[1].get()) + node->depth);
  }
}

float KDTree::balance_factor() const {
  if (count == 0) {
    return 1;
  } else {
    int leaves = leaf_count(root.get());
    return 2.0 * leaves / count;
  }
}

int KDTree::leaf_count(const Node* node) const {
  if (!node) {
    return 0;
  } else if (!node->children[0] && !node->children[1]) {
    return 1;
  } else {
    return (leaf_count(node->children[0].get()) + 
            leaf_count(node->children[1].get()));
  }
}

double KDTree::depth_stddev() const {
  if (count > 0) {
    auto [_, variance] = depth_variance(root.get());
    return std::sqrt(variance / count);
  } else {
    return 0;
  }
}

std::pair<int, double> KDTree::depth_variance(Node *node) const {
  if (!node) return {0, 0.0};

  auto [left_height, left_variance] = depth_variance(node->children[0].get());
  auto [right_height, right_variance] = depth_variance(node->children[1].get());

  int height = std::max(left_height, right_height) + 1;
  int height_diff = left_height - right_height;
  double variance = left_variance + right_variance + height_diff * height_diff;
  return {height, variance};
}
