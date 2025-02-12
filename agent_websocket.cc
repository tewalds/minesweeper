
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
  for (int x = std::max(0, r.tl.x); x <= std::min(r.br.x, state_.width() - 1); x++) {
    for (int y = std::max(0, r.tl.y); y <= std::min(r.br.y, state_.height() - 1); y++) {
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

    // Dump the state.
    // send_rect(hdl, Recti({0, 0}, state_.dims()));
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
  } else if (command == "view") {
    int x1, y1, x2, y2;
    iss >> x1 >> y1 >> x2 >> y2;
    Recti new_view({x1, y1}, {x2, y2});
    // std::cout << "New view: " << new_view << ", old view: " << client_map_[hdl].view <<  std::endl;
    for (Recti r : new_view.difference(client_map_[hdl].view)) {
      send_rect(hdl, r);
      // int sent = send_rect(hdl, r);
      // std::cout << "Send rect: " << r << ", sent: " << sent << std::endl;
    }
    client_map_[hdl].view = new_view;
  } else {
    std::cout << "Unknown command: " << command << std::endl;
  }
}

void AgentWebSocket::on_close(
    websocketpp::connection_hdl hdl) {
  std::cout << "Connection closed" << std::endl;
  client_map_.erase(hdl.lock());
}
