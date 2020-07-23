# 解析react合成事件


## 合成事件的特性

以下分析基于React, ReactDOM 16.13.1版本

react自行实现了一套事件系统，主要特性有以下几个
1. 自行实现了一套事件捕获到事件冒泡的逻辑, 抹平各个浏览器之前的兼容性问题。
2. 使用对象池来管理合成事件对象的创建和销毁，可以减少垃圾回收次数，防止内存抖动。
3. 事件只在document上绑定，并且每种事件只绑定一次，减少内存开销。

首先来以一个简单的例子介绍合成事件。

```js
function App() {
  function handleButtonLog(e: React.MouseEvent<HTMLButtonElement>) {
    console.log(e.currentTarget);
  }
  function handleDivLog(e: React.MouseEvent<HTMLDivElement>) {
    console.log(e.currentTarget);
  }
  function handleH1Log(e: React.MouseEvent<HTMLElement>) {
    console.log(e.currentTarget);
  }
  return (
    <div onClick={handleDivLog}>
      <h1 onClick={handleH1Log}>
        <button onClick={handleButtonLog}>click</button>
      </h1>
    </div>
  );
}
```

上面的代码运行后，会在控制台中分别打印出，`button, h1, div`三个dom节点，我们来研究一下他是如何工作的。

## 事件绑定

首先来确认事件是如何绑定到dom节点上的，我们知道App组件内的jsx代码会通过React.CreateElement函数返回jsx对象，其中我们的onClick事件是储存在每一个jsx对象的props属性内，通过一系列方法得知在React在reconciliation过程中会把jsx对象转换为fiber对象，这里有一个方法加做completeWork，

```js
function completeWork(current, workInProgress, renderExpirationTime) {
    // 只保留关键代码
    case HostComponent:
      {
        popHostContext(workInProgress);
        var rootContainerInstance = getRootHostContainer();
        var type = workInProgress.type;
        if (current !== null && workInProgress.stateNode != null) {
          // 更新
        } else {
          // 创建
          if (_wasHydrated) {
            // ssr情况
          } else {
            var instance = createInstance(type, newProps, rootContainerInstance, currentHostContext, workInProgress);

            // 初始化DOM节点
            if (finalizeInitialChildren(instance, type, newProps, rootContainerInstance)) {
            }
          }
        }
}

```

这个函数内通过createInstance创建dom实例，并且调用finalizeInitialChildren函数，在finalizeInitialChildren函数中会把props设置到真实的dom节点上，这里如果遇到类似onClick，onChange的props时，会触发事件绑定的逻辑。

```js
// 进行事件绑定
ensureListeningTo(rootContainerElement, propKey);

function ensureListeningTo(rootContainerElement, registrationName) {
  // 忽略无关代码
  var doc = isDocumentOrFragment ? rootContainerElement : rootContainerElement.ownerDocument;
  legacyListenToEvent(registrationName, doc);
}
```

在ensureListeningTo函数中会通过实际触发事件的节点，去寻找到它的document节点，并且调用legacyListenToEvent函数来进行事件绑定


```js
function legacyListenToEvent(registrationName, mountAt) {
  var listenerMap = getListenerMapForElement(mountAt);
  var dependencies = registrationNameDependencies[registrationName];

  for (var i = 0; i < dependencies.length; i++) {
    var dependency = dependencies[i];
    legacyListenToTopLevelEvent(dependency, mountAt, listenerMap);
  }
}
```
registrationNameDependencies数据结构如图
<image src="./image/registrationNameDependencies.png" />

在legacyListenToEvent函数中首先通过获取document节点上监听的事件名称Map对象，然后去通过绑定在jsx上的事件名称，例如onClick来获取到真实的事件名称，例如click，依次进行legacyListenToTopLevelEvent方法的调用

```js
function legacyListenToTopLevelEvent(topLevelType, mountAt, listenerMap) {
  // 只保留主逻辑
  // 相同的事件只绑定一次
  if (!listenerMap.has(topLevelType)) {
    switch (topLevelType) {
      // 根据事件类型进行捕获或者冒泡绑定
      case TOP_SCROLL:
        trapCapturedEvent(XX);
      default:
        trapBubbledEvent(topLevelType, mountAt)
        break;
    }

    listenerMap.set(topLevelType, null);
  }
}
```

