
#include <array>
#include <cassert>
#include <chrono>
#include <iostream>
#include <queue>
#include <string>
#include <thread>
#include <tuple>
#include <vector>

#include <SFML/Graphics.hpp>
#include <SFML/Graphics/Color.hpp>
#include <SFML/Window/VideoMode.hpp>

#include "absl/container/flat_hash_map.h"
#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/random/random.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_format.h"

#include "kdtree.h"

ABSL_FLAG(float, mines, 0.16, "Mines percentage");
ABSL_FLAG(int, px_size, 20, "Pixel size");
ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(int, fps, 60, "Frames per second");
ABSL_FLAG(int, apf, 0, "Actions per frame");
ABSL_FLAG(int, agents, 1, "Agents");
ABSL_FLAG(bool, benchmark, false, "Exit after the first run");


auto COLORS = std::array<sf::Color, 12>{
  sf::Color(127, 127, 127),  // 0: grey
  sf::Color( 50,  50, 255),  // 1: blue
  sf::Color( 50, 255,  50),  // 2: green
  sf::Color(255,  50,  50),  // 3: red
  sf::Color(153,   0, 152),  // 4: purple
  sf::Color(  0, 203, 204),  // 5: cyan
  sf::Color(254, 255,   0),  // 6: yellow
  sf::Color( 95,  95,  95),  // 7: dark grey
  sf::Color( 64,  64,  64),  // 8: darker grey
  sf::Color(255, 255, 255),  // Bomb: white
  sf::Color(215, 215, 215),  // Hidden: light grey
  sf::Color(  0,   0,   0),  // Mark: black
};

auto NEIGHBORS = std::array<std::tuple<int, int>, 9>{{
    {-1, -1}, {-1, 0}, {-1, 1},
    { 0, -1}, { 0, 0}, { 0, 1},
    { 1, -1}, { 1, 0}, { 1, 1},
}};

class neighbors {
 public:
  neighbors(int x, int y, int width, int height) : count(0) {
    for (auto [dx, dy] : NEIGHBORS) {
      int nx = x + dx;
      int ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        neighbors_[count++] = {nx, ny};
      }
    }
  }

  std::tuple<int, int>* begin() { return neighbors_; }
  std::tuple<int, int>* end()   { return neighbors_ + count; }

 private:
  std::tuple<int, int> neighbors_[NEIGHBORS.size()];
  int count;
};


template<class T>
class Array2D {
 public:
  Array2D(int width, int height) : width_(width), height_(height) {
    array.resize(width * height);
  }

  T& operator()(int x, int y) {
    return array[y * width_ + x];
  }
  const T& operator()(int x, int y) const {
    return array[y * width_ + x];
  }

  void fill(const T& v) {
    for (int i = 0; i < width_ * height_; i++) {
      array[i] = v;
    }
  }
  int width() const { return width_; }
  int height() const { return height_; }
  int size() const { return width_ * height_; }

 private:
  int width_;
  int height_;
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

struct Cell {
  CellState state;
  bool bomb;
  int user;
};

enum ActionType {
  PASS,
  OPEN, 
  MARK,
};

struct Action {
  ActionType action;
  int x;
  int y;
  int user;
  bool operator==(const Action&) const = default;
  bool operator!=(const Action&) const = default;
};

struct Update {
  CellState state;
  int x;
  int y;
  int user;
};

class Env {
 public:
  Env(int width, int height, float bomb_percentage) :
      width_(width), height_(height), bomb_percentage_(bomb_percentage),
      state_(width, height) {
    assert(bomb_percentage > 0. && bomb_percentage < 1.);
  }

  std::vector<Update> reset() {
    // Generate random bombs
    for (int x = 0; x < width_; x++) {
      for (int y = 0; y < height_; y++) {
        state_(x, y).state = HIDDEN;
        state_(x, y).bomb = (absl::Uniform(bitgen_, 0.0, 1.0) < bomb_percentage_);
        state_(x, y).user = 0;
        // std::cout << absl::StrFormat("Cell(%i, %i)\n", state_(x, y).state, state_(x, y).bomb);
      }
    }

    // Find an empty place to start.
    while (true) {
      int x = absl::Uniform(bitgen_, 0, width_);
      int y = absl::Uniform(bitgen_, 0, height_);

      int b = 0;
      for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
        b += state_(nx, ny).bomb;
      }
      if (b == 0) {
        return step(Action{OPEN, x, y, 0});
      }
    }
  }

