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

COLORS = (np.array([
    [0.5, 0.5, 0.5],  # 0: grey
    [0, 0, 1],        # 1: blue
    [0, 0.8, 0],      # 2: green
    [0.8, 0, 0],      # 3: red
    [0.5, 0, 0.5],    # 4: purple
    [0.6, 0.3, 0],    # 5: brown
    [0, 1, 1],        # 6: cyan
    [0.2, 0.2, 0.2],  # 7: dark grey
    [0, 0, 0],        # 8: black
    [1, 1, 1],        # Bomb: white
    [0.8, 0.8, 0.8],  # Hidden: light grey
    # [1, 0.4, 0.75],   # Mark: pink
    [0, 0, 0],        # Mark: black?
]) * 255).astype(np.uint8)


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
      # print(bombs)
      self._bombs = counts(bombs)
      # print(state)
      y, x = (self._bombs == 0).nonzero()
      zeros = np.array(zip(y, x))
      if len(zeros) == 0:
        continue
      y, x = zeros[np.random.randint(len(zeros))]
      return self.step(Action.OPEN, y, x)

  def step(self, action, y, x):
    if action == Action.MARK:
      if self._visible[y, x] == Cell.HIDDEN:
        self._visible[y, x] = Cell.MARK
      return self._visible, 0

    q = [(y, x)]
    score = 0
    while q:
      y, x = q.pop()
      if self._visible[y, x] != Cell.HIDDEN:
        continue
      state = self._bombs[y, x]
      self._visible[y, x] = state
      if state == 0:
        for i, j in neighbors(self._visible, y, x):
          q.append((i, j))
      elif state == 9:
        score = -1
    return self._visible, score


class Agent(object):

  def __init__(self):
    self.reset()

  def reset(self):
    self._actions = []
    self._mask = None

  def step(self, state):
    if self._actions:
      return self._actions.pop()

    if self._mask is None:
      self._mask = state > Cell.ZERO

    padded = np.pad(state, 1, 'constant', constant_values=0)
    hidden = sum(np.roll(padded, n, (0, 1)) == Cell.HIDDEN for n in NEIGHBORS)[1:-1, 1:-1]
    marked = sum(np.roll(padded, n, (0, 1)) == Cell.MARK for n in NEIGHBORS)[1:-1, 1:-1]

    to_open = (marked == state) & self._mask
    to_mark = (hidden == state - marked) & self._mask
    for y, x in zip(*(to_open.nonzero())):
      for i, j in neighbors(state, y, x): 
        if state[i, j] == Cell.HIDDEN:
          self._actions.append((Action.OPEN, i, j))
    for y, x in zip(*(to_mark.nonzero())):
      for i, j in neighbors(state, y, x): 
        if state[i, j] == Cell.HIDDEN:
          self._actions.append((Action.MARK, i, j))

    self._mask = self._mask ^ (to_mark | to_open)

    np.random.shuffle(self._actions)

    if self._actions:
      return self._actions.pop()


def draw(window, state):
  raw_surface = pygame.surfarray.make_surface(COLORS[state])
  pygame.transform.scale(raw_surface, window.get_size(), window)
  pygame.display.flip()


def counts(bombs):
  padded = np.pad(bombs, 1, 'constant', constant_values=0)
  count = sum(np.roll(padded, n, (0, 1)) for n in NEIGHBORS)
  count = count[1:-1, 1:-1]
  count[bombs] = Cell.BOMB
  return count


def neighbors(state, y, x):
  ymax, xmax = state.shape
  for n in NEIGHBORS:
    i, j = y + n[0], x + n[1]
    if 0 <= i < ymax and 0 <= j < xmax:
      yield i, j


def render_thread(obs_queue, window):
  while True:
    obs = obs_queue.get()
    if obs_queue.empty():
      # Only render the latest observation so we keep up.
      draw(window, obs)
    obs_queue.task_done()


def main():
  parser = argparse.ArgumentParser(description='Minesweeper')
  parser.add_argument('--mines', default=15, type=int, help='Mines percentage')
  parser.add_argument('--px_size', default=10, type=int, help='Pixel size')
  parser.add_argument('--aps', default=0, type=float, help='Max actions per second')
  parser.add_argument('--window_fraction', type=float, default=0.75,
                      help='How big should the window be relative to resolution.')
  args = parser.parse_args()

  if args.aps == 0:
    args.aps = 30000 // args.px_size

  pygame.init()
  display_info = pygame.display.Info()
  display_size = np.array([display_info.current_w, display_info.current_h])
  window_size = (display_size * args.window_fraction).astype(np.int32)
  window = pygame.display.set_mode(window_size, 0, 0)
  pygame.display.set_caption("Minesweeper")

  obs_queue = queue.Queue()
  renderer = threading.Thread(target=render_thread, name="Renderer", 
                              args=(obs_queue, window,))
  renderer.daemon = True
  renderer.start()

  grid = window_size.transpose() // args.px_size
  print("grid:", grid)

  env = Env(grid, args.mines / 100)
  state, score = env.reset()
  agent = Agent()
  agent.reset()

  step = 0
  try:
    start = time.time()
    while True:
      step += 1
      step_start_time = time.time()
      obs_queue.put(state)
      action = agent.step(state)
      if action:
        state, score = env.step(*action)
      else:
        time.sleep(3)
        state, score = env.reset()
        agent.reset()

      for event in pygame.event.get():
        if event.type == pygame.QUIT:
          return
        elif event.type == pygame.KEYDOWN:
          if event.key in (pygame.K_ESCAPE, pygame.K_F4):
            return
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


if __name__ == "__main__":
  main()
