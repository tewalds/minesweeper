#!/usr/bin/python

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import functools
import os
import queue
import re
import sys
import threading
import time

from future.builtins import range  # pylint: disable=redefined-builtin
import enum
import numpy as np
import pygame


NEIGHBORS = np.array([
    [-1, -1], [-1, 0], [-1, 1],
    [ 0, -1],          [ 0, 1],
    [ 1, -1], [ 1, 0], [ 1, 1],
])


def grey(g):
  return pygame.Color(g, g, g)

def hsla(h, s, l, a=100):
  c = pygame.Color(0)
  c.hsla = h, s, l, a
  return c

COLORS = np.array([
    grey(127),           # 0: grey
    hsla(240, 100, 60),  # 1: blue
    hsla(120, 100, 60),  # 2: green
    hsla(0,  100, 60),   # 3: red
    hsla(300, 100, 30),  # 4: purple
    hsla(180, 100, 40),  # 5: cyan
    hsla(60, 100, 50),   # 6: yellow
    grey(95),            # 7: dark grey
    grey(64),            # 8: darker grey
    grey(255),           # Bomb: white
    grey(215),           # Hidden: light grey
    grey(0),             # Mark: black
])[:, :3].astype(np.uint8)


class Cell(enum.IntEnum):
  ZERO = 0
  ONE = 1
  TWO = 2
  THREE = 3
  FOUR = 4
  FIVE = 5
  SIX = 6
  SEVEN = 7
  EIGHT = 8
  BOMB = 9
  HIDDEN = 10
  MARK = 11


class Action(enum.Enum):
  OPEN = 1
  MARK = 2


class Env(object):

  def __init__(self, size, fraction):
    self._size = size
    self._fraction = fraction

  def reset(self):
    self._visible = np.zeros(self._size, dtype=np.int)
    self._visible.fill(Cell.HIDDEN)
    while True:
      num = np.prod(self._size)
      state = np.arange(num)
      np.random.shuffle(state)
      bombs = state < num * self._fraction
      bombs = bombs.reshape(self._size)
      self._counts = convolve(bombs)
      self._counts[bombs] = Cell.BOMB
      zeros = list(zip(*((self._counts == 0).nonzero())))
      if len(zeros) == 0:
        continue
      y, x = zeros[np.random.randint(len(zeros))]
      return self.step(Action.OPEN, y, x)

  def step(self, action, y, x):
    if self._visible[y, x] != Cell.HIDDEN:
      return
    if action == Action.MARK:
      self._visible[y, x] = Cell.MARK
      return self._visible, 0

    q = {(y, x)}
    score = 0
    while q:
      y, x = q.pop()
      state = self._counts[y, x]
      self._visible[y, x] = state
      if state == Cell.ZERO:
        for i, j in neighbors(self._visible, y, x):
          if self._visible[y, x] == Cell.HIDDEN:
            q.add((i, j))
      elif state == Cell.BOMB:
        score = -1
    return self._visible, score


class Agent(object):

  def __init__(self):
    self.reset()

  def reset(self):
    self._actions = []

  def step(self, state):
    if self._actions:
      return self._actions.pop()

    is_hidden = (state == Cell.HIDDEN)
    num_hidden = convolve(is_hidden)
    num_marked = convolve(state == Cell.MARK)

    to_open = is_hidden & (convolve(num_marked == state) > 0)
    to_mark = is_hidden & (convolve(num_hidden == state - num_marked) > 0)

    for y, x in zip(*(to_open.nonzero())):
      self._actions.append((Action.OPEN, y, x))
    for y, x in zip(*(to_mark.nonzero())):
      self._actions.append((Action.MARK, y, x))

    np.random.shuffle(self._actions)

    if self._actions:
      return self._actions.pop()


def convolve(state):
  padded = np.pad(state, 1, 'constant', constant_values=0)
  return sum(np.roll(padded, n, (0, 1)) for n in NEIGHBORS)[1:-1, 1:-1]


def draw(window, state):
  try:
    raw_surface = pygame.surfarray.make_surface(COLORS[state])
    pygame.transform.scale(raw_surface, window.get_size(), window)
    pygame.display.flip()
  except pygame.error:
    pass


def neighbors(state, y, x):
  ymax, xmax = state.shape
  for n in NEIGHBORS:
    i, j = y + n[0], x + n[1]
    if 0 <= i < ymax and 0 <= j < xmax:
      yield i, j


render_count = 0
def render_thread(obs_queue, window):
  global render_count
  while True:
    obs = obs_queue.get()
    if obs_queue.empty():
      # Only render the latest observation so we keep up.
      draw(window, obs)
      render_count += 1
    obs_queue.task_done()


def main():
  parser = argparse.ArgumentParser(description='Minesweeper')
  parser.add_argument('--mines', default=15, type=int, help='Mines percentage')
  parser.add_argument('--px_size', default=10, type=int, help='Pixel size')
  parser.add_argument('--aps', default=0, type=float, help='Max actions per second')
  parser.add_argument('--window_fraction', type=float, default=0.75,
                      help='How big should the window be relative to resolution.')
  parser.add_argument('--fullscreen', action='store_true')
  args = parser.parse_args()

  if args.aps == 0:
    args.aps = 30000 // args.px_size

  pygame.init()
  display_info = pygame.display.Info()
  display_size = np.array([display_info.current_w, display_info.current_h])
  window_size = display_size.astype(np.int32)
  flags = pygame.HWSURFACE | pygame.DOUBLEBUF
  if args.fullscreen:
    flags |= pygame.FULLSCREEN
  else:
    window_size = (display_size * args.window_fraction).astype(np.int32)

  window = pygame.display.set_mode(window_size, flags, 0)
  pygame.display.set_caption("Minesweeper")

  obs_queue = queue.Queue()
  renderer = threading.Thread(target=render_thread, name="Renderer", 
                              args=(obs_queue, window,))
  renderer.daemon = True
  renderer.start()

  grid = window_size.transpose() // args.px_size
  print("grid:", grid)

  env = Env(grid, args.mines / 100)
  agent = Agent()

  step = 0
  wait = 0
  run = True
  try:
    start = time.time()
    while True:
      step += 1
      step_start_time = time.time()
      if run:
        if wait >= 0:
          if wait == 0:
            state, score = env.reset()
            agent.reset()
          wait -= 1
        else:
          obs_queue.put(state)
          action = agent.step(state)
          if action:
            state, score = env.step(*action)
          else:
            wait = args.aps * 3

      for event in pygame.event.get():
        if event.type == pygame.QUIT:
          return
        elif event.type == pygame.KEYDOWN:
          if event.key in (pygame.K_ESCAPE, pygame.K_F4):
            return
          elif event.key in (pygame.K_SPACE, pygame.K_PAUSE):
            run = not run
            if wait > 0:
              wait = 0
          elif event.key in (pygame.K_PAGEUP, pygame.K_PAGEDOWN):
            args.aps *= 1.25 if event.key == pygame.K_PAGEUP else 1 / 1.25
            print("New max aps: %.1f" % args.aps)
      elapsed_time = time.time() - step_start_time
      time.sleep(max(0, 1 / args.aps - elapsed_time))
  except KeyboardInterrupt:
    pass
  finally:
    elapsed = time.time() - start
    print("Ran %s steps in %0.3f seconds: %.0f steps/second" % (step, elapsed, step / elapsed))
    print("Rendered %s steps in %0.3f seconds: %.0f steps/second" % (render_count, elapsed, render_count / elapsed))


if __name__ == "__main__":
  main()