  std::vector<Update> step(Action action) {
    std::vector<Update> updates;

    std::vector<Action> q;
    q.push_back(action);
    while (!q.empty()) {
      Action a = q.back();
      q.pop_back();
      // std::cout << absl::StrFormat("Env.step: got Action(%i, %i, %i, %i)", a.action, a.x, a.y, a.user) << std::endl;
      if (a.action == MARK) {
        if (!state_(a.x, a.y).bomb) {
          // TODO(tewalds): remove?
          std::cout << absl::StrFormat("Bad mark: %i, %i\n", a.x, a.y);
          continue;
        }
        if (state_(a.x, a.y).state == MARKED) {
          if (state_(a.x, a.y).user == a.user) {
            // I marked it, so unmark.
            state_(a.x, a.y).state = HIDDEN;
            state_(a.x, a.y).user = 0;
            updates.push_back({HIDDEN, a.x, a.y, a.user});
          } else {
            // Someone else marked, so replace it with my mark.
            state_(a.x, a.y).user = a.user;
            updates.push_back({MARKED, a.x, a.y, a.user});
          }
        } else if (state_(a.x, a.y).state == HIDDEN) {
          // Mark it.
          state_(a.x, a.y).state = MARKED;
          state_(a.x, a.y).user = a.user;
          updates.push_back({MARKED, a.x, a.y, a.user});
        } else {
          // std::cout << "Invalid mark action, already open\n";
        }
      } else if (a.action == OPEN) {
        if (state_(a.x, a.y).state == HIDDEN) {
          if (state_(a.x, a.y).bomb) {
            std::cout << "BOOOM" << std::endl;  // TODO: remove?
          } else {
            // Compute and reveal the true value
            int b = 0;
            for (auto [nx, ny] : neighbors(a.x, a.y, width_, height_)) {
              b += state_(nx, ny).bomb;
            }
            CellState c = CellState(b);
            state_(a.x, a.y).state = c;
            updates.push_back({c, a.x, a.y, a.user});

            // Propagate to the neighbors.
            if (c == ZERO) {
              for (auto [nx, ny] : neighbors(a.x, a.y, width_, height_)) {
                if (state_(nx, ny).state == HIDDEN) {
                  q.push_back({OPEN, nx, ny, 0});
                }
              }
            }
          }
        } else if (state_(a.x, a.y).state == MARKED) {
          // std::cout << "Invalid open action, already marked\n";
        } else if (a.user != 0) {
          // std::cout << "Invalid open action, already open\n";
        }
      }
    }
    return updates;
  }

  const Array2D<Cell>& state() const {
    return state_;
  }

 private:
  int width_;
  int height_;
  float bomb_percentage_;
  Array2D<Cell> state_;
  absl::BitGen bitgen_;
};


class Agent {
 public:
  Agent(int width, int height, int user)
      : width_(width), height_(height), user_(user), state_(width, height) {
    reset();
  }

  void reset() {
    state_.fill(HIDDEN);
    actions_.clear();
    rolling_action_ = {
        // Encourage it to start heading in a random direction. Forces agents to diverge.
        absl::Uniform(bitgen_, 0.0f, float(width_)),
        absl::Uniform(bitgen_, 0.0f, float(height_)),
    };
  }

  Action step(const std::vector<Update>& updates) {
    // Update state.
    for (auto u : updates) {
      // std::cout << absl::StrFormat("Agent.step: got Update(%i, %i, %i, %i)", u.state, u.x, u.y, u.user) << std::endl;
      state_(u.x, u.y) = u.state;
      if (u.user == user_) {
        constexpr float decay = 0.05;  // Controls how fast it moves away from the last action.
        rolling_action_.x = rolling_action_.x * (1. - decay) + u.x * decay;
        rolling_action_.y = rolling_action_.y * (1. - decay) + u.y * decay;
      }
      actions_.remove(u.x, u.y);
    }

    // Compute the resulting valid actions.
    for (auto u : updates) {
      for (auto [nx, ny] : neighbors(u.x, u.y, width_, height_)) {
        CellState ns = state_(nx, ny);
        if (ns != HIDDEN) {
          int hidden = 0;
          int marked = 0;
          for (auto [nnx, nny] : neighbors(nx, ny, width_, height_)) {
            if (state_(nnx, nny) == HIDDEN) {
              hidden += 1;
            } else if (state_(nnx, nny) == MARKED) {
              marked += 1;
            }
          }
          if (hidden == 0) {
            continue;  // No possible actions.
          }

          ActionType act = PASS;
          if (ns == marked) {
            // All bombs are found.
            act = OPEN;
          } else if (ns == hidden + marked) {
            // All remaining hidden must be bombs
            act = MARK;
          } else {
            continue;  // Still unknown.
          }

          for (auto [nnx, nny] : neighbors(nx, ny, width_, height_)) {
            if (state_(nnx, nny) == HIDDEN) {
              // actions_.push_back({act, nnx, nny, user_});
              actions_.insert({int(act), {{nnx, nny}}});
            }
          }
        }
      }
    }

    // Return an arbitrary valid action from the action queue.
    // while (!actions_.empty()) {
    //   unsigned int i = absl::Uniform(bitgen_, 0u, actions_.size());
    //   Action a = actions_[i];
    //   actions_[i] = actions_.back();
    //   // Action a = actions_.back();
    //   actions_.pop_back();
    //   if (state_(a.x, a.y) == HIDDEN) {
    //     // std::cout << absl::StrFormat("send Action(%i, %i, %i, %i)",
    //     //     action.action, action.x, action.y, action.user) << std::endl;
    //     return a;
    //   }
    // }

    // if (!actions_.empty() && absl::Uniform(bitgen_, 0, 1000) == 0) {
    //   actions_.validate();
    //   std::cout << "size: " << actions_.size()
    //             << " max depth: " << actions_.depth_max()
    //             << " avg depth: " << actions_.depth_avg()
    //             << " std dev: " << actions_.depth_stddev()
    //             << " balance: " << actions_.balance_factor() << std::endl;
    //   // actions_.print_tree();
    // }

    while (!actions_.empty()) {
      KDTree::Value a = actions_.pop_closest(
          // Rounding fixes a systematic bias towards the top left from truncating.
          std::round(rolling_action_.x), std::round(rolling_action_.y));
      if (state_(a.x, a.y) == HIDDEN) {
        return {ActionType(a.value), a.x, a.y, user_};
      }
    }

    // std::cout << "send PASS\n";
    return Action{PASS, 0, 0, user_};
  }

 private:
  int width_;
  int height_;
  int user_;
  Array2D<CellState> state_;
  // std::vector<Action> actions_;
  KDTree actions_;
  struct {
    float x;
    float y;
  } rolling_action_;
  absl::BitGen bitgen_;
};


