
#include "absl/strings/str_format.h"

#include "agent_websocket.h"

#include "minesweeper.h"
#include "point.h"


AgentWebSocket::AgentWebSocket(Pointi dims, int port, int first_user)
    : client_map_(), next_userid_(first_user), state_(dims) {

  server_.clear_access_channels(websocketpp::log::alevel::all);
  server_.clear_error_channels(websocketpp::log::elevel::all);

  server_.init_asio();

  server_.set_open_handler([this](auto a) { return this->on_open(a); });
  server_.set_message_handler([this](auto a, auto b) { return this->on_message(a, b); });
  server_.set_close_handler([this](auto a) { return this->on_close(a); });

  server_.listen(port);
  server_.start_accept();
  thread_ = std::thread([this]() {server_.run(); });
  std::cout << "WebSocket server started on ws://localhost:" << port << std::endl;

  reset();
}

AgentWebSocket::~AgentWebSocket() {
  server_.stop();
  thread_.join();
}

void AgentWebSocket::reset() {
  state_.fill({HIDDEN, 0});
  for (auto& client_it : client_map_) {
    send(client_it.first, "reset");
  }
}

Action AgentWebSocket::step(const std::vector<Update>& updates, bool paused) {
  // Broadcast updates.
  for (Update u: updates) {
    state_[u.point] = {u.state, u.user};
    broadcast_update(u);
  }

  std::lock_guard<std::mutex> guard(actions_mutex_);
  if (!actions_.empty()) {
    Action a = actions_.front();
    actions_.pop();
    return a;
  }
  return Action{PASS, {0, 0}, 0};
}

void AgentWebSocket::send(websocketpp::connection_hdl hdl, const std::string& str) {
  server_.send(hdl, str, websocketpp::frame::opcode::text);
}

void AgentWebSocket::broadcast(const std::string& str) {
  for (auto& client_it : client_map_) {
    send(client_it.first, str);
  }
}

void AgentWebSocket::broadcast_update(Update u) {
  for (auto& client_it : client_map_) {
    if (client_it.second.view.contains(u.point)) {
      send_update(client_it.first, u);
    }
  }
}

void AgentWebSocket::send_update(websocketpp::connection_hdl hdl, Update u) {
  send(hdl, absl::StrFormat("update %d %d %d %d", u.state, u.point.x, u.point.y, u.user));
}

int AgentWebSocket::send_rect(websocketpp::connection_hdl hdl, Recti r) {
  // TODO: Send in a more compact format. Maybe different formats for dense vs sparse area.
  int sent = 0;
  for (int x = r.left(); x < r.right(); x++) {
    for (int y = r.top(); y < r.right(); y++) {
      Cell c = state_(x, y);
      if (c.state != HIDDEN) {
        send_update(hdl, {c.state, {x, y}, c.user});
        sent++;
      }
    }
  }
  return sent;
}

void AgentWebSocket::on_open(
    websocketpp::connection_hdl hdl) {
  std::cout << "Connection opened" << std::endl;
  int userid = next_userid_++;
  client_map_[hdl] = {"", userid, Recti()};
  send(hdl, absl::StrFormat("grid %i %i %i", state_.width(), state_.height(), userid));
}

void AgentWebSocket::on_message(
    websocketpp::connection_hdl hdl,
    websocketpp::server<websocketpp::config::asio>::message_ptr msg) {
  std::string payload = msg->get_payload();
  std::istringstream iss(payload);
  std::string command;

  // Parse the command
  iss >> command;

  if (command == "register") {
    std::string name;
    iss >> name;
    client_map_[hdl].name = name;
    std::cout << absl::StrFormat("New user id: %i, name: %s\n", client_map_[hdl].userid, name);
    broadcast(absl::StrFormat("join %d %s", client_map_[hdl].userid, name));
  } else if (command == "open") {
    int x, y;
    iss >> x >> y;
    Pointi p(x, y);
    if (state_.rect().contains(p)) {
      int user = client_map_[hdl].userid;
      std::lock_guard<std::mutex> guard(actions_mutex_);
      actions_.push({OPEN, p, user});
    }
  } else if (command == "mark") {
    int x, y;
    iss >> x >> y;
    Pointi p(x, y);
    if (state_.rect().contains(p)) {
      int user = client_map_[hdl].userid;
      std::lock_guard<std::mutex> guard(actions_mutex_);
      actions_.push({MARK, p, user});
    }
  } else if (command == "view") {
    int x1, y1, x2, y2;
    iss >> x1 >> y1 >> x2 >> y2;
    std::optional<Recti> new_view = state_.rect().intersection({{x1, y1}, {x2, y2}});
    // TODO: Check that the view isn't too big? How big is too big?
    if (new_view) {
      for (Recti r : new_view->difference(client_map_[hdl].view)) {
        send_rect(hdl, r);
      }
      client_map_[hdl].view = *new_view;
    }
  } else {
    std::cout << "Unknown command: " << command << std::endl;
  }
}

void AgentWebSocket::on_close(
    websocketpp::connection_hdl hdl) {
  std::cout << "Connection closed" << std::endl;
  client_map_.erase(hdl.lock());
}
