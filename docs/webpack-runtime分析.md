`解析源码版本` [webpack@4.44.1](https://github.com/webpack/webpack/releases/tag/v4.44.1)

## 基础模块加载

大家都用过webpack进行web开发的编译打包工作，但是有没有发现哪怕是一个很简单的js脚本，webpack编译出来的产物实际上会比较大，例如以下配置

```js
// webpack.config.js
module.exports = {
  entry: './src/index.js',
  mode: 'development',
  devtool: 'inline-source-map',
}

// index.js
import bar from './bar';
console.log('index.js');
bar();

// bar.js
export default function bar() {
  console.log('bar');
}
```

实际编译出来的产物有`9.96KB`，那么这么大的文件除了我们的源代码以外，还有哪些相关的代码呢？

```js
> webpack --config webpack.config.js

Hash: 2fdafd30dfea35934417
Version: webpack 4.44.1
Time: 56ms
Built at: 2020-09-12 20:31:49
  Asset      Size  Chunks             Chunk Names
main.js  9.96 KiB    main  [emitted]  main       
Entrypoint main = main.js
[./src/bar.js] 55 bytes {main} [built]
[./src/index.js] 226 bytes {main} [built]
```

我们根据官方文档中的解释来了解一下打包后的产物里分别有哪些东西？

<image src="../image/webpack-runtime1.png" width="500" />

可以看出有个叫`runtime`和`manifest`的东西，简单来说就是能够让你使用commonjs或者esModuel来进行模块的引入和导出，那么浏览器是不支持这些语法的，所以就做了类似`polyfill`的事情，除了这个以外还能帮你进行资源的管理，以及异步资源的加载等工作。

### 打包产物

```js
(function(modules) {
	var installedModules = {};
	function __webpack_require__(moduleId) {
		if(installedModules[moduleId]) {
			return installedModules[moduleId].exports;
		}
		var module = installedModules[moduleId] = {
			i: moduleId,
			l: false,
			exports: {}
		};
		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
		module.l = true;
		return module.exports;
	}
	__webpack_require__.d = function(exports, name, getter) {
		if(!__webpack_require__.o(exports, name)) {
			Object.defineProperty(exports, name, { enumerable: true, get: getter });
		}
	};
	__webpack_require__.r = function(exports) {
		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
		}
		Object.defineProperty(exports, '__esModule', { value: true });
	};
	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
	return __webpack_require__(__webpack_require__.s = "./src/index.js");
})
({
  "./src/bar.js":
  (function(module, __webpack_exports__, __webpack_require__) {
    "use strict";
    __webpack_require__.r(__webpack_exports__);
    __webpack_require__.d(__webpack_exports__, "default", function() { return bar; });
    function bar() {
      console.log('bar');
    }
  }),
  "./src/index.js":
  (function(module, __webpack_exports__, __webpack_require__) {
    "use strict";
    __webpack_require__.r(__webpack_exports__);
    var _bar__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./bar */ "./src/bar.js");
    console.log('index.js');
    Object(_bar__WEBPACK_IMPORTED_MODULE_0__["default"])();
  })
});
```

通过删除注释和一些和当前流程无关的代码后，仔细观察能够发现是一个自执行的IIFE函数表达式，并且传入的参数`modules`是一个对象，这个对象是用js文件的路径来做key，经过Function包装的
源代码来做value，其中为每个文件传入了三个参数`module, __webpack_exports__, __webpack_require__`，分别对应了commonjs中的`module, exports，require`三个属性, 接下去先把他放在一边，看下IIFE函数体的内容，首先是定义了一些变量和一个`__webpack_require__`函数体，并且在`__webpack_require__`的函数体上挂载了一些变量，最后一句通过
`return __webpack_require__(__webpack_require__.s = "./src/index.js");`传入我们在webpack.config.js中定义的entry路径作为入参传入调用`__webpack_require__`函数

```js
  function __webpack_require__(moduleId) {
    if(installedModules[moduleId]) {
      return installedModules[moduleId].exports;
    }
    var module = installedModules[moduleId] = {
      i: moduleId,
      l: false,
      exports: {}
    };
    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
    module.l = true;
    return module.exports;
  }
```

接下来分析一下`__webpack_require__`的调用逻辑，首先通过查找installedModules这个对象来确认当前需要被加载的模块是否已经在缓存中了，如果没有的话会初始化这个模块在installedModules上，然后根据传入moduleId来调用modules对象上对应的函数,这里首先调用的就是`./src/index.js`的函数体

```js
  // `./src/index.js`
  (function(module, __webpack_exports__, __webpack_require__) {
    "use strict";
    __webpack_require__.r(__webpack_exports__);
    var _bar__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./bar */ "./src/bar.js");
    console.log('index.js');
    Object(_bar__WEBPACK_IMPORTED_MODULE_0__["default"])();
  })
```

```js
  // "./src/bar.js"
  (function(module, __webpack_exports__, __webpack_require__) {
    "use strict";
    __webpack_require__.r(__webpack_exports__);
    __webpack_require__.d(__webpack_exports__, "default", function() { return bar; });
    function bar() {
      console.log('bar');
    }
  }),
```

首先声明运行环境为严格模式，接下去在__webpack_exports__上定义__esModule属性，标志着为ES模块，紧接着使用__webpack_require__函数来调用"./src/bar.js"模块, 由于bar会有默认导出的函数，那么会通过__webpack_require__.d函数在__webpack_exports__对象上定义default属性，它的值为bar函数，
`__webpack_require__.d`函数其实是Object.defineProperty函数的封装，其中通过查看是否已经定义过属性来决定是否要跳过定义动作，
最后当bar模块秩序完毕后返回__webpack_exports__对象作为该模块的返回值供其他模块使用，所以在./src/index.js模块上能够通过__webpack_require__函数的返回值上的default属性得到bar函数。

讲到这里最基本的webpack-runtime的工作原理已经介绍完毕了，当然还有一些特殊的功能，例如异步加载模块，接下去我们就来分析一下异步加载模块是如何工作的。

## 动态加载模块

首先修改index.js的内容

```js
import('./bar')
  .then(data => {
    data.default();
  });

console.log('index.js');
```

然后执行打包脚本，会发现除了main.js以外还出现了一个0.js, 这个0.js就是我们所需要的动态载入的模块了

```js
> webpack --config webpack.config.js

Hash: 27af0736eeb7c702d5c8
Version: webpack 4.44.1
Time: 62ms
Built at: 2020-09-12 21:54:52
  Asset      Size  Chunks             Chunk Names
   0.js  1.09 KiB       0  [emitted]
main.js  19.6 KiB    main  [emitted]  main
Entrypoint main = main.js
[./src/bar.js] 106 bytes {0} [built]
[./src/index.js] 86 bytes {main} [built]
```

还是按照惯例先把打包后的产物进行一下格式化和删减


```js
  // main.js
 (function(modules) { // webpackBootstrap
 	function webpackJsonpCallback(data) {
 		var chunkIds = data[0];
 		var moreModules = data[1];
 		var moduleId, chunkId, i = 0, resolves = [];
 		for(;i < chunkIds.length; i++) {
 			chunkId = chunkIds[i];
 			if(Object.prototype.hasOwnProperty.call(installedChunks, chunkId) && installedChunks[chunkId]) {
 				resolves.push(installedChunks[chunkId][0]);
 			}
 			installedChunks[chunkId] = 0;
 		}
 		for(moduleId in moreModules) {
 			if(Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
 				modules[moduleId] = moreModules[moduleId];
 			}
 		}
 		if(parentJsonpFunction) parentJsonpFunction(data);
 		while(resolves.length) {
 			resolves.shift()();
 		}
 	};
 	var installedModules = {};
 	var installedChunks = {
 		"main": 0
 	};
 	function jsonpScriptSrc(chunkId) {
 		return __webpack_require__.p + "" + ({}[chunkId]||chunkId) + ".js"
 	}
 	function __webpack_require__(moduleId) {
 		if(installedModules[moduleId]) {
 			return installedModules[moduleId].exports;
 		}
 		var module = installedModules[moduleId] = {
 			i: moduleId,
 			l: false,
 			exports: {}
 		};
 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
 		module.l = true;
 		return module.exports;
 	}
 	__webpack_require__.e = function requireEnsure(chunkId) {
 		var promises = [];
 		var installedChunkData = installedChunks[chunkId];
 		if(installedChunkData !== 0) { // 0 means "already installed".
 			if(installedChunkData) {
 				promises.push(installedChunkData[2]);
 			} else {
 				var promise = new Promise(function(resolve, reject) {
 					installedChunkData = installedChunks[chunkId] = [resolve, reject];
 				});
 				promises.push(installedChunkData[2] = promise);
 				var script = document.createElement('script');
 				var onScriptComplete;
 				script.charset = 'utf-8';
 				script.timeout = 120;
 				if (__webpack_require__.nc) {
 					script.setAttribute("nonce", __webpack_require__.nc);
 				}
 				script.src = jsonpScriptSrc(chunkId);
 				var error = new Error();
 				onScriptComplete = function (event) {
 					script.onerror = script.onload = null;
 					clearTimeout(timeout);
 					var chunk = installedChunks[chunkId];
 					if(chunk !== 0) {
 						if(chunk) {
 							var errorType = event && (event.type === 'load' ? 'missing' : event.type);
 							var realSrc = event && event.target && event.target.src;
 							error.message = 'Loading chunk ' + chunkId + ' failed.\n(' + errorType + ': ' + realSrc + ')';
 							error.name = 'ChunkLoadError';
 							error.type = errorType;
 							error.request = realSrc;
 							chunk[1](error);
 						}
 						installedChunks[chunkId] = undefined;
 					}
 				};
 				var timeout = setTimeout(function(){
 					onScriptComplete({ type: 'timeout', target: script });
 				}, 120000);
 				script.onerror = script.onload = onScriptComplete;
 				document.head.appendChild(script);
 			}
 		}
 		return Promise.all(promises);
 	};
 	__webpack_require__.m = modules;
 	__webpack_require__.c = installedModules;
 	__webpack_require__.d = function(exports, name, getter) {
 		if(!__webpack_require__.o(exports, name)) {
 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
 		}
 	};
 	__webpack_require__.r = function(exports) {
 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
 		}
 		Object.defineProperty(exports, '__esModule', { value: true });
 	};
 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
 	__webpack_require__.p = "";
 	var jsonpArray = window["webpackJsonp"] = window["webpackJsonp"] || [];
 	var oldJsonpFunction = jsonpArray.push.bind(jsonpArray);
 	jsonpArray.push = webpackJsonpCallback;
 	jsonpArray = jsonpArray.slice();
 	for(var i = 0; i < jsonpArray.length; i++) webpackJsonpCallback(jsonpArray[i]);
 	var parentJsonpFunction = oldJsonpFunction;
 	return __webpack_require__(__webpack_require__.s = "./src/index.js");
 })
 ({
  "./src/index.js":
  (function(module, exports, __webpack_require__) {
    __webpack_require__.e(0).then(__webpack_require__.bind(null,"./src/bar.js"))
      .then(data => {
        data.default();
      });
    console.log('index.js');
  })
});

```

```js
// 0.js
(window["webpackJsonp"] = window["webpackJsonp"] || []).push([
  [0],
  {
    "./src/bar.js":
    (function(module, __webpack_exports__, __webpack_require__) {
      "use strict";
      __webpack_require__.r(__webpack_exports__);
      __webpack_require__.d(__webpack_exports__, "default", function() { return bar; });
      function bar() {
        console.log('bar');
      }
    })
  }
]);
```