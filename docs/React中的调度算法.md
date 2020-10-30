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

render
 - 在ReactDOM#render工作机制.md中分析过，最终会调用scheduleUpdateOnFiber来启动调度
setState, forceUpdate
 - 通过一系列手段（不是本文重点，所以略过）得知会分别在enqueueSetState， enqueueReplaceState中调用scheduleUpdateOnFiber
 - useState, useReducer
    useState其实底层是useReducer，所以只需要看useReducer,在dispatchAction函数中也会发现调用了scheduleUpdateOnFiber

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
  if (startTime > currentTime) {
    // This is a delayed task.
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // Cancel an existing timeout.
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // Schedule a timeout.
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  } else {
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}


function flushWork(hasTimeRemaining, initialTime) {

  // We'll need a host callback the next time work is scheduled.
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    {
      // No catch in prod codepath.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  // ...
}

function advanceTimers(currentTime) {
  // Check for tasks that are no longer delayed and add them to the queue.
  let timer = peek(timerQueue);
  while (timer !== null) {
    if (timer.callback === null) {
      // Timer was cancelled.
      pop(timerQueue);
    } else if (timer.startTime <= currentTime) {
      // Timer fired. Transfer to the task queue.
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime;
      push(taskQueue, timer);
    } else {
      // Remaining timers are pending.
      return;
    }
    timer = peek(timerQueue);
  }
}

function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }
    const callback = currentTask.callback;
    if (callback !== null) {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
      } else {
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  if (currentTask !== null) {
    return true;
  } else {
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}
```

## 调度实现


```js
  const performance = window.performance;
  const setTimeout = window.setTimeout;
  const clearTimeout = window.clearTimeout;

  getCurrentTime = () => performance.now();

  let isMessageLoopRunning = false;
  let scheduledHostCallback = null;
  let taskTimeoutID = -1;

  let yieldInterval = 5;
  let deadline = 0;

  let needsPaint = false;

  const shouldYieldToHost = function() {
      return getCurrentTime() >= deadline;
  };

  const performWorkUntilDeadline = () => {
    if (scheduledHostCallback !== null) {
      const currentTime = getCurrentTime();
      // Yield after `yieldInterval` ms, regardless of where we are in the vsync
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
          // If there's more work, schedule the next message event at the end
          port.postMessage(null);
        }
      } catch (error) {
        // If a scheduler task throws, exit the current browser task so the
        port.postMessage(null);
        throw error;
      }
    } else {
      isMessageLoopRunning = false;
    }
    // Yielding to the browser will give it a chance to paint, so we can
    needsPaint = false;
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

  requestHostTimeout = function(callback, ms) {
    taskTimeoutID = setTimeout(() => {
      callback(getCurrentTime());
    }, ms);
  };

  cancelHostTimeout = function() {
    clearTimeout(taskTimeoutID);
    taskTimeoutID = -1;
  };
```