## 用法

```javascript
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

```

## 源码学习

### 主体逻辑

1. 判断是否是数组，不是则抛出错误
2. 优先使用用户的comparator，如果没有使用用户的comparator
3. 然后通过后一个和前一个的比较，如果发现不符合comparator的规则，返回false。

```javascript
function defaultComparator (a, b) {
  return a - b
}

module.exports = function checksort (array, comparator) {
  // 首先判断是否是数组
  if (!Array.isArray(array)) throw new TypeError('Expected Array, got ' + (typeof array))
  // 然后使用用户的排序器或者默认的排序器
  comparator = comparator || defaultComparator

  // 后一个和前一个对比，如果通过排序器发现不符合要求，就停止返回false
  for (var i = 1, length = array.length; i < length; ++i) {
    if (comparator(array[i - 1], array[i]) > 0) return false
  }

  return true
}
```

内置的排序器对于数字以外的排序很无力，所以推荐以下排序器
```javascript
/*
* 首先转换成数组，都不是NaN的情况下，直接对比
* 否则转换为字符串使用localeCompare方法进行对比
*/
(a, b) => {
  const aa = parseFloat(a, 10);
  const bb = parseFloat(a, 10);
  if (!isNaN(aa) && !isNaN(bb)) {
    return aa - bb;
  }
  return String(a).trim().localeCompare(String(b).trim());
}
```