
#pragma once

#include <chrono>
#include <filesystem>
#include <map>
#include <queue>
#include <thread>
#include <vector>

#include <absl/container/flat_hash_map.h>
#include <beauty/beauty.hpp>

#include "agent.h"
#include "minesweeper.h"
#include "point.h"

using session_ptr = std::shared_ptr<beauty::websocket_session>;

class AgentWebSocket : public Agent {
 public:
  AgentWebSocket(Pointi dims, int port, int first_user);
  ~AgentWebSocket();
  void reset();
  Action step(const std::vector<Update>& updates, bool paused);

 private:
  void on_connect(const beauty::ws_context& ctx);
  void on_receive(const beauty::ws_context& ctx, const std::string& msg);
  void on_disconnect(const beauty::ws_context& ctx);

  void send_update(const session_ptr& session, Update u);
  int send_rect(const session_ptr& session, Recti r);
  void broadcast(const std::string& str);

  struct ClientInfo {
    std::string uuid;  // related to the websocket session
    std::weak_ptr<beauty::websocket_session> session;
    std::string name;
    int userid;
    Recti view;
  };

  beauty::server server_;
  absl::flat_hash_map<std::string, ClientInfo> clients_;  // uuid -> client info
  int next_userid_;
  std::mutex actions_mutex_;
  std::queue<Action> actions_;

  struct Cell {
    CellState state;
    int user;
  };

  Array2D<Cell> state_;
};
