## 用法

```javascript
const username = require('username');

console.log(username.sync());

(async () => {
  console.log(await username());
})();

```

## 源码学习

### 主体逻辑

首先通过env上面的SUDO_USER C9_USER LOGNAME USER LNAME USERNAME获取用户名

```javascript
const getEnvVar = () => {
	const {env} = process;

	return env.SUDO_USER ||
		env.C9_USER /* Cloud9 */ ||
		env.LOGNAME ||
		env.USER ||
		env.LNAME ||
		env.USERNAME;
};
```

异步
```javascript
// 通过环境变量获取用户名
const envVar = getEnvVar();

if (envVar) {
  return Promise.resolve(envVar);
}

// 环境变量里没有用户名的话，从os中获取
// os 新增于: v6.0.0, 所以需要判断一下
if (os.userInfo) {
  return Promise.resolve(os.userInfo().username);
}

// window系统的话，通过whoami的标准输出中使用正则匹配出用户名，并且用空函数noop吞噬异常
if (process.platform === 'win32') {
  return execa('whoami').then(x => cleanWinCmd(x.stdout)).catch(noop);
}

// 其他系统使用 id -un 返回用户名
return execa('id', ['-un']).then(x => x.stdout).catch(noop);

```

同步
```javascript
/**
 * 同步和异步的区别是
 * 同步使用try catch捕获错误
 * 使用各种同步api获取用户名
 * 直接返回结果
*/
module.exports.sync = mem(() => {
	const envVar = getEnvVar();

	if (envVar) {
		return envVar;
	}

	if (os.userInfo) {
		return os.userInfo().username;
	}

	try {
		if (process.platform === 'win32') {
			return cleanWinCmd(execa.sync('whoami').stdout);
		}

		return execa.sync('id', ['-un']).stdout;
	} catch (_) {}
});
```
