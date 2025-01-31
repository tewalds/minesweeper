
#include <array>
#include <cassert>
#include <chrono>
#include <iostream>
#include <string>
#include <vector>

#include <SFML/Graphics.hpp>
#include <SFML/Graphics/Color.hpp>
#include <SFML/Window/VideoMode.hpp>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/strings/str_cat.h"
#include "absl/strings/str_format.h"

#include "agent.h"
#include "env.h"
#include "minesweeper.h"
#include "point.h"

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
    apf = std::sqrt(width * height) / absl::GetFlag(FLAGS_agents);
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

  Env env({width, height}, absl::GetFlag(FLAGS_mines));
  std::vector<Update> updates = env.reset();

  std::vector<Agent> agents;
  for (int i = 0; i < absl::GetFlag(FLAGS_agents); i++) {
    agents.emplace_back(Pointi(width, height), i+1);
  }

  sf::Image image;
  image.create(width, height, COLORS[HIDDEN]);
  for (Update u : updates) {
    image.setPixel(u.point.x, u.point.y, COLORS[u.state]);
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
                image.setPixel(u.point.x, u.point.y, COLORS[u.state]);
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
          Action action = {PASS, {x, y}, 0};
          if (event.mouseButton.button == sf::Mouse::Button::Left) {
            action = {OPEN, {x, y}, 0};
          } else if (event.mouseButton.button == sf::Mouse::Button::Right) {
            action = {MARK, {x, y}, 0};
          } else {
            std::cout << absl::StrFormat("Kick: %i, %i\n", x, y);
            updates.push_back({env.state()(x, y).state, {x, y}, 0});
          }
          if (action.action != PASS) {
            for (Update u : env.step(action)) {
              updates.push_back(u);
              image.setPixel(u.point.x, u.point.y, COLORS[u.state]);
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
              image.setPixel(u.point.x, u.point.y, COLORS[u.state]);
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
