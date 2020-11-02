# React中的调度算法

> *以下分析基于React, ReactDOM 16.13.1版本*

## 前言

在React16版本中引入了一个时间切片的概念，在以前的版本中React进行虚拟DOM的Diff是不会进行中断的，从而占用大量的执行时间，导致渲染被延后，造成页面卡顿的现象，所以在后续的优化中，React团队希望能够通过一个个小的异步任务来执行Diff的工作，从而不让页面造成卡顿，那么在这里就需要引入一个调度算法，今天我们就来详细了解一下这个算法的内幕。

## 如何把一个巨型任务进行切分？

首先来看一个例子

```js
const array = Array.from(Array(1000000)).fill(1);
function read(arr) {
    arr.forEach((_, i) => {
        console.log(i);
    });
}
console.log('task start');
read(array);
console.log('task end');
```

这里的例子会输出从0输出到一百万，但是会发现把这段代码放到网页里去，打开浏览器的时候会卡个几秒钟，甚至更久，这就是因为JS执行会阻塞浏览器渲染，导致js运行结束才会渲染，那么怎么解决这个问题呢？

我们可以把一百万个数字按照100个一组，拆分成一万个任务，然后放在定时器里，按照30帧的刷新率每33ms执行一个任务，这样就能解决js运行太久导致阻塞渲染，其实React中调度算法大致也是这样一个基本思想。

聊到这里也可以提及一下调度算法比较常用的有两种，第一种是抢占式调度，在操作系统层面表示CPU可以决定当前时间片给哪个进程使用，但是浏览器并没有这个权限，所以React使用的是合作式调度，也就是大家事先说好每人占用多久时间片，全凭自觉。

以上例子的改进版如下
```js
const array = Array.from(Array(10000)).map((_, index) => index);
function read(arr) {
    arr.forEach((item) => {
        console.log(item);
    });
}
console.log('task start');
let i = 0;
const len = 100;
function task() {
    setTimeout(() => {
        const results = array.slice(i, i + len);
        if (results.length === 0) {
            console.log('task end');
            return;
        }
        read(results);
        i += len;
        task();
    }, 33);
}
task();
```

## React中什么时候会用到调度？

前面说过调度主要是用来拆分diff操作，那么也就是说什么时候会进行diff，能够引起diff的操作只有触发更新，在React中触发更新的操作分别有ReactDOM.render, setState, forceUpdate, useState, useReducer, 一起来这些方法看看有什么共同点

## 引发调度

**render**
 - 在ReactDOM#render工作机制.md中分析过，最终会调用scheduleUpdateOnFiber来启动调度

**setState, forceUpdate**
 - 通过一系列手段（不是本文重点，所以略过）得知会分别在enqueueSetState， enqueueReplaceState中调用
 scheduleUpdateOnFiber
 
**useState, useReducer**
  - useState其实底层是useReducer，所以只需要看useReducer,在dispatchAction函数中也会发现调用了scheduleUpdateOnFiber

综上所述调度的开始是在scheduleUpdateOnFiber，让我们来看下scheduleUpdateOnFiber

## 开始调度

```js
export function scheduleUpdateOnFiber(
  fiber: Fiber,
  expirationTime: ExpirationTime,
) {
  const root = markUpdateTimeFromFiberToRoot(fiber, expirationTime);
  if (root === null) {
    return;
  }
  // ...
  if (expirationTime === Sync) {
    // ...
    ensureRootIsScheduled(root);
    schedulePendingInteractions(root, expirationTime);
    if (executionContext === NoContext) {
    flushSyncCallbackQueue();
    }
  } else {
    // ...
    ensureRootIsScheduled(root);
    schedulePendingInteractions(root, expirationTime);
  }
}

function ensureRootIsScheduled(root: FiberRoot) {
  // ..
  if (//... ) {
    callbackNode = scheduleSyncCallback(performSyncWorkOnRoot.bind(null, root));
  } else if ( //... ) {
    callbackNode = scheduleCallback(
      priorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
    );
  } else {
    callbackNode = scheduleCallback(
      priorityLevel,
      performConcurrentWorkOnRoot.bind(null, root),
      {timeout: expirationTimeToMs(expirationTime) - now()},
    );
  }

  root.callbackNode = callbackNode;
}

export function scheduleCallback(
  reactPriorityLevel,
  callback,
  options
) {
  const priorityLevel = reactPriorityToSchedulerPriority(reactPriorityLevel);
  return Scheduler_scheduleCallback(priorityLevel, callback, options);
}

export function scheduleSyncCallback(callback: SchedulerCallback) {
  if (syncQueue === null) {
    // ...
    immediateQueueCallbackNode = Scheduler_scheduleCallback(
      // Scheduler_ImmediatePriority = -1
      Scheduler_ImmediatePriority,
      flushSyncCallbackQueueImpl,
    );
  } else {
    // ...
  }
  // ...
}

```

```js
以上三个函数调用栈为 
                                     scheduleUpdateOnFiber 
                                              |
                                              |
                                              |
                                              V
scheduleSyncCallback <-----SYNC----- ensureRootIsScheduled <-----ASYNC----- scheduleCallback
        |                                                                           |
        |                                                                           |
        |                                                                           |
        |                                                                           |
        ---------------------> Scheduler_scheduleCallback <--------------------------
        
```

首先从scheduleUpdateOnFiber调用中expirationTime无论是不是Sync最终都会调用到ensureRootIsScheduled函数，接下去ensureRootIsScheduled中会根据当前的运行环境（同步，异步）来决定调用scheduleSyncCallback或者scheduleCallback，
通过观察scheduleSyncCallback和scheduleCallback函数的实现来看内部都是会去调用Scheduler_scheduleCallback这个函数，唯一的区别则是scheduleCallback传入的第一个参数是通过当前的expirationTime去计算出一个优先级，而scheduleSyncCallback传入的优先级则是Scheduler_ImmediatePriority，也就是-1，表示立即同步回调函数，Scheduler_scheduleCallback在这里可以简单的理解为如果传入-1则同步调用回调函数，传入其他数字则等待数字需要的时间后，异步调用setTimeout执行回调，在后面会详细分析Scheduler_scheduleCallback到底做了哪些事情？

## 最小堆

在深入Scheduler_scheduleCallback之前先来了解一个数据结构堆，堆是一种二叉树，所以也符合二叉树的一些特效，比如说有个节点n(n>=1), n >> 1，是这个节点的父节点， n * 2是这个节点的左子节点，n * 2 + 1是这个节点的右子节点，堆还可以扩展出来最大堆和最小堆，最大堆表示每一个父节点都会大于它的两个子节点，而最小堆则相反，每一个父节点都小于它的两个子节点，通过这个特性，能够实现一个动态的优先级队列，并且时间复杂度是logn,是一种很优秀的数据结构

在js中我们可以通过数组来实现这个数据结构,根据规范我们可以定义出这样一组接口，具体实现在这里不赘述，网络上有很多算法实现
```ts
interface HeapNode<T> {
    value: T;
    sortIndex: T;
}

type Compare = (a: HeapNode<string>, b: HeapNode<string>) => boolean;

abstract class Heap<T> {
    private compare: Compare;
    constructor(compare: Compare) {
        this.compare = compare;
    }
    abstract peek(): HeapNode<T>;

    abstract pop(): HeapNode<T>;
    abstract siftDown(n: number): void;

    abstract push(node: HeapNode<T>): void;
    abstract siftUp(n: number): void;

    abstract parent(n: number): number;
    abstract left(n: number): number;
    abstract right(n: number): number;

    abstract swap(n: number, m: number): void;
    abstract toString(): string;
    abstract size(): number;

    abstract heapify(nodes: HeapNode<T>[], compare: Compare): Heap<T>;
}
```
其中通过peek来查看堆顶的节点，pop来弹出堆顶的节点，push来增加新的节点

有一组初始值[5, 4, 3, 2, 1]，通过我们小堆化以后会这样的一个结构
```js
          1
      2       4
    5   3
```

接下去插入新一个的节点0,通过上浮最终会出现以下结构

```js
          0
      2       1
    5   3   4
```

能够发现和React所需要的优先级最高，最紧急的任务在堆顶，并且每一次只会拿一个任务的要求是一致的，所以React在任务队列上使用了最小堆来实现。

## 调度过程

```js
let taskIdCounter = 1;
// 延时任务堆
const timerQueue = [];
// 实时任务堆
const taskQueue = [];

function unstable_scheduleCallback(priorityLevel, callback, options) {
  var currentTime = getCurrentTime();

  var startTime;
  var timeout;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
    timeout =
      typeof options.timeout === 'number'
        ? options.timeout
        : timeoutForPriorityLevel(priorityLevel);
  } else {
    timeout = timeoutForPriorityLevel(priorityLevel);
    startTime = currentTime;
  }

  var expirationTime = startTime + timeout;

  var newTask = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  // 延时任务
  if (startTime > currentTime) {
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    // 无实时任务并且当前这个任务等同于延时任务中堆顶的任务，启动延时调度，等待时间为当前时间和延时任务启动时间之间的时间差
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // ...
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    // 有实时任务的情况，调度实时任务
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}

function flushWork(hasTimeRemaining, initialTime) {
  // ...
  try {
    return workLoop(hasTimeRemaining, initialTime);
  } finally {
    // ...
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  // 查询延时任务里是否有到期的任务，有的话从延时堆里踢出，塞入实时堆
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);
  while (currentTask !== null) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // 任务还未过期，但是这个tick的时间片已经用完了，先跳过这个任务
      break;
    }
    const callback = currentTask.callback;
    if (callback !== null) {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      // 类似于requestIdleCallback的didTimeout参数，用于判断这个任务是否过期了
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      {
        // 任务节点执行结束，弹出对应的任务节点
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      // 查询延时任务里是否有到期的任务，有的话从延时堆里踢出，塞入实时堆
      advanceTimers(currentTime);
    } else {
      // ...
    }
    // 获取下一个任务节点
    currentTask = peek(taskQueue);
  }
  if (currentTask !== null) {
    // 实时任务堆还没空
    return true;
  } else {
    // 实时任务堆空了，延迟任务堆需要自己调度自己
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}
```

首先介绍一个在调度过程中主要有两个任务堆，分别是实时任务堆和延时任务堆，无delay参数的任务都会被放入实时任务堆中，反之会被推入延时任务堆，延时任务堆的意义主要是在有长时间delay的任务，能够减少无用postMessage递归调用。

接下来看下以上函数的调用流程，在unstable_scheduleCallback会传入当前任务的优先级，回调函数，以及额外的选项，内部会根据传入的优先级或者额外选项中的timeout或者delay来设置任务的expirationTime，接着通过startTime来确定当前任务是否要放入实时任务堆中还是延时任务堆中，如果是延迟任务，那么会放入延迟任务堆，并且根据是否有实时任务可以调度并且当前任务是延时任务堆中优先级最高的，那么使用setTimeout来进行调度；如果是实时任务则会推入实时任务堆，接着调用requestHostCallback来调度workLoop，workLoop会从堆顶取出优先级最高的任务，接着查看当前时间片是否还有时间并且当前这个任务是否过期，如果任务还未过期但是没有时间片了，就会先交出控制权限给浏览器，等待下一次调用；如果任务已经过期了，那么需要马上执行该任务，执行结束后查看实时任务堆是否还有任务，就赋值给currentTask，返回true，表示还有任务需要调度；如果实时任务空了，那么会去调度延时任务堆，返回false，表示当下任务已经全部结束。

workLoop这个函数是异步进行调用，这里requestHostCallback就是用来将workLoop添加到下一个宏任务，使得最终的回调在下一个时间循环才会执行

## requestHostCallback实现

```js
  const performance = window.performance;

  getCurrentTime = () => performance.now();

  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;

  let yieldInterval = 5;
  let deadline = 0;

  const shouldYieldToHost = function() {
      return getCurrentTime() >= deadline;
  };

  const performWorkUntilDeadline = () => {
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      deadline = currentTime + yieldInterval;
      const hasTimeRemaining = true;
      try {
        const hasMoreWork = scheduledHostCallback(
          hasTimeRemaining,
          currentTime,
        );
        if (!hasMoreWork) {
          isMessageLoopRunning = false;
          scheduledHostCallback = null;
        } else {
          port.postMessage(null);
        }
      } catch (error) {
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
  };

  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;

  requestHostCallback = function(callback) {
    scheduledHostCallback = callback;
    if (!isMessageLoopRunning) {
      isMessageLoopRunning = true;
      port.postMessage(null);
    }
  };

  cancelHostCallback = function() {
    scheduledHostCallback = null;
  };
```

requestHostCallback内部通过MessageChanel的api来根据workLoop的返回值来决定是否要递归调用performWorkUntilDeadline，从而把每一个任务分散到浏览器的每个事件循环中

## 目前生产环境的调度模式

我们目前还是使用ReactDOM.render去进行应用的创建，所以在这种模式下虽然会通过requestHostCallback把回调放到下一个事件循环去执行，但是内部的多个任务并不会被中断，而是一次性在一个时间片中去把所有的任务全部执行完，所以并不是大家认为的当下版本的React已经是可以中断渲染，这点还是需要注意一下，如果想要尝试可中断的React渲染模式，还需要安装实验版本https://zh-hans.reactjs.org/docs/concurrent-mode-intro.html，通过ReactDOM.createRoot进行应用的创建，才是真正官方声称的Concurrent模式，支持可中断，多任务时间片的特性。

## 总结

通过对React Scheduler的分析，我们了解了它是如何把一个个小小的diff任务，通过合作式调度的方案，在多个时间片中调用，不阻塞浏览器的渲染，给用户带去丝滑的浏览体验。