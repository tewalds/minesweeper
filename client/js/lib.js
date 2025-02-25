
// https://stackoverflow.com/a/32922084
function deepEqual(x, y) {
  if (x && y && typeof x === 'object' && typeof y === 'object') {
    return (Object.keys(x).length === Object.keys(y).length) &&
            Object.keys(x).every(key => deepEqual(x[key], y[key]));
  } else {
    return (x === y);
  }
}