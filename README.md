# Minesweeper
A minesweeper environment, agent, server and client. 

Features:
- An environment that can handle resolutions in the millions of cells
- Agents that can play millions of moves per second
- A SFML based UI that lets you play locally, including zoom/pan, though it renders the cells as 
  colored pixels that represent the numbers.
- A websocket server that can handle multiple clients simultaneously, and serve the web client.
- A websocket client that can connect to a server and uses the SFML UI.
- A web client that lets you play from a web browser.

## Installation

[![C++ CI](https://github.com/tewalds/minesweeper/actions/workflows/build-test-cpp.yml/badge.svg)](https://github.com/tewalds/minesweeper/actions/workflows/build-test-cpp.yml)

```bash
git clone --recurse-submodules https://github.com/tewalds/minesweeper.git
cd minesweeper
make installdeps  # Installs build dependencies, only works on debian-based systems.
make
```

## Running

Run the server:
```bash
./minesweeper
```

Run the client:
```bash
./minesweeper-client
```

Run the tests:
```bash
make test && ./test
```

## Old stuff

There's a python implementation of the environment and agent as well, but it may not work with the
latest versions of python or pygame, and is obviously much slower, and now less featureful.

## TODO

### Playtest-ready
- Accounts (Timo) 
- Account Screens (Alex)
- Show other players (Alex)
- Scoring (Timo)
- Bots (Timo)
- Game feel (Alex)
- Cursors (Timo)
- Persistent game state (Timo)
  - Decide between LMDB, Tkrzw or RocksDB, all of which seem reasonable.

### Other
- Support reset (Alex)
- Drag-to-scroll (Alex)
- How to deploy (Timo)
- Sanitize input (Timo)
