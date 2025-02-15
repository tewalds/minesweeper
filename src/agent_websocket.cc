
#include "absl/strings/str_format.h"

#include "agent_websocket.h"

#include "minesweeper.h"
#include "point.h"



AgentWebSocket::AgentWebSocket(Pointi dims, int port, int first_user)
    : clients_(), next_userid_(first_user), state_(dims) {
  reset();

  server_.add_route("/minefield")
      .ws(beauty::ws_handler{
          .on_connect = [this](const beauty::ws_context& ctx) { this->on_connect(ctx); },
          .on_receive = [this](const beauty::ws_context& ctx, const char* data, std::size_t size, bool is_text) {
            if (is_text) {
              this->on_receive(ctx, std::string(data, size));
            }
          },
          .on_disconnect = [this](const beauty::ws_context& ctx) { this->on_disconnect(ctx); },
      });

  server_.listen(port);
  std::cout << "WebSocket server started on ws://localhost:" << port << "/minefield" << std::endl;
}

AgentWebSocket::~AgentWebSocket() {
  server_.stop();
}

void AgentWebSocket::reset() {
  state_.fill({HIDDEN, 0});
  broadcast("reset");
}

Action AgentWebSocket::step(const std::vector<Update>& updates, bool paused) {
  // Broadcast updates.
  for (Update u: updates) {
    state_[u.point] = {u.state, u.user};
    for (auto& [uuid, client] : clients_) {
      if (client.view.contains(u.point)) {
        if (auto s = client.session.lock(); s) {
          send_update(s, u);
        }
      }
    }
  }

  std::lock_guard<std::mutex> guard(actions_mutex_);
  if (!actions_.empty()) {
    Action a = actions_.front();
    actions_.pop();
    return a;
  }
  return Action{PASS, {0, 0}, 0};
}

void AgentWebSocket::broadcast(const std::string& str) {
  for (auto& [uuid, client] : clients_) {
    if (auto s = client.session.lock(); s) {
      s->send(std::string(str));
    }
  }
}

void AgentWebSocket::send_update(const session_ptr& session, Update u) {
  session->send(absl::StrFormat("update %d %d %d %d", u.state, u.point.x, u.point.y, u.user));
}

int AgentWebSocket::send_rect(const session_ptr& session, Recti r) {
  // TODO: Send in a more compact format. Maybe different formats for dense vs sparse area.
  int sent = 0;
  for (int x = r.left(); x < r.right(); x++) {
    for (int y = r.top(); y < r.bottom(); y++) {
      Cell c = state_(x, y);
      if (c.state != HIDDEN) {
        send_update(session, {c.state, {x, y}, c.user});
        sent++;
      }
    }
  }
  return sent;
}

void AgentWebSocket::on_connect(const beauty::ws_context& ctx) {
  std::cout << "Connection opened" << std::endl;
  int userid = next_userid_++;
  clients_[ctx.uuid] = ClientInfo{
    .uuid = ctx.uuid,
    .session = ctx.ws_session,
    .name = "",
    .userid = userid,
    .view = Recti(),
  };
  if (auto s = ctx.ws_session.lock(); s) {
    s->send(absl::StrFormat("grid %i %i %i", state_.width(), state_.height(), userid));
  }
}

void AgentWebSocket::on_receive(const beauty::ws_context& ctx, const std::string& str) {
  std::istringstream iss(str);
  std::string command;

  // Parse the command
  iss >> command;

  if (command == "register") {
    std::string name;
    iss >> name;
    clients_[ctx.uuid].name = name;
    std::cout << absl::StrFormat("New user id: %i, name: %s\n", clients_[ctx.uuid].userid, name);
    broadcast(absl::StrFormat("join %d %s", clients_[ctx.uuid].userid, name));
  } else if (command == "open") {
    int x, y;
    iss >> x >> y;
    Pointi p(x, y);
    if (state_.rect().contains(p)) {
      int user = clients_[ctx.uuid].userid;
      std::lock_guard<std::mutex> guard(actions_mutex_);
      actions_.push({OPEN, p, user});
    }
  } else if (command == "mark") {
    int x, y;
    iss >> x >> y;
    Pointi p(x, y);
    if (state_.rect().contains(p)) {
      int user = clients_[ctx.uuid].userid;
      std::lock_guard<std::mutex> guard(actions_mutex_);
      actions_.push({MARK, p, user});
    }
  } else if (command == "view") {
    int x1, y1, x2, y2;
    iss >> x1 >> y1 >> x2 >> y2;
    std::optional<Recti> new_view = state_.rect().intersection({{x1, y1}, {x2, y2}});
    // TODO: Check that the view isn't too big? How big is too big?
    if (new_view) {
      for (Recti r : new_view->difference(clients_[ctx.uuid].view)) {
        if (auto s = ctx.ws_session.lock(); s) {
          send_rect(s, r);
        }
      }
      clients_[ctx.uuid].view = *new_view;
    }
  } else {
    std::cout << "Unknown command: " << command << std::endl;
  }
}

void AgentWebSocket::on_disconnect(const beauty::ws_context& ctx) {
  std::cout << "Connection closed" << std::endl;
  clients_.erase(ctx.uuid);
}
