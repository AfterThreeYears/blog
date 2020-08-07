## 用法

```javascript
const flatten = require('arr-flatten');
const assert = require('assert');

assert.equal(JSON.stringify(flatten(['a', ['b', 'c']])), JSON.stringify(['a', 'b', 'c']));

console.log('success');
```

## 源码学习

### 主体逻辑
1. 传入需要处理的数据和初始值
2. 遍历每一项, 如果这一项是数组，则进行递归操作即可

```javascript
module.exports = function (arr) {
	// 传入需要处理的数据和初始值
  return flat(arr, []);
};

function flat(arr, res) {
  var i = 0, cur;
  var len = arr.length;
  for (; i < len; i++) {
		cur = arr[i];
		// 遍历每一项, 如果这一项是数组，则进行递归操作即可
    Array.isArray(cur) ? flat(cur, res) : res.push(cur);
  }
  return res;
}
```

// Update by 1596788110969

// Update by 1596788197760
