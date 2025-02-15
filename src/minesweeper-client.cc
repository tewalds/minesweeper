
#include <cassert>
#include <chrono>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_no_tls_client.hpp>

#include "absl/flags/flag.h"
#include "absl/flags/parse.h"
#include "absl/strings/str_format.h"

#include "agent_sfml.h"
#include "minesweeper.h"
#include "point.h"
#include "thread.h"

ABSL_FLAG(float, window, 0.75, "window size");
ABSL_FLAG(std::string, host, "localhost", "Websocket host.");
ABSL_FLAG(int, port, 9001, "Websocket port.");
ABSL_FLAG(std::string, name, "wsclient", "Username");


struct State {
  std::unique_ptr<AgentSFML> agent;
  std::vector<Update> updates;
  Pointi dims;
  int userid = 0;
};

MutexProtected<State> state;
bool done = false;


bool send(websocketpp::client<websocketpp::config::asio_client>& client, 
          websocketpp::connection_hdl hdl, const std::string& str) {
  websocketpp::lib::error_code ec;
  client.send(hdl, str, websocketpp::frame::opcode::text, ec);
  if (ec) {
    std::cout << "Echo failed because: " << ec.message() << std::endl;
    return false;
  }
  return true;
}

void send_action(
    websocketpp::client<websocketpp::config::asio_client>& client,
    websocketpp::connection_hdl hdl,
    Action a) {
  if (a.action == OPEN) {
    send(client, hdl, absl::StrFormat("open %i %i", a.point.x, a.point.y));
  } else if (a.action == MARK) {
    send(client, hdl, absl::StrFormat("mark %i %i", a.point.x, a.point.y));
  } else if (a.action == PASS) {
    // ignore
  } else if (a.action == QUIT) {
    done = true;
  } else {
    std::cout << "Dropping action: " << a.action << std::endl;
  }
}

void send_view(
    websocketpp::client<websocketpp::config::asio_client>& client,
    websocketpp::connection_hdl hdl,
    Recti view) {
  send(client, hdl, absl::StrFormat(
      "view %i %i %i %i", view.tl.x, view.tl.y, view.br.x, view.br.y));
}

void on_message(
    websocketpp::client<websocketpp::config::asio_client>& client,
    websocketpp::connection_hdl hdl, 
    websocketpp::config::asio_client::message_type::ptr msg) {
  std::string payload = msg->get_payload();
  std::istringstream iss(payload);
  std::string command;

  // Parse the command
  iss >> command;

  if (command == "grid") {
    int x, y, u;
    iss >> x >> y >> u;
    std::cout << absl::StrFormat("grid: %ix%i, userid: %i\n", x, y, u);
    {
      auto s = state.lock();
      s->dims = Pointi(x, y);
      s->userid = u;
    }
    send(client, hdl, absl::StrFormat("register %s", absl::GetFlag(FLAGS_name)));
  } else if (command == "update") {
    int c, x, y, user;
    iss >> c >> x >> y >> user;
    Update update{CellState(c), {x, y}, user};
    state.lock()->updates.push_back(update);
  } else if (command == "join") {
    int userid;
    std::string username;
    iss >> userid >> username;
    std::cout << absl::StrFormat("User id: %i, name: %s\n", userid, username);
  } else if (command == "reset") {
    auto s = state.lock();
    s->agent->reset();
    s->updates.clear();
  }
}

int main(int argc, char **argv) {
  absl::ParseCommandLine(argc, argv);

  std::string uri = absl::StrFormat("ws://%s:%i/minefield", absl::GetFlag(FLAGS_host), absl::GetFlag(FLAGS_port));
  std::cout << "Connecting to: " << uri << std::endl;

  websocketpp::client<websocketpp::config::asio_client> client;

  client.clear_access_channels(websocketpp::log::alevel::all);
  client.clear_error_channels(websocketpp::log::elevel::all);

  client.init_asio();

  client.set_message_handler([&client](auto a, auto b) {on_message(client, a, b);});
  client.set_close_handler([](auto a) { done = true; });

  websocketpp::lib::error_code ec;
  websocketpp::client<websocketpp::config::asio_client>::connection_ptr con = client.get_connection(uri, ec);
  if (ec) {
      std::cout << "Connection failed: " << ec.message() << std::endl;
      return 0;
  }

  // Note that connect here only requests a connection. No network messages are
  // exchanged until the event loop starts running in the next line.
  client.connect(con);

  // Start the ASIO io_service run loop
  // this will cause a single connection to be made to the server. client.run()
  // will exit when this connection is closed.
  std::thread thread = std::thread([&client]() { client.run(); });

  Recti view;
  while (!done) {
    if (state.lock()->agent) {
      Action action;
      Rectf cur_viewf;
      {
        auto s = state.lock();
        action = s->agent->step(s->updates, false);
        s->updates.clear();
        cur_viewf = s->agent->get_view();
      }
      // Add a small buffer so you can scroll a bit or zoom out once without latency.
      cur_viewf = Rectf::from_center_size(cur_viewf.center(), cur_viewf.size() * 1.5);
      Recti cur_view = cur_viewf.recti();
      send_action(client, con->get_handle(), action);
      if (view != cur_view) {
        send_view(client, con->get_handle(), cur_view);
        view = cur_view;
      }
    } else {
      auto s = state.lock();
      if (s->userid > 0) {
        assert(s->dims.x > 0 && s->dims.y > 0);
        s->agent = std::make_unique<AgentSFML>(s->dims, s->userid, absl::GetFlag(FLAGS_window));
      }
    }

    std::this_thread::sleep_for(std::chrono::microseconds(1000000/60));
  }

  // Disconnect.
  client.close(con->get_handle(), websocketpp::close::status::going_away, "");
  thread.join();

  // agent.reset();

  return 0;
}
