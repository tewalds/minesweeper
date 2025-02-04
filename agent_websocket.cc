
#include "absl/strings/str_format.h"

#include "agent_websocket.h"

#include "minesweeper.h"
#include "point.h"


AgentWebSocket::AgentWebSocket(Pointi dims, int port, int first_user)
    : client_map_(), next_userid_(first_user), state_(dims) {
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
  for (auto& client_it : client_map_) {
    send(client_it.first, "reset");
  }
}

Action AgentWebSocket::step(const std::vector<Update>& updates, bool paused) {
  // Broadcast updates.
  for (Update u: updates) {
    state_[u.point] = {u.state, u.user};
    broadcast(absl::StrFormat("update %d %d %d %d", u.state, u.point.x, u.point.y, u.user));
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

void AgentWebSocket::on_open(
    websocketpp::connection_hdl hdl) {
  std::cout << "Connection opened" << std::endl;
  int userid = next_userid_++;
  client_map_[hdl] = {"", userid};
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
    broadcast(absl::StrFormat("join %d %s", client_map_[hdl].userid, name));

    // Dump the state. TODO: Send in a more compact format.
    for (int x = 0; x < state_.width(); x++) {
      for (int y = 0; y < state_.height(); y++) {
        Cell c = state_(x, y);
        if (c.state != HIDDEN) {
          send(hdl, absl::StrFormat("update %d %d %d %d", c.state, x, y, c.user));
        }
      }
    }
  } else if (command == "open") {
    int x, y;
    iss >> x >> y;
    int user = client_map_[hdl].userid;
    std::lock_guard<std::mutex> guard(actions_mutex_);
    actions_.push({OPEN, {x, y}, user});
  } else if (command == "mark") {
    int x, y;
    iss >> x >> y;
    int user = client_map_[hdl].userid;
    std::lock_guard<std::mutex> guard(actions_mutex_);
    actions_.push({MARK, {x, y}, user});
  }
}

void AgentWebSocket::on_close(
    websocketpp::connection_hdl hdl) {
  std::cout << "Connection closed" << std::endl;
  client_map_.erase(hdl.lock());
}
