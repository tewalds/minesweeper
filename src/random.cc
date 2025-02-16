#include <chrono>

#include "random.h"

// https://code.google.com/p/smhasher/wiki/MurmurHash3
inline uint64_t murmur_hash3_64(uint64_t h){
	h ^= h >> 33;
	h *= 0xff51afd7ed558ccdull;
	h ^= h >> 33;
	h *= 0xc4ceb9fe1a85ec53ull;
	h ^= h >> 33;
	return h;
}

uint64_t gen_random_seed() {
  auto now = std::chrono::high_resolution_clock::now();
  auto duration_since_epoch = now.time_since_epoch();
  return std::chrono::duration_cast<std::chrono::nanoseconds>(duration_since_epoch).count();
}

void Splitmix64::seed(uint64_t seed_) {
  if (seed_ == 0) {
    seed_ = murmur_hash3_64(gen_random_seed());
  }
  state = seed_;
}

void Xoshiro256pp::seed(uint64_t seed_) {
  if (seed_ == 0) {
    seed_ = murmur_hash3_64(gen_random_seed());
  }
  Splitmix64 r(seed_);
  s[0] = r();
  s[1] = r();
  s[2] = r();
  s[3] = r();
}
