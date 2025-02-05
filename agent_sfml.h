
#pragma once

#include <chrono>
#include <memory>
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

 private:
  bool draw(bool force);

  Pointi dims_;
  int user_;
  Array2D<CellState> state_;

  int px_size_;
  std::unique_ptr<sf::RenderWindow> window_;
  sf::Texture texture_;
  sf::RectangleShape rect_;
  sf::Image image_;
  std::chrono::time_point<std::chrono::steady_clock> last_render_time_;
};
