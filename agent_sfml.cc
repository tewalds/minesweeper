
#include <array>
#include <cassert>

#include "agent_sfml.h"

#include "minesweeper.h"
#include "point.h"



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


AgentSFML::AgentSFML(Pointi dims, int user, float window_ratio)
    : dims_(dims), user_(user), state_(dims) {
  assert(window_ratio > 0 && window_ratio <= 1);

  sf::VideoMode window_size = sf::VideoMode::getDesktopMode();
  assert(dims.x <= window_size.width);
  assert(dims.y <= window_size.height);
  if (dims.x == window_size.width) {
    window_ratio = 1;
  }

  window_size.width *= window_ratio;
  window_size.height *= window_ratio;
  px_size_ = window_size.width / dims.x;
  window_size.width = dims.x * px_size_;
  window_size.height = dims.y * px_size_;

  window_ = std::make_unique<sf::RenderWindow>(
    window_size, "Minesweeper",
    (window_ratio >= 1 ? sf::Style::Fullscreen : sf::Style::Default));
  // window.setVerticalSyncEnabled(true);

  rect_ = sf::RectangleShape(sf::Vector2f(window_size.width, window_size.height));

  last_render_time_ = std::chrono::steady_clock::now();
  reset();
}

void AgentSFML::reset() {
  image_.create(dims_.x, dims_.y, COLORS[HIDDEN]);
  draw(true);
}

bool AgentSFML::draw(bool force) {
  const auto frame_time = std::chrono::microseconds(1000000/60);
  auto now = std::chrono::steady_clock::now();
  if (force || now - last_render_time_ > frame_time) {
    assert(texture_.loadFromImage(image_));
    rect_.setTexture(&texture_, true);
    window_->draw(rect_);
    window_->display();
    last_render_time_ = now;
    return true;
  }
  return false;
}

Action AgentSFML::step(const std::vector<Update>& updates, bool paused) {
  // Update state.
  for (Update u : updates) {
    image_.setPixel(u.point.x, u.point.y, COLORS[u.state]);
  }
  if (draw(false)) {
    sf::Event event;
    if (window_->pollEvent(event)) {
      switch (event.type) {
        case sf::Event::Closed:
          return {QUIT, {0, 0}, user_};

        case sf::Event::KeyPressed:
          switch (event.key.scancode) {
            case sf::Keyboard::Scan::Escape:
            case sf::Keyboard::Scan::Q:
              return {QUIT, {0, 0}, user_};

            case sf::Keyboard::Scan::Space:
              return {PAUSE, {0, 0}, user_};

            case sf::Keyboard::Scan::R:
              return {RESET, {0, 0}, user_};

            default:
              break;
          }
          break;

        case sf::Event::MouseButtonPressed: {
          int x = event.mouseButton.x / px_size_;
          int y = event.mouseButton.y / px_size_;
          if (event.mouseButton.button == sf::Mouse::Button::Left) {
            return {OPEN, {x, y}, user_};
          } else if (event.mouseButton.button == sf::Mouse::Button::Right) {
            return {MARK, {x, y}, user_};
          }
          break;
        }

        default:
          break;
      }
    }
  }

  return Action{PASS, {0, 0}, user_};
}
