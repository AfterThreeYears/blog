## 用法

```javascript
const mem = require('mem');

let i = 0;
const counter = () => ++i;
const memoized = mem(counter);

memoized('foo');
//=> 1

// Cached as it's the same arguments
memoized('foo');
//=> 1

// Not cached anymore as the arguments changed
memoized('bar');
//=> 2

memoized('bar');
//=> 2

```

## 源码学习

### 主体逻辑

1. 首先每次初始化的时候会往 cacheStore 里设置一个缓存器，默认为new Map()
2. 然后通过传入的key来从map里获取上一次的值，第一次自然是空的
3. 还可以配置maxAge进行缓存过期
4. Promise


cacheStore 
```javascript
// 缓存器的容器 之所以这里不用new Map(),是因为WeakMap会不对引用的对象进行计数,避免了内存泄漏
const cacheStore = new WeakMap();

// 设置一个新的缓存到缓存容器里
cacheStore.set(memoized, opts.cache);
```

传入的key有一定的规则
```javascript
/**
 * 返回缓存的key
 * @param {*} x 需要是一个原始值 number string booean symbol, 其他的会被JSON.stringify转换成string，并且不是是null undefined
 */
const defaultCacheKey = function (x) {
	if (arguments.length === 1 && (x === null || x === undefined || (typeof x !== 'function' && typeof x !== 'object'))) {
		return x;
	}

	return JSON.stringify(arguments);
};
```

缓存的主体逻辑
首先从cacheStore中获取相关的cahce
然后从cahce根据key返回结果
如果是第一次，那么会运行用户函数，返回结果，进行缓存，以备下次使用
```javascript
const memoized = function () {
	const cache = cacheStore.get(memoized);
	// 获取缓存key
	const key = opts.cacheKey.apply(null, arguments);

	// 从结果缓存中获取相关的缓存结果
	if (cache.has(key)) {
		const c = cache.get(key);
		// 如果没有设置maxAge，那么永远不过去，否则根据maxAge进行过期
		if (typeof opts.maxAge !== 'number' || Date.now() < c.maxAge) {
			return c.data;
		}
		// 过期了清空缓存
		cache.delete(key);
	}

	// 执行用户函数
	const ret = fn.apply(this, arguments);

	const setData = (key, data) => {
		cache.set(key, {
			data,
			maxAge: Date.now() + (opts.maxAge || 0)
		});
	};

	// 缓存结果
	setData(key, ret);
	if (isPromise(ret) && opts.cachePromiseRejection === false) {
		// Remove rejected promises from cache unless `cachePromiseRejection` is set to `true`
		ret.catch(() => cache.delete(key));
	}

	return ret;
};

```

提供了clear的功能
```javascript
module.exports.clear = fn => {
// 清空整个map
const cache = cacheStore.get(fn);

if (cache && typeof cache.clear === 'function') {
	cache.clear();
}
};
```

 ### 写在最后
 cache 中的数据过期了或者一直不被使用的话，会造成内存泄漏

 https://github.com/sindresorhus/mem/issues/14 
 这里修复了这个问题