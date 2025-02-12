
#pragma once

#include <chrono>
#include <map>
#include <queue>
#include <thread>
#include <vector>

#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>

#include "agent.h"
#include "minesweeper.h"
#include "point.h"


class AgentWebSocket : public Agent {
 public:
  AgentWebSocket(Pointi dims, int port, int first_user);
  ~AgentWebSocket();
  void reset();
  Action step(const std::vector<Update>& updates, bool paused);

 private:
  void on_open(websocketpp::connection_hdl hdl);
  void on_message(websocketpp::connection_hdl hdl,
                  websocketpp::server<websocketpp::config::asio>::message_ptr msg);
  void on_close(websocketpp::connection_hdl hdl);

  void send(websocketpp::connection_hdl hdl, const std::string& str);
  void broadcast_update(Update u);
  void send_update(websocketpp::connection_hdl hdl, Update u);
  int send_rect(websocketpp::connection_hdl hdl, Recti r);
  void broadcast(const std::string& str);

  struct ClientInfo {
      std::string name;
      int userid;
      Recti view;
  };

  std::thread thread_;
  websocketpp::server<websocketpp::config::asio> server_;
  // It'd be nice to use a flat_hash_map, but connection_hdl is a weak_ptr that doesn't hash.
  std::map<websocketpp::connection_hdl, ClientInfo,
           std::owner_less<websocketpp::connection_hdl>> client_map_;
  int next_userid_;
  std::mutex actions_mutex_;
  std::queue<Action> actions_;

  struct Cell {
    CellState state;
    int user;
  };

  Array2D<Cell> state_;
};
