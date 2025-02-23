
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
#include "thread.h"

using session_ptr = std::shared_ptr<beauty::websocket_session>;

class AgentWebSocket : public Agent {
 public:
  AgentWebSocket(const Array2D<Cell>& state, int port, std::filesystem::path doc_root, int first_user);
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
    int userid;
  };

  struct User {
    int userid;
    std::string name;
    int color;
    int emoji;
    int score;
    Recti view;
    Pointf mouse;
    std::chrono::time_point<std::chrono::system_clock> last_active;
  };

  void send_user(const session_ptr& session, const User& user);
  void send_users(const session_ptr& session, std::chrono::duration<float> limit);

  beauty::server server_;
  absl::flat_hash_map<std::string, ClientInfo> clients_;  // uuid -> client info
  absl::flat_hash_map<int, User> users_;  // userid -> User
  absl::flat_hash_map<std::string, int> usernames_;  // username -> userid
  int next_userid_;
  MutexProtected<std::queue<Action>> actions_;

  const Array2D<Cell>& state_;
};
