
#include <array>
#include <cassert>
#include <cmath>
#include <iostream>

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


const int MAX_CELL_SIZE = 128;  // In pixels.

std::ostream& operator<< (std::ostream& stream, const sf::Vector2f& v) {
  return stream << "V2f(" << "x: " << v.x << ", y: " << v.y << ")";
}

std::ostream& operator<< (std::ostream& stream, const sf::FloatRect& v) {
  return stream << "Rect("
    << "left: " << v.left
    << ", top: " << v.top
    << ", width: " << v.width
    << ", height: " << v.height
    << ")";
}


AgentSFML::AgentSFML(Pointi dims, int user, float window_ratio)
    : dims_(dims), user_(user), dragging_(false) {
  assert(window_ratio > 0 && window_ratio <= 1);

  sf::VideoMode window_size = sf::VideoMode::getDesktopMode();
  window_size.width *= window_ratio;
  window_size.height *= window_ratio;

  window_ = std::make_unique<sf::RenderWindow>(
    window_size, "Minesweeper",
    (window_ratio >= 1 ? sf::Style::Fullscreen : sf::Style::Default));
  // window.setVerticalSyncEnabled(true);

  view_.reset(sf::FloatRect(0, 0, dims.x, dims.y));
  clamp_view();
  window_->setView(view_);

  rect_ = sf::RectangleShape(sf::Vector2f(dims.x, dims.y));

  last_render_time_ = std::chrono::steady_clock::now();
  reset();
  draw(true);
}
 
Rectf AgentSFML::get_view() const {
  sf::Vector2f center = view_.getCenter();
  sf::Vector2f size = view_.getSize();
  return Rectf::from_center_size({center.x, center.y}, {size.x, size.y});
}

void AgentSFML::reset() {
  while (!actions_.empty()) {
    actions_.pop();
  }
  image_.create(dims_.x, dims_.y, COLORS[HIDDEN]);
  // Don't draw as reset may be called from a different thread than step, and sfml/opengl doesn't
  // like drawing from different threads without syncing.
}

bool AgentSFML::draw(bool force) {
  const auto frame_time = std::chrono::microseconds(1000000/60);
  auto now = std::chrono::steady_clock::now();
  if (force || now - last_render_time_ > frame_time) {
    assert(texture_.loadFromImage(image_));
    rect_.setTexture(&texture_, true);
    // window_->clear();
    window_->setView(view_);
    window_->draw(rect_);
    window_->display();
    last_render_time_ = now;
    return true;
  }
  return false;
}

void AgentSFML::clamp_view() {
  sf::Vector2f view_size = view_.getSize();
  sf::Vector2u window_size = window_->getSize();

  // Don't zoom out farther than the field.
  view_size.x = std::min<float>(view_size.x, dims_.x);
  view_size.y = std::min<float>(view_size.y, dims_.y);

  // Don't zoom out farther than the window, ie 1px per cell.
  view_size.x = std::min<float>(view_size.x, window_size.x);
  view_size.y = std::min<float>(view_size.y, window_size.y);

  // Don't zoom in too close.
  view_size.x = std::max<float>(view_size.x, window_size.x / MAX_CELL_SIZE);
  view_size.y = std::max<float>(view_size.y, window_size.y / MAX_CELL_SIZE);

  // Make sure the view's aspect ratio matches the window.
  float view_ratio = float(view_size.x) / view_size.y;
  float window_ratio = float(window_size.x) / window_size.y;
  if (view_ratio > window_ratio) {
    view_size.x = view_size.y * window_ratio;
  } else if (view_ratio < window_ratio) {
    view_size.y = view_size.x / window_ratio;
  }

  view_.setSize(view_size);

  // Don't scroll off the field.
  sf::Vector2f half_size = view_size * 0.5f;
  sf::Vector2f center = view_.getCenter();
  center.x = std::clamp(center.x, half_size.x, dims_.x - half_size.x);
  center.y = std::clamp(center.y, half_size.y, dims_.y - half_size.y);
  view_.setCenter(center);
}

Action AgentSFML::step(const std::vector<Update>& updates, bool paused) {
  // Update state.
  for (Update u : updates) {
    image_.setPixel(u.point.x, u.point.y, COLORS[u.state]);
  }
  if (draw(false)) {
    // Scroll the view. Check isKeyPressed instead of events below to avoid repeat delay.
    // Sum/avg view size components to make scroll speed consistent in x/y directions.
    sf::Vector2f view_size = view_.getSize();
    float scroll_speed = (view_size.x + view_size.y) / 100.0f;
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::W) || 
        sf::Keyboard::isKeyPressed(sf::Keyboard::Up)) {
      view_.move({0, -scroll_speed});
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::A) || 
        sf::Keyboard::isKeyPressed(sf::Keyboard::Left)) {
      view_.move({-scroll_speed, 0});
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::S) || 
        sf::Keyboard::isKeyPressed(sf::Keyboard::Down)) {
      view_.move({0, scroll_speed});
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::D) || 
        sf::Keyboard::isKeyPressed(sf::Keyboard::Right)) {
      view_.move({scroll_speed, 0});
    }
    clamp_view();

    sf::Event event;
    while (window_->pollEvent(event)) {
      switch (event.type) {
        case sf::Event::Closed:
          return {QUIT, {0, 0}, user_};

        case sf::Event::KeyPressed:
          switch (event.key.code) {
            case sf::Keyboard::Escape:
            case sf::Keyboard::Q:
              return {QUIT, {0, 0}, user_};

            case sf::Keyboard::Space:
              return {PAUSE, {0, 0}, user_};

            case sf::Keyboard::R:
              return {RESET, {0, 0}, user_};

            default:
              break;
          }
          break;

        case sf::Event::Resized: {
          clamp_view();
          break;
        }

        case sf::Event::MouseWheelScrolled: {
          if (dragging_) {
            break;  // Zooming while dragging is really distracting and confusing.
          }
          sf::Vector2f view_size = view_.getSize();
          sf::Vector2u window_size = window_->getSize();
          if (event.mouseWheelScroll.delta < 0 && (view_size.x >= window_size.x ||
                                                   view_size.y >= window_size.y)) {
            break;  // Already at max zoom. Can't zoom out farther than 1px per cell.
          }
          if (event.mouseWheelScroll.delta > 0 && (view_size.x <= window_size.x / MAX_CELL_SIZE ||
                                                   view_size.y <= window_size.y / MAX_CELL_SIZE)) {
            break;  // Don't zoom too close.
          }

          sf::Vector2i pixel_pos = sf::Mouse::getPosition(*window_);
          sf::Vector2f before_zoom = window_->mapPixelToCoords(pixel_pos, view_);

          const float sqrt2 = std::sqrt(2.0);
          view_.zoom(event.mouseWheelScroll.delta > 0 ? 1./sqrt2 : sqrt2);

          sf::Vector2f after_zoom = window_->mapPixelToCoords(pixel_pos, view_);
          view_.move(before_zoom - after_zoom);  // Zoom centered on the mouse.

          clamp_view();
          break;
        }

        case sf::Event::MouseButtonPressed: {
          sf::Vector2f mouse_pos = window_->mapPixelToCoords(sf::Mouse::getPosition(*window_), view_);
          if (event.mouseButton.button == sf::Mouse::Button::Middle) {
            dragging_ = true;
            prev_mouse_pos_ = mouse_pos;
          } else {
            mouse_pos_down_ = Pointi(int(mouse_pos.x), int(mouse_pos.y));
          }
          break;
        }

        case sf::Event::MouseButtonReleased: {
          if (event.mouseButton.button == sf::Mouse::Button::Middle) {
            dragging_ = false;
          } else {
            sf::Vector2f mouse_pos_up = window_->mapPixelToCoords(sf::Mouse::getPosition(*window_), view_);
            Pointi mouse_pos(int(mouse_pos_up.x), int(mouse_pos_up.y));

            if (mouse_pos == mouse_pos_down_) {  // Avoid misclicks if the mouse moves slightly.
              if (event.mouseButton.button == sf::Mouse::Button::Left) {
                actions_.push({OPEN, mouse_pos, user_});
              } else if (event.mouseButton.button == sf::Mouse::Button::Right) {
                actions_.push({MARK, mouse_pos, user_});
              }
            }
          }
          break;
        }

        case sf::Event::MouseMoved: {
          if (dragging_) {
            sf::Vector2i pixel_pos = sf::Mouse::getPosition(*window_);
            sf::Vector2f mouse_pos = window_->mapPixelToCoords(pixel_pos, view_);
            view_.move(prev_mouse_pos_ - mouse_pos);
            clamp_view();

            // Recompute this after changing the view. Using mouse_pos leads to stuttering.
            prev_mouse_pos_ = window_->mapPixelToCoords(pixel_pos, view_);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  if (!actions_.empty()) {
    Action a = actions_.front();
    actions_.pop();
    return a;
  }
  return Action{PASS, {0, 0}, user_};
}
