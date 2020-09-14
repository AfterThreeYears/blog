`解析版本` [webpack@4.44.1](https://github.com/webpack/webpack/releases/tag/v4.44.1)

## 基础模块加载

大家都用过`webpack`进行web开发的编译打包工作，但是有没有发现哪怕是一个很简单的js脚本，`webpack`编译出来的产物实际上会比较大，例如以下配置

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

通过删除注释和一些和当前流程无关的代码后，仔细观察能够发现是一个自执行的`IIFE`函数表达式，并且传入的参数`modules`是一个对象，这个对象是用js文件的路径来做**key**，经过`Function`包装的
源代码来做**value**，其中为每个文件传入了三个参数`module, __webpack_exports__, __webpack_require__`，分别对应了`commonjs`中的`module, exports，require`三个属性, 接下去先把他放在一边，看下`IIFE`函数体的内容，首先是定义了一些变量和一个`__webpack_require__`函数体，并且在`__webpack_require__`的函数体上挂载了一些变量，最后一句通过
`return __webpack_require__(__webpack_require__.s = "./src/index.js");`传入我们在`webpack.config.js`中定义的`entry`路径作为入参传入调用`__webpack_require__`函数

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

接下来分析一下`__webpack_require__`的调用逻辑，首先通过查找`installedModules`这个对象来确认当前需要被加载的模块是否已经在缓存中了，如果没有的话会初始化这个模块在`installedModules`上，然后根据传入`moduleId`来调用modules对象上对应的函数,这里首先调用的就是`./src/index.js`的函数体

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

首先声明运行环境为严格模式，接下去在`__webpack_exports__`上定义`__esModule`属性，标志着为ES模块，紧接着使用`__webpack_require__`函数来调用`"./src/bar.js"`模块, 由于`bar`会有默认导出的函数，那么会通过`__webpack_require__.d`函数在`__webpack_exports__`对象上定义`default`属性，它的值为`bar`函数，
`__webpack_require__.d`函数其实是`Object.defineProperty`函数的封装，其中通过查看是否已经定义过属性来决定是否要跳过定义动作，
最后当`bar`模块秩序完毕后返回`__webpack_exports__`对象作为该模块的返回值供其他模块使用，所以在`./src/index.js`模块上能够通过`__webpack_require__`函数的返回值上的`default`属性得到bar函数。

讲到这里最基本的**webpack-runtime**的工作原理已经介绍完毕了，当然还有一些特殊的功能，例如异步加载模块，接下去我们就来分析一下异步加载模块是如何工作的。

## 动态加载模块

首先修改`index.js`的内容

```js
import('./bar')
  .then(data => {
    data.default();
  });

console.log('index.js');
```

然后执行打包脚本，会发现除了**main.js**以外还出现了一个**0.js**, 这个**0.js**就是我们所需要的动态载入的模块了

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

还是按照惯例先把打包后的产物进行一下格式化和删减, 结果如下

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

能够发现除了**main.js**以外还有一个**0.js**，里面是我们需要动态加载的文件**bar.js**的内容。那么我们来看下他是怎么被动态加载进来的，首先还是观察**main.js**还是和基础模块加载一样的结构，是一个`IIFE`，但是其中多了几个函数`webpackJsonpCallbac`, `__webpack_require__.e`和一个全局变量`webpackJsonp`, 用于给动态加载js模块使用

```js
 	var jsonpArray = window["webpackJsonp"] = window["webpackJsonp"] || [];
 	var oldJsonpFunction = jsonpArray.push.bind(jsonpArray);
 	jsonpArray.push = webpackJsonpCallback;
 	jsonpArray = jsonpArray.slice();
 	for(var i = 0; i < jsonpArray.length; i++) webpackJsonpCallback(jsonpArray[i]);
 	var parentJsonpFunction = oldJsonpFunction;
```

接下来会执行以上几句代码，其中会定义一个全局变量`webpackJsonp`，并且把`webpackJsonp.push` 函数保存起来，并且重新给它赋值为`webpackJsonpCallback`，这时候调用`webpackJsonp.push`其实就是调用`webpackJsonpCallback`，接下来还是通过`__webpack_require__`来加载
我们的入口模块**index.js**，在**index.js**首先会调用`__webpack_require__.e(0)`这个方法，这个方法就是`import('./bar.js')`编译而来，表示需要动态加载`./bar.js`;

```js
var installedChunks = {
	"main": 0
};
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
```

`__webpack_require__.e`函数首先会通过查找`installedChunks`是否已经加载了该`chunk`，未加载的话就通过动态创建`script`标签插入到当前文档内，其中在`script`创建之前还会在`installedChunks`赋值**key**为`chunkId`，**value**为之前创建的一个`promise`的`resolve`，`reject`和`promise实例`组成的数组

<image src="../image/webpack-runtime2.png" width="500" />

然后**0.js**会被加载到当前页面，并且执行脚本

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

它会调用被重写后的`push方法`，并且传入一个数组，第一个内容是一个`数组0`，这个**0**代表着这个`chunk的名称`，第二个是一个对象，**key**为`module名称`，**value**为实际的脚本内容，这里的`push`方法调用的是`webpackJsonpCallback`方法

```js
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
```

### 动态模块加载成功
这个方法首先会拿到`chunkId`，通过`chunkId`拿到`installedChunks`上的数组内的第一个`resolve`函数，放入`resolves`数组中，表示该模块被成功加载，然后通过`moreModules`合并到`modules`上，以便后续使用，最后通过`parentJsonpFunction`方法把动态加载的模块内容推入全局的`webpackJsonp`中，并且一个个的调用`resolve`函数，能够让`__webpack_require__.e(0)`状态变为成功，调用后续的`then方法`。

### 动态模块加载失败
那么如果模块加载失败，就不会执行`webpackJsonpCallback`方法，接着在`onerror`回调函数执行后会发现当前的`chunkId`并不等于0（注意：这里的0代表这个`chunk`是已经被加载成功），接着就会去通过`chunkId`调用`installedChunks`上的`reject`方法，至此加载失败的逻辑运行结束。

