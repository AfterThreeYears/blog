## 介绍
 array-first传入一个数组和一个数字，返回从数组开头对应的值，默认返回第一个，否则返回一个数组

 array-last传入一个数组和一个数字，返回从数组结尾对应的值，默认返回最后第一个，否则返回从后往前截取一个数组

## 用法

- array-first
```javascript
const first = require('array-first');

const array = [1, 2, 3, 4, 5];
 
console.log(first(array));

console.log(first(array, 3))
```
- array-last
```javascript
const last = require('array-last');

const array = [1, 2, 3, 4, 5];
 
console.log(last(array));

console.log(last(array, 3))
```

## 源码学习

### array-first主体逻辑

1. 容错处理
2. 传入空数组，返回null
3. 否则使用slice进行切割返回原数组的副本，不对原数组进行处理

```javascript
module.exports = function arrayFirst(arr, num) {
  // 容错处理
  if (!Array.isArray(arr)) {
    throw new Error('array-first expects an array as the first argument.');
  }

  // 传入空数组，返回null
  if (arr.length === 0) {
    return null;
  }

  // 否则使用slice进行切割返回原数组的副本，不对原数组进行处理
  var first = slice(arr, 0, isNumber(num) ? +num : 1);
  if (+num === 1 || num == null) {
    return first[0];
  }
  return first;
};
```

这里要提到的是作者没有使用Array.prototype.slice, 而是自己实现了slice方法
大致是对用户传入的start和end进行处理, 能够处理负数的情况，和原生的slice保持一致
```javascript
// slice.js
start = idx(len, start);
end = idx(len, end, len);
function idx(len, pos, end) {
  if (pos == null) {
    pos = end || 0;
  } else if (pos < 0) {
    pos = Math.max(len + pos, 0);
  } else {
    pos = Math.min(pos, len);
  }

  return pos;
}
```

### array-last主体逻辑

```javascript

module.exports = function last(arr, n) {
  // 容错处理
  if (!Array.isArray(arr)) {
    throw new Error('expected the first argument to be an array');
  }

  // 空数组返回null
  var len = arr.length;
  if (len === 0) {
    return null;
  }

  /**
   * 默认获取最后一个
   */
  n = isNumber(n) ? +n : 1;
  if (n === 1) {
    return arr[len - 1];
  }

  // 构造一个空数组，把老数组里的值从后往前填充入新数组
  var res = new Array(n);
  while (n--) {
    // 这里需要注意的是，要先对len减去一位，否则会出现一个undefined
    res[n] = arr[--len];
  }
  return res;
};
```

以上代码对于负值的情况没有做出处理
推荐以下改进

```javascript
// 这里没有对负值进行容错,会导致new Array(-1) 抛出异常
n = Math.max(0, n);
var res = new Array(n);
while (n--) {
  res[n] = arr[--len];
}
return res;
```

已经向作者提交[merge request](https://github.com/jonschlinkert/array-last/pull/9)