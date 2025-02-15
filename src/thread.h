
#pragma once

#include <thread>
#include <utility>


template <class T>
class MutexLocked {
 public:
  T *operator->() const { return v; }
  T &operator*() const { return *v; }

 private:
  MutexLocked(std::mutex &mutex, T *v_) : m_lock{std::lock_guard(mutex)}, v{v_} { }

  std::lock_guard<std::mutex> m_lock;
  T *v;

  template <class T_>
  friend class MutexProtected;
};

template <class T>
class MutexProtected {
 public:
  template<typename... Args>
  MutexProtected(Args&&... args) : mutex{}, v(std::forward<Args>(args)...) {}
  MutexProtected(const T& v_) : mutex{}, v(v_) {}

  MutexLocked<T> lock() { return MutexLocked(mutex, &v); }

 private:
  std::mutex mutex;
  T v;
};
