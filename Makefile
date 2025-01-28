EXEC = minesweeper

OBJECTS = minesweeper.o kdtree.o

# https://www.gnu.org/software/make/manual/html_node/Implicit-Variables.html
# CXX = g++
CXX = clang++
CPPFLAGS = -Wall -std=c++23 -O3
# LDFLAGS =

# For profiling:
# CPPFLAGS += -pg
# LDFLAGS += -pg -g

LDLIBS = -lsfml-graphics -lsfml-window -lsfml-system 
LDLIBS += $$(pkg-config absl_flags --libs)
LDLIBS += $$(pkg-config absl_flags_parse --libs)
LDLIBS += $$(pkg-config absl_flat_hash_map --libs)
LDLIBS += $$(pkg-config absl_random_random --libs)
LDLIBS += $$(pkg-config absl_strings --libs)

all: $(EXEC)

$(EXEC): $(OBJECTS)
	$(CXX) $(LDFLAGS) -o $@ $^ $(LDLIBS)

run: all
	./$(EXEC)

clean:
	rm -f *.o $(EXEC)

fresh: clean all

gendeps:
	ls *.cc -1 | xargs -L 1 cpp -M -MM

############ everything below is generated by: make gendeps
minesweeper.o: minesweeper.cc kdtree.h
kdtree.o: kdtree.cc kdtree.h