legacyListenToTopLevelEvent函数做了以下两件事
1. 是否在document上已经绑定过原始事件名，已经绑定过则直接退出，未绑定则绑定结束以后把事件名称设置到Map对象上，再下一次绑定相同的事件时直接跳过。
2. 根据事件是否能冒泡来来进行捕获阶段的绑定或者冒泡阶段的绑定。

到目前为止我们已经拿到了真实的事件名称和绑定在事件的哪个阶段，剩下就还有一个监听事件本身了，这一步会在trapEventForPluginEventSystem函数内被获取到,他会通过事件的优先级来获取不同的监听事件，这部分会和调度方面有相关，我们只需要知道最终实际绑定的都是dispatchEvent这个监听事件，然后调用浏览器的addEventListener事件来绑定上事件

```js
function trapEventForPluginEventSystem(container, topLevelType, capture) {
  var listener;

  switch (getEventPriorityForPluginSystem(topLevelType)) {
    case DiscreteEvent:
      listener = dispatchDiscreteEvent.bind(null, topLevelType, PLUGIN_EVENT_SYSTEM, container);
      break;

    case UserBlockingEvent:
      listener = dispatchUserBlockingUpdate.bind(null, topLevelType, PLUGIN_EVENT_SYSTEM, container);
      break;

    case ContinuousEvent:
    default:
      listener = dispatchEvent.bind(null, topLevelType, PLUGIN_EVENT_SYSTEM, container);
      break;
  }

  var rawEventName = getRawEventName(topLevelType);

  if (capture) {
    addEventCaptureListener(container, rawEventName, listener);
  } else {
    addEventBubbleListener(container, rawEventName, listener);
  }
}
```

至此事件的绑定暂时告一段落了，从上面能得出几个结论。
1. 事件都是绑定在document上的
2. jsx中的事件名称会经过处理，处理后的事件名称才会被绑定
3. 不管用什么事件来绑定， 他们的监听事件并不是传入jsx的事件函数，而是会根据事件的优先级来绑定dispatchDiscreteEvent， ，dispatchUserBlockingUpdate或者dispatchEvent三个监听函数，但是最终在触发事件调用的还是dispatchEvent事件。

## 事件触发
从事件绑定得知我们点击的button按钮的时候，触发的回调函数并不是实际的回调函数，而是dispatchEvent函数，
所以我们通常会有几个疑问，它是怎么获取到用户事件的回调函数的？为什么在合成事件对象不能被保存下来，而需要调用特殊的函数才能保留？
合成事件是怎么创建出来的？

接下来的分析中我们就来解决这几个问题，首先看到dispatchEvent函数,忽略掉其他分支会发现实际调用的是dispatchEventForLegacyPluginEventSystem函数, 他首先通过bookKeepingPool中获取一个bookKeeping对象，然后调用handleTopLevel函数，在调用结束的时候吧bookKeeping对象放回到bookKeepingPool中，实现了内存复用。

```js
function dispatchEventForLegacyPluginEventSystem(topLevelType, eventSystemFlags, nativeEvent, targetInst) {
  var bookKeeping = getTopLevelCallbackBookKeeping(topLevelType, nativeEvent, targetInst, eventSystemFlags);
  try {
    batchedEventUpdates(handleTopLevel, bookKeeping);
  } finally {
    releaseTopLevelCallbackBookKeeping(bookKeeping);
  }
}
```

bookKeeping对象的结构如图
<image src="./image/bookkeeping.png" />

在handleTopLevel函数内，通过首先把触发事件的节点如果是dom节点或者文字节点的话，那就把对应的fiber对象放入bookkeeping.ancestors的数组内，接下去依次获取bookKeeping.ancestors上的每一个fiber对象，通过runExtractedPluginEventsInBatch函数来创建合成事件对象。

```js
// 忽略分支代码，只保留主流程
function handleTopLevel(bookKeeping) {
  var targetInst = bookKeeping.targetInst;
  var ancestor = targetInst;
  do {
    var tag = ancestor.tag;
    if (tag === HostComponent || tag === HostText) {
      bookKeeping.ancestors.push(ancestor);
    }
  } while (ancestor);

  for (var i = 0; i < bookKeeping.ancestors.length; i++) {
    targetInst = bookKeeping.ancestors[i];

    runExtractedPluginEventsInBatch(topLevelType, targetInst, nativeEvent, eventTarget, eventSystemFlags);
  }
}
```