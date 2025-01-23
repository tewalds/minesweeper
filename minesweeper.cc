
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

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/random/random.h"
#include "absl/strings/str_format.h"


ABSL_FLAG(int, mines, 16, "Mines percentage");
ABSL_FLAG(int, px_size, 10, "Pixel size");
ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(int, fps, 60, "Frames per second");
ABSL_FLAG(int, apf, 0, "Actions per frame");


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

auto NEIGHBORS = std::array<std::tuple<int, int>, 8>{{
    {-1, -1}, {-1, 0}, {-1, 1},
    { 0, -1},          { 0, 1},
    { 1, -1}, { 1, 0}, { 1, 1},
}};

constexpr std::vector<std::tuple<int, int>> neighbors(int x, int y, int width, int height) {
  std::vector<std::tuple<int, int>> out;
  out.reserve(8);
  for (auto [dx, dy] : NEIGHBORS) {
    int nx = x + dx;
    int ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
      out.push_back({nx, ny});
    }
  }
  return out;
}

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
	void reshape(int width, int height) {
		assert(width * height == width_ * height_);
		width_ = width;
		height_ = height;
	}

 private:
	int width_;
	int height_;
	std::vector<T> array;
};

enum Cell {
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
  OPEN, 
  MARK,
};

struct Action {
  ActionType action;
  int x;
  int y;
};


class Env {
 public:
	Env(int width, int height, float fraction) :
		  width_(width), height_(height), fraction_(fraction),
      counts_(width, height), visible_(width, height) {
    assert(fraction > 0 && fraction < 1);
	}

  std::vector<Action> reset() {
    visible_.fill(HIDDEN);
    int total = width_ * height_;
    int num_bombs = total * fraction_;

    int zeros = 0;
    int zero_x = 0;
    int zero_y = 0;
    do {
      Array2D<int> bombs(total, 1);
      for (int i = 0; i < total; ++i) {
        bombs(i, 0) = i;
      }
      for (int i = total - 1; i > 0; --i) {
          std::swap(bombs(i, 0), bombs(absl::Uniform(bitgen_, 0, i + 1), 0));
      }
      counts_.reshape(total, 1);
      for (int i = 0; i < total; ++i) {
        counts_(i, 0) = (bombs(i, 0) < num_bombs ? BOMB : ZERO);
      }
      counts_.reshape(width_, height_);

      zeros = 0;
      for (int x = 0; x < width_; x++) {
        for (int y = 0; y < height_; y++) {
          if (counts_(x, y) != BOMB) {
            int b = 0;
            for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
              b += (counts_(nx, ny) == BOMB);
            }
            counts_(x, y) = Cell(b);
            if (b == ZERO) {
              zeros++;
              if (absl::Uniform(bitgen_, 0, zeros) == 0) {
                zero_x = x;
                zero_y = y;
              }
            }
          }
        }
      }
    } while (!zeros);
    return step(Action{OPEN, zero_x, zero_y});
  }

  std::vector<Action> step(Action action) {
    std::vector<Action> updates;
    if (visible_(action.x, action.y) == HIDDEN) {
      if (action.action == MARK) {
        if (counts_(action.x, action.y) != BOMB) {
          std::cout << absl::StrFormat("Bad mark: %i, %i\n", action.x, action.y);
        }
        visible_(action.x, action.y) = MARKED;
        updates.push_back(action);
      } else {  // action.action == MARK
        std::vector<std::tuple<int, int>> q;
        q.push_back({action.x, action.y});
        while (!q.empty()) {
          auto [x, y] = q.back();
          q.pop_back();
          if (visible_(x, y) != HIDDEN) {
            continue;
          }
          Cell state = counts_(x, y);
          visible_(x, y) = state;
          updates.push_back({OPEN, x, y});
          if (state == ZERO) {
            for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
              q.push_back({nx, ny});
            }
          } else if (state == BOMB) {
            std::cout << "BOOOM" << std::endl;
          }
        }
      }
    }
    return updates;
  }

  const Array2D<Cell>& visible() const {
    return visible_;
  }

 private:
	int width_;
	int height_;
	float fraction_;
  Array2D<Cell> counts_;
  Array2D<Cell> visible_;
  absl::BitGen bitgen_;
};


class Agent {
 public:
  Agent(int width, int height) 
      : width_(width), height_(height),
       num_hidden_(width, height), num_marked_(width, height) {
    reset();
  }

  void reset() {
    num_marked_.fill(0);
    for (int x = 0; x < width_; x++) {
      for (int y = 0; y < height_; y++) {
        num_hidden_(x, y) = neighbors(x, y, width_, height_).size();
      }
    }
  }

  std::vector<Action> step(const Array2D<Cell>& visible, const std::vector<Action>& updates) {
    std::vector<Action> actions;

    // Update state
    for (auto [a, x, y] : updates) {
      if (a == OPEN) {
        for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
          num_hidden_(nx, ny) -= 1;
        }
      } else {  // a == MARK
        for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
          num_hidden_(nx, ny) -= 1;
          num_marked_(nx, ny) += 1;
        }
      }
    }

    // Resulting valid actions
    for (auto [_, x, y] : updates) {
      for (auto [nx, ny] : neighbors(x, y, width_, height_)) {
        if (visible(nx, ny) != HIDDEN) {
          int unmarked = visible(nx, ny) - num_marked_(nx, ny);
          ActionType act;
          if (unmarked == 0) {
            act = OPEN;
          } else if (unmarked == num_hidden_(nx, ny)) {
            act = MARK;
          } else {
            continue;
          }

          for (auto [nnx, nny] : neighbors(nx, ny, width_, height_)) {
            if (visible(nnx, nny) == HIDDEN) {
              actions.push_back({act, nnx, nny});
            }
          }
        }
      }
    }

    return actions;
  }

 private:
  int width_;
  int height_; 
  Array2D<int> num_hidden_;
  Array2D<int> num_marked_;
};


int main(int argc, char **argv) {
	absl::ParseCommandLine(argc, argv);

	sf::VideoMode window_size = sf::VideoMode::getDesktopMode();
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
    apf = width * height / 1000;
  }

  std::cout << absl::StrFormat("grid: %ix%i, actions per frame: %i", width, height, apf) << std::endl;

  Env env(width, height, absl::GetFlag(FLAGS_mines) / 100.0);
  Agent agent(width, height);
  std::vector<Action> updates = env.reset();
  std::queue<Action> actions;

  sf::RenderWindow window(
    window_size, "Minesweeper", 
    (flag_window < 1 ? sf::Style::Default : sf::Style::Fullscreen));
  window.setVerticalSyncEnabled(true);
  if (target_fps > 0) {
    window.setFramerateLimit(target_fps);
  }
  sf::Image image;
  image.create(width, height, COLORS[HIDDEN]);

  sf::Font font;
  font.loadFromFile("/usr/share/fonts/truetype/ubuntu/Ubuntu[wdth,wght].ttf");
  sf::Text fps_text;
  fps_text.setFont(font);
  fps_text.setCharacterSize(24);
  fps_text.setFillColor(sf::Color::Red);

  sf::Texture texture;
  sf::RectangleShape rect(sf::Vector2f(window_size.width, window_size.height));

  while (window.isOpen()) {
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

            case sf::Keyboard::Scan::R:
              image.create(width, height, COLORS[HIDDEN]);
              updates = env.reset();
              agent.reset();
              for (; !actions.empty(); actions.pop());
              break;

            default:
              break;
          }
          break;

        default:
          break;
      }
    }
    for (int i = 0; i < apf; i++) {
      if (!updates.empty()) {
        for (Action a : updates) {
          image.setPixel(a.x, a.y, COLORS[env.visible()(a.x, a.y)]);
        }
        for (Action a : agent.step(env.visible(), updates)) {
          actions.push(a);
        }
      }
      if (actions.empty()) {
        updates.clear();
        break;
      } else {
        updates = env.step(actions.front());
        actions.pop();
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

  return 0;
}