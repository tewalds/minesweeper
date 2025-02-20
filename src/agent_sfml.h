
#pragma once

#include <chrono>
#include <memory>
#include <queue>
#include <vector>

#include <SFML/Graphics.hpp>
#include <SFML/Graphics/Color.hpp>
#include <SFML/Window/VideoMode.hpp>

#include "agent.h"
#include "minesweeper.h"
#include "point.h"


class AgentSFML : public Agent {
 public:
  AgentSFML(Pointi dims, int user, float window_ratio);
  ~AgentSFML() = default;
  void reset();
  Action step(const std::vector<Update>& updates, bool paused);

  Rectf get_view() const;
  Pointf get_mouse() const;

 private:
  bool draw(bool force);
  void clamp_view();

  Pointi dims_;
  int user_;

  std::unique_ptr<sf::RenderWindow> window_;
  sf::View view_;
  sf::Texture texture_;
  sf::RectangleShape rect_;
  sf::Image image_;
  std::chrono::time_point<std::chrono::steady_clock> last_render_time_;
  bool dragging_;
  Pointi mouse_pos_down_;  // Position at mouse pressed.
  sf::Vector2f prev_mouse_pos_;  // Position at last mouse event.
  std::queue<Action> actions_;
};
