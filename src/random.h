#pragma once

#include <stdint.h>


class Splitmix64 {
  // https://en.wikipedia.org/wiki/Xorshift#Initialization
public:
  using result_type = uint64_t;
  static constexpr result_type min() { return 1; }
  static constexpr result_type max() { return (result_type)-1; }

  Splitmix64(uint64_t seed_ = 0) { seed(seed_); }
  void seed(uint64_t seed_);
  result_type operator()() { return rand(); }
protected:
  result_type rand() {
    uint64_t result = (state += 0x9E3779B97f4A7C15);
    result = (result ^ (result >> 30)) * 0xBF58476D1CE4E5B9;
    result = (result ^ (result >> 27)) * 0x94D049BB133111EB;
    return result ^ (result >> 31);
  }
private:
  uint64_t state;
};

inline uint64_t rol64(uint64_t x, int k) {
	return (x << k) | (x >> (64 - k));
}

class Xoshiro256pp {
  // https://en.wikipedia.org/wiki/Xorshift#xoshiro256++
public:
  using result_type = uint64_t;
  static constexpr result_type min() { return 1; }
  static constexpr result_type max() { return (result_type)-1; }

  Xoshiro256pp(uint64_t seed_ = 0) { seed(seed_); }
  void seed(uint64_t seed_);

  result_type operator()() { return rand(); }
protected:
  result_type rand() {
    uint64_t const result = rol64(s[0] + s[3], 23) + s[0];
    uint64_t const t = s[1] << 17;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = rol64(s[3], 45);

    return result;
  }
private:
  uint64_t s[4];
};