int main(int argc, char **argv) {
  absl::ParseCommandLine(argc, argv);

  sf::VideoMode window_size = sf::VideoMode::getDesktopMode();
  bool benchmark = absl::GetFlag(FLAGS_benchmark);
  float flag_window = absl::GetFlag(FLAGS_window);
  int px_size = absl::GetFlag(FLAGS_px_size);
  if (flag_window < 1) {
    window_size.width *= flag_window;
    window_size.height *= flag_window;
  }
  int width = window_size.width / px_size;
  int height = window_size.height / px_size;
  window_size.width = width * px_size;
  window_size.height = height * px_size;

  int target_fps = absl::GetFlag(FLAGS_fps);
  int apf = absl::GetFlag(FLAGS_apf);
  if (apf == 0) {
    apf = std::sqrt(width * height);
  }

  std::cout << absl::StrFormat("grid: %ix%i, actions per frame: %i\n", width, height, apf);

  sf::RenderWindow window(
    window_size, "Minesweeper", 
    (flag_window < 1 ? sf::Style::Default : sf::Style::Fullscreen));
  window.setVerticalSyncEnabled(true);
  if (target_fps > 0) {
    window.setFramerateLimit(target_fps);
  }
  sf::Font font;
  font.loadFromFile("/usr/share/fonts/truetype/ubuntu/Ubuntu[wdth,wght].ttf");
  sf::Text fps_text;
  fps_text.setFont(font);
  fps_text.setCharacterSize(24);
  fps_text.setFillColor(sf::Color::Red);

  sf::Texture texture;
  sf::RectangleShape rect(sf::Vector2f(window_size.width, window_size.height));

  auto bench_start = std::chrono::steady_clock::now();
  long long bench_actions = 0;

  Env env(width, height, absl::GetFlag(FLAGS_mines));
  std::vector<Update> updates = env.reset();

  std::vector<Agent> agents;
  for (int i = 0; i < absl::GetFlag(FLAGS_agents); i++) {
    agents.emplace_back(width, height, i+1);
  }

  sf::Image image;
  image.create(width, height, COLORS[HIDDEN]);
  for (Update u : updates) {
    image.setPixel(u.x, u.y, COLORS[u.state]);
  }
  assert(texture.loadFromImage(image));
  rect.setTexture(&texture, true);
  window.draw(rect);
  window.display();

  bool paused = false;
  bool finished = false;
  while (window.isOpen() && !(benchmark && finished)) {
    auto start = std::chrono::steady_clock::now();

    sf::Event event;
    while (window.pollEvent(event)) {
      switch (event.type) {
        case sf::Event::Closed:
          window.close();
          break;

        case sf::Event::KeyPressed:
          switch (event.key.scancode) {
            case sf::Keyboard::Scan::Escape:
            case sf::Keyboard::Scan::Q:
              window.close();
              break;

            case sf::Keyboard::Scan::Space:
              paused = !paused;
              std::cout << (paused ? "Pause" : "Resume") << std::endl;
              break;

            case sf::Keyboard::Scan::R:
              image.create(width, height, COLORS[HIDDEN]);
              updates = env.reset();
              for (Update u : updates) {
                image.setPixel(u.x, u.y, COLORS[u.state]);
              }
              for (Agent& agent : agents) {
                agent.reset();
              }
              break;

            default:
              break;
          }
          break;

        case sf::Event::MouseButtonPressed: {
          int x = event.mouseButton.x / px_size;
          int y = event.mouseButton.y / px_size;
          Action action = {PASS, x, y, 0};
          if (event.mouseButton.button == sf::Mouse::Button::Left) {
            action = {OPEN, x, y, 0};
          } else if (event.mouseButton.button == sf::Mouse::Button::Right) {
            action = {MARK, x, y, 0};
          } else {
            std::cout << absl::StrFormat("Kick: %i, %i\n", x, y);
            updates.push_back({env.state()(x, y).state, x, y, 0});
          }
          if (action.action != PASS) {
            for (Update u : env.step(action)) {
              updates.push_back(u);
              image.setPixel(u.x, u.y, COLORS[u.state]);
            }
          }
          break;
        }

        default:
          break;
      }
    }
    if (!paused) {
      for (int i = 0; i < apf; i++) {
        std::vector<Action> actions;
        for (Agent& agent : agents) {
          actions.push_back(agent.step(updates));
        }
        updates.clear();
        finished = true;
        for (Action a : actions) {
          if (a.action != PASS) {
            bench_actions += 1;
            finished = false;
            for (Update u : env.step(a)) {
              updates.push_back(u);
              image.setPixel(u.x, u.y, COLORS[u.state]);
            }
          }
        }
      }
    }
    
    assert(texture.loadFromImage(image));
    rect.setTexture(&texture, true);
    window.draw(rect);

    auto duration_us = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now() - start).count();
    fps_text.setString(absl::StrFormat("Frame time: %.2f ms", duration_us / 1000.));
    window.draw(fps_text);

    window.display();
  }

  auto duration_us = std::chrono::duration_cast<std::chrono::microseconds>(
      std::chrono::steady_clock::now() - bench_start).count();
  std::cout << "Actions: " << bench_actions
            << " action/s: " << bench_actions * 1000000 / duration_us << std::endl;

  return 0;
}
