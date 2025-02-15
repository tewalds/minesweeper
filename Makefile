.PHONY: clean fresh installdeps run run_test gendeps

# https://www.gnu.org/software/make/manual/html_node/Implicit-Variables.html
# CXX = g++
CXX = clang++
CPPFLAGS = -Wall -std=c++23 -pthread -g -O3 -I. -Ibeauty/include
CPPFLAGS += -fvisibility=hidden -Bsymbolic  # https://www.youtube.com/watch?v=_enXuIxuNV4
# LDFLAGS =

# For profiling:
# CPPFLAGS += -pg
# LDFLAGS += -pg -g

LDLIBS = -lsfml-graphics -lsfml-window -lsfml-system
LDLIBS += -Lbeauty -leauty
LDLIBS += $$(pkg-config absl_algorithm_container --libs)
LDLIBS += $$(pkg-config absl_flags --libs)
LDLIBS += $$(pkg-config absl_flags_parse --libs)
LDLIBS += $$(pkg-config absl_flat_hash_map --libs)
LDLIBS += $$(pkg-config absl_random_random --libs)
LDLIBS += $$(pkg-config absl_strings --libs)

all: minesweeper minesweeper-client

minesweeper: \
		beauty/libeauty.a \
		src/agent_last.o \
		src/agent_random.o \
		src/agent_sfml.o \
		src/agent_websocket.o \
		src/env.o \
		src/kdtree.o \
		src/minesweeper.o \
		src/point.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

minesweeper-client: \
		beauty/libeauty.a \
		src/agent_sfml.o \
		src/minesweeper-client.o \
		src/point.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

test: \
		catch2/catch_amalgamated.o \
		src/kdtree.o \
		src/kdtree_test.o \
		src/point.o \
		src/point_test.o \
		src/thread_test.o
	$(CXX) $(LDFLAGS) -o $@ $^ $(LOADLIBES) $(LDLIBS)

beauty/libeauty.a:
	make -C beauty libeauty.a

run: all
	./minesweeper

run_test: test
	./test

clean:
	rm -f \
		*/*.o \
		.Makefile \
		minesweeper \
		minesweeper-client \
		test
	make -C beauty clean

fresh: clean all

installdeps:
	sudo apt install \
		build-essential clang libabsl-dev libboost-all-dev libsfml-dev

gendeps: .Makefile

.Makefile: # contains the actual dependencies for all the .o files above
	CXX="${CXX}" CPPFLAGS="${CPPFLAGS}" ./gendeps.sh catch2 src > .Makefile

include .Makefile
