.PHONY: clean fresh installdeps run run_test gendeps

# https://www.gnu.org/software/make/manual/html_node/Implicit-Variables.html
# CXX = g++
CXX = clang++
CXXFLAGS = -Wall -std=c++23 -pthread -g -O3 -I. -Ibeauty/include
CXXFLAGS += -fvisibility=hidden -Bsymbolic  # https://www.youtube.com/watch?v=_enXuIxuNV4
# LDFLAGS =

# For profiling:
# CXXFLAGS += -pg
# LDFLAGS += -pg -g

LDLIBS = -lsfml-graphics -lsfml-window -lsfml-system
LDLIBS += -Lbeauty -leauty
LDLIBS += $$(pkg-config absl_algorithm_container --libs)
LDLIBS += $$(pkg-config absl_flags --libs)
LDLIBS += $$(pkg-config absl_flags_parse --libs)
LDLIBS += $$(pkg-config absl_flat_hash_map --libs)
LDLIBS += $$(pkg-config absl_random_random --libs)
LDLIBS += $$(pkg-config absl_strings --libs)

all: minesweeper minesweeper-server minesweeper-client minesweeper-agent test

minesweeper: \
		beauty/libeauty.a \
		src/agent_last.o \
		src/agent_random.o \
		src/agent_sfml.o \
		src/agent_websocket.o \
		src/env.o \
		src/kdtree.o \
		src/minesweeper.o \
		src/point.o \
		src/random.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

minesweeper-server: \
		beauty/libeauty.a \
		src/env.o \
		src/kdtree.o \
		src/minesweeper-server.o \
		src/point.o \
		src/random.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

minesweeper-client: \
		beauty/libeauty.a \
		src/agent_sfml.o \
		src/minesweeper-client.o \
		src/point.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

minesweeper-agent: \
		beauty/libeauty.a \
		src/agent_last.o \
		src/agent_random.o \
		src/agent_sfml.o \
		src/env.o \
		src/kdtree.o \
		src/minesweeper-agent.o \
		src/point.o \
		src/random.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

test: \
		catch2/catch_amalgamated.o \
		src/agent_last.o \
		src/agent_random.o \
		src/env.o \
		src/env_test.o \
		src/kdtree.o \
		src/kdtree_test.o \
		src/point.o \
		src/point_test.o \
		src/random.o \
		src/random_test.o \
		src/thread_test.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

beauty/libeauty.a:
	$(MAKE) -C beauty libeauty.a

run: all
	./minesweeper

run_test: test
	./test --skip-benchmarks

run_benchmark: test
	./test

# Useful for finding flaky tests.
run_test_repeat: test
	for _ in $$(seq 1 100); do ./test --skip-benchmarks || exit 1; done

benchmark: minesweeper
	echo "\033[0;32mBenchmarking... \033[1;33m Expect hidden <= 15898\033[0m"
	./minesweeper --size 240 --benchmark=true --window 0 --port 0 --seed 43
	./minesweeper --size 240 --benchmark=true --window 0 --port 0 --seed 43
	./minesweeper --size 240 --benchmark=true --window 0 --port 0 --seed 43

clean:
	rm -f \
		*/*.o \
		.Makefile \
		minesweeper \
		minesweeper-client \
		test
	$(MAKE) -C beauty clean

fresh: clean all

installdeps:
	sudo apt install \
		build-essential clang libabsl-dev libboost-all-dev libsfml-dev

gendeps: .Makefile

.Makefile: # contains the actual dependencies for all the .o files above
	CXX="${CXX}" CXXFLAGS="${CXXFLAGS}" ./gendeps.sh catch2 src > .Makefile

include .Makefile
