#include <algorithm>
#include <bit>
#include <cassert>
#include <cmath>
#include <iostream>
#include <limits>
#include <memory>
#include <vector>

#include "kdtree.h"


std::ostream& operator<< (std::ostream& stream, const KDTree::Value& v) {
  return stream << "Value(" << v.value << ", " << v.x << ", " << v.y << ")";
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

bool KDTree::insert(Value v) {
  if (sum_depth > std::bit_width((unsigned)count) * count) {
    // `bit_width(count)` is the max depth for a complete balanced tree.
    // `sum_depth / count` is the average depth, which should be a 1-2 less than the max for a
    // balanced tree, but will exceed that if it's suffiently unbalanced.
    // Move `/ count` to the other side to avoid division, in particular by 0.
    // There may be better metrics for how balanced a tree is, but this one is cheap and easy to
    // compute incrementally and seems to work.
    rebalance();
  }
  return insert(root, v, 0);
}

bool KDTree::insert(std::unique_ptr<Node> &node, const Value &v, int depth) {
  if (!node) {
    node = std::make_unique<Node>(v, depth);
    count += 1;
    sum_depth += depth;
    return true;
  }

  if (node->value.coords[0] == v.coords[0] && 
      node->value.coords[1] == v.coords[1]) {
    return false;  // Value already exists at this location
  }

  int axis = depth % 2;
  if (v.coords[axis] < node->value.coords[axis]) {
    return insert(node->children[0], v, depth + 1);
  } else {
    return insert(node->children[1], v, depth + 1);
  }
}

bool KDTree::remove(int x, int y) {
  int coords[2] = {x, y};
  return remove(root, coords);
}

bool KDTree::remove(std::unique_ptr<Node> &node, int coords[]) {
  if (!node) {
    return false;
  }

  if (node->value.coords[0] == coords[0] && 
      node->value.coords[1] == coords[1]) {
    remove_node(node);
    return true;
  }

  int axis = node->depth % 2;
  if (coords[axis] < node->value.coords[axis]) {
    return remove(node->children[0], coords);
  } else {
    return remove(node->children[1], coords);
  }
}

KDTree::Value KDTree::find_closest(int x, int y) {
  assert(root != nullptr);
  int coords[2] = {x, y};
  std::unique_ptr<Node> *best_node = nullptr;
  int best_dist = std::numeric_limits<int>::max();
  find_closest(&root, coords, best_dist, best_node);
  assert(best_node);
  return (*best_node)->value;
}

void KDTree::find_closest(
    std::unique_ptr<Node> *node, int coords[], int &best_dist,
    std::unique_ptr<Node> *&best_node) const {
  if (!*node) return;

  int dist = distance(coords, (*node)->value.coords);
  // std::cout << "dist: " << dist << " " << (*node)->value << "\n";
  if (dist < best_dist) {
    best_dist = dist;
    best_node = node;
  }

  int axis = (*node)->depth % 2;
  int search_first = (coords[axis] < (*node)->value.coords[axis]) ? 0 : 1;
  find_closest(&(*node)->children[search_first], coords, best_dist, best_node);
  if (std::abs(coords[axis] - (*node)->value.coords[axis]) < best_dist) {
    find_closest(&(*node)->children[!search_first], coords, best_dist, best_node);
  }
}

void KDTree::find_closest_along_axis(
    std::unique_ptr<Node> *node, int coord, int axis, int &best_dist,
    std::unique_ptr<Node> *&best_node) const {
  if (!*node) return;

  int dist = std::abs(coord - (*node)->value.coords[axis]);
  if (dist < best_dist) {
    best_dist = dist;
    best_node = node;
  }

  if (axis == (*node)->depth % 2) {
    int first = (coord < (*node)->value.coords[axis]) ? 0 : 1;
    find_closest_along_axis(&(*node)->children[first], coord, axis, best_dist, best_node);
    if (std::abs(coord - (*node)->value.coords[axis]) < best_dist) {
      find_closest_along_axis(&(*node)->children[!first], coord, axis, best_dist, best_node);
    }
  } else {
    find_closest_along_axis(&(*node)->children[0], coord, axis, best_dist, best_node);
    find_closest_along_axis(&(*node)->children[1], coord, axis, best_dist, best_node);
  }
}

void KDTree::remove_node(std::unique_ptr<Node> &node) {
  if (!node) {
    return;
  }
  if (!node->children[0] && !node->children[1]) {
    // A leaf node can just be removed.
    sum_depth -= node->depth;
    count -= 1;
    node.reset();
    return;
  }

  std::unique_ptr<Node> *best_node = nullptr;
  int best_dist = std::numeric_limits<int>::max();

  // An interior node needs to be replaced by a node that keeps the rest of the tree valid.
  // In practice that means finding the next node that keeps the same split along the same axis.
  // It may be valid to singly recurse here, but that would likely lead to less balanced trees.
  int axis = node->depth % 2;
  int coord = node->value.coords[axis];
  find_closest_along_axis(&node->children[0], coord, axis, best_dist, best_node);
  find_closest_along_axis(&node->children[1], coord, axis, best_dist, best_node);

  assert(best_node);
  node->value = (*best_node)->value;
  remove_node(*best_node);
}

KDTree::Value KDTree::pop_closest(int x, int y) {
  assert(root != nullptr);
  int coords[2] = {x, y};
  std::unique_ptr<Node> *best_node = nullptr;
  int best_dist = std::numeric_limits<int>::max();
  find_closest(&root, coords, best_dist, best_node);
  assert(best_node);
  Value out = (*best_node)->value;
  remove_node(*best_node);
  return out;
}

void KDTree::print_tree() const {
  print_tree(root.get(), 0);
}

void KDTree::print_tree(const Node* node, int depth) const {
  if (!node) {
    return;
  } 
  for (int i = 0; i < depth; i++) {
    std::cout << "  ";
  }
  std::cout << node->value << std::endl;
  print_tree(node->children[0].get(), depth + 1);
  print_tree(node->children[1].get(), depth + 1);
}

bool KDTree::validate() const {
  return validate(root.get(), 0);
}
bool KDTree::validate(const Node* node, int depth) const {
  if (!node) {
    return true;
  }
  if (node->depth != depth) {
    return false;
  }

  int axis = depth % 2;
  if (node->children[0] && node->value.coords[axis] < node->children[0]->value.coords[axis]) {
    return false;
  }
  if (node->children[1] && node->value.coords[axis] > node->children[1]->value.coords[axis]) {
    return false;
  }
  if (!validate(node->children[0].get(), depth + 1)) {
    return false;
  }
  if (!validate(node->children[1].get(), depth + 1)) {
    return false;
  }
  return true;
}

void KDTree::rebalance() {
    if (!root) {
      return;
    }

    std::cout << "before size: " << size()
              << " max depth: " << depth_max()
              << " avg depth: " << depth_avg()
              << " std dev: " << depth_stddev()
              << " balance: " << balance_factor() << std::endl;

    std::vector<Value> values;
    collect_values(root.get(), values);
    root.reset();

    sum_depth = 0;
    root = build_balanced_tree(values, 0, 0, values.size() - 1);

    std::cout << "after  size: " << size()
              << " max depth: " << depth_max()
              << " avg depth: " << depth_avg()
              << " std dev: " << depth_stddev()
              << " balance: " << balance_factor() << std::endl;
}

void KDTree::collect_values(Node *node, std::vector<Value> &values) {
    if (!node) {
      return;
    }
    values.push_back(node->value);
    collect_values(node->children[0].get(), values);
    collect_values(node->children[1].get(), values);
}

std::unique_ptr<KDTree::Node> KDTree::build_balanced_tree(
    std::vector<Value> &values, int depth, int start, int end) {
  if (start > end) return nullptr;

  int axis = depth % 2;
  int mid = start + (end - start) / 2;

  std::nth_element(
      values.begin() + start, values.begin() + mid, values.begin() + end + 1,
      [axis](const Value &a, const Value &b) { return (axis == 0 ? a.x < b.x : a.y < b.y); });

  auto node = std::make_unique<Node>(values[mid], depth);
  sum_depth += depth;
  node->children[0] = build_balanced_tree(values, depth + 1, start, mid - 1);
  node->children[1] = build_balanced_tree(values, depth + 1, mid + 1, end);

  return node;
}

int KDTree::depth_max() const {
  return depth_max(root.get());
}
int KDTree::depth_max(const Node* node) const {
  if (!node) {
    return 0;
  } else if (node->children[0] && node->children[1]) {
    return std::max(depth_max(node->children[0].get()),
                    depth_max(node->children[1].get()));
  } else if (node->children[0]) {
    return depth_max(node->children[0].get());
  } else if (node->children[1]) {
    return depth_max(node->children[1].get());
  } else {
    return node->depth;
  }
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

// Calculate height variance for balance measurement
std::pair<int, double> KDTree::depth_variance(Node *node) const {
  if (!node) return {0, 0.0};

  auto [left_height, left_variance] = depth_variance(node->children[0].get());
  auto [right_height, right_variance] = depth_variance(node->children[1].get());

  int height = std::max(left_height, right_height) + 1;
  int height_diff = left_height - right_height;
  double variance = left_variance + right_variance + height_diff * height_diff;
  return {height, variance};
}
  

// int main() {
//   KDTree tree;

//   tree.insert({1, {5, 6}});
//   tree.insert({2, {3, 4}});
//   tree.insert({3, {4, 7}});
//   tree.insert({4, {8, 9}});
//   tree.insert({5, {1, 2}});
//   tree.insert({6, {10, 11}});
//   tree.insert({7, {8, 9}});
//   tree.print_tree();

//   while (!tree.empty()) {
//     KDTree::Value closest = tree.pop_closest(3, 4);
//     assert(tree.validate());
//     std::cout << "Popped closest: " << closest << "\n";
//     tree.print_tree();
//   }

//   return 0;
// }
