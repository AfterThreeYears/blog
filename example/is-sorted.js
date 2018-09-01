const isSorted = require('is-sorted');

isSorted([1, 2, 3]);

isSorted([3, 2, 1]);

isSorted([3, 2, 1], (a, b) => {
  return b - a;
});

isSorted([1, [], {}], (a, b) => {
  const aa = parseFloat(a, 10);
  const bb = parseFloat(a, 10);
  if (!isNaN(aa) && !isNaN(bb)) {
    return aa - bb;
  }
  return String(a).trim().localeCompare(String(b).trim());
});