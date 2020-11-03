# React中的调度算法

> *以下分析基于React, ReactDOM 16.13.1版本*

## 前言

在React16版本中重写了新的`fiber`架构，其中引入了新的diff算法，在以前的版本中React进行虚拟DOM的`diff`是不会进行中断的，会占用大量的执行时间，导致渲染被延后、页面卡顿，所以在新的`fiber`架构中，React团队希望能够通过一个个小的异步任务来执行`diff`的工作，从而不让页面造成卡顿，今天我们就来详细了解一下这个算法的内幕。

## 如何把一个巨型任务进行切分？

首先如何把一个巨型任务进行拆分，下面有一个例子

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

大家都知道上面的代码会打印出0到一百万，当我们把这段代码放到网页中，打开浏览器的时候会卡个几秒钟，甚至更久，这就是因为js执行会阻塞浏览器渲染，导致js运行结束浏览器才会渲染UI，那么怎么解决这个问题呢？

我们可以把一百万个数字按照100个一组，拆分成一万个任务，然后放在定时器里，按照30帧的刷新率每33ms执行一个任务，这样就能解决js运行太久导致阻塞渲染，其实React中调度算法大致也是这样一个基本思想。

当下调度算法比较常用的有两种，第一种是**抢占式调度**，在操作系统层面表示CPU可以决定当前时间片给哪个进程使用，但是浏览器并没有这个权限，第二种是React使用的**合作式调度**，也就是大家事先说好每人占用多久时间片，全凭自觉。

以上例子的改进版如下
```js
const array = Array.from(Array(1000000)).map((_, index) => index);
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

这时候再打开浏览器就会发现能够瞬间打开，并不会有任何卡顿的现象发生。

## React中什么时候会用到调度？

前面说过调度主要是用来拆分`diff操作`，那么也就是说什么时候会进行diff，能够引起diff的操作只有触发更新，在React中触发更新的操作分别有`ReactDOM.render`, `setState`, `forceUpdate`, `useState`, `useReducer`, 一起来这些方法看看有什么共同点

## 引发调度

**render**
 - 在之前的`ReactDOM#render工作机制`这篇文章中分析过，`render`方法最终会调用`scheduleUpdateOnFiber`来启动调度

**setState, forceUpdate**
 - 通过一系列手段（由于不是本文重点，所以略过细节）得知会分别在`enqueueSetState`, `enqueueReplaceState`中调用
 `scheduleUpdateOnFiber`
 
**useState, useReducer**
  - `useState`其实底层调用的方法是`useReducer`，所以只需要看`useReducer`的实现,会发现在`dispatchAction`函数中调用了`scheduleUpdateOnFiber`

根据上述的结论能够知道调度的开始是在`scheduleUpdateOnFiber`方法上，接下来让我们来看下`scheduleUpdateOnFiber`

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
scheduleSyncCallback <-----SYNC----- ensureRootIsScheduled -----ASYNC-----> scheduleCallback
        |                                                                           |
        |                                                                           |
        |                                                                           |
        |                                                                           |
        -------------------------> Scheduler_scheduleCallback <----------------------
        
```

首先从`scheduleUpdateOnFiber`调用中发现`expirationTime`变量无论是不是`Sync`最终都会调用到ensureRootIsScheduled函数，接下去`ensureRootIsScheduled`中会根据当前的运行环境*（同步还是异步）*来决定调用`scheduleSyncCallback`还是`scheduleCallback`，
通过观察`scheduleSyncCallback`和`scheduleCallback`函数的实现来看内部都是会去调用`Scheduler_scheduleCallback`这个函数，唯一的区别则是`scheduleCallback`传入的第一个参数是通过当前的expirationTime去计算出的一个优先级，而`scheduleSyncCallback`传入的优先级则是固定写死的`Scheduler_ImmediatePriority`，也就是*-1*，表示立即同步执行回调函数，所以`Scheduler_scheduleCallback`在这里可以理解为如果传入-1则同步调用回调函数，传入其他数字则等待数字需要的时间后，异步调用setTimeout执行回调，在后面会详细分析`Scheduler_scheduleCallback`到底做了哪些事情？

## 小根堆

在深入`Scheduler_scheduleCallback`之前先来了解一个数据结构`堆`，堆是一种*二叉树*，所以也符合二叉树的一些特性，比如说有个节点`n(n >= 1)`, `n >> 1`，表示获取这个节点的父节点的位置， `n * 2`表示是这个节点的左子节点的位置，`n * 2 + 1`是这个节点的右子节点的位置，堆还区分`大根堆`和`小根堆`，`大根堆`表示每一个父节点都会大于它的两个子节点，而`小根堆`则相反，每一个父节点都小于它的两个子节点，通过这个特性，能够实现一个动态的优先级队列，并且时间复杂度是`logn`,是一种执行效率上很优秀的数据结构。

React需要有一种数据结构来帮助它进行diff任务的存储，其中需要频繁的插入单个节点和单次取出优先级最高的节点，最小堆正好完美符合React所需要的特性。

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

最核心的两个方法是`siftUp`和`siftDown`，分别表示节点的上浮和下沉，

**上浮**
 - 当一个节点被新添加到小根堆的末尾，这时候需要去重新调整节点的位置，来符合小根堆规则。新加入的节点需要和父节点进行对比，如果比父节点大，那么不需要进行移动，但是比父节点小的话，就需要和父节点的位置进行互换，接着继续和新的父节点进行一样的对比。

**下沉**
 - 当一个节点被从小根堆中取出，首先会把堆的首位节点和末尾节点互换，然后弹出末尾的节点，这时候从末尾更换上来的新节点可能比它的子节点大，所以需要把它下沉到复合小根堆规则的位置，先通过左右子节点对比，找到比较大的节点，接着和新移动上来的节点进行对比，如果新节点比较大，进行位置的移动，接着再重新和新的子节点进行对比，如果新节点比较小，那么说明当前就是一个符合规则的小根堆，不需要移动。

其中通过`peek`来查看堆顶的节点，`pop`来弹出堆顶的节点，`push`来增加新的节点


### 案例

有一组初始值`[5, 4, 3, 2, 1]`，通过我们小堆化以后会出现这样的一个结构
```js
          1
        2   4
      5   3
```

接下去插入新一个的节点`0`,通过上浮最终会出现以下结构.

```js
          0
        2   1
       5 3 4
```

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

首先介绍一下在调度过程中主要有两个`任务堆`，分别是`实时任务堆`和`延时任务堆`，无`delay`参数的任务都会被放入`实时任务堆`中，反之会被推入`延时任务堆`，`延时任务堆`的意义主要是在有长时间delay的任务，能够减少无用postMessage递归调用。

接下来看下以上函数的调用流程，在`unstable_scheduleCallback`会传入当前任务的优先级，回调函数，以及额外的选项，内部会根据传入的优先级或者额外选项中的`timeout`或者`delay`来设置任务的`expirationTime`，接着通过`startTime`来确定当前任务是否要放入`实时任务堆`中还是`延时任务堆`中，如果是*延迟任务*，那么会放入`延迟任务堆`，并且根据是否有实时任务可以调度并且当前任务是延时任务堆中优先级最高的，那么使用setTimeout来进行调度；如果是实时任务则会推入`实时任务堆`，接着调用`requestHostCallback`来调用`workLoop`方法，`workLoop`这个函数会被异步进行调用，这里`requestHostCallback`就是用来将`workLoop`添加到下一个宏任务，使得最终的回调在下一个时间循环才会执行,`workLoop`会从`实时任务堆顶`取出优先级最**高**的任务，接下去查看当前浏览器的渲染帧时间内是否还有时间来执行js，并且当前这个任务是否过期，如果任务还未过期但是没有时间了，就会先交出控制权限给浏览器，等待下一次调用；如果任务已经过期了，那么需要马上执行该任务，执行结束后查看`实时任务堆`是否还有任务，有的话就赋值给`currentTask`，返回`true`，表示还有任务需要调度；如果实时任务空了，那么会去调度`延时任务堆`，返回`false`，表示当下任务已经全部结束。

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

`requestHostCallback`内部通过`MessageChanel`的api来根据`workLoop`的返回值来决定是否要递归调用`performWorkUntilDeadline`，从而把每一个任务分散到浏览器的每个事件循环中

## 目前生产环境的调度模式

我们目前还是使用`ReactDOM.render`去进行应用的创建，所以在这种模式下虽然会通过`requestHostCallback`把回调放到下一个事件循环去执行，但是内部的多个任务并不会被中断，而是一次性在一个时间片中去把所有的任务全部执行完，所以并不是大家认为的当下版本的React已经是可以中断渲染，这点还是需要注意一下，如果想要尝试可中断的React渲染模式，还需要安装实验版本https://zh-hans.reactjs.org/docs/concurrent-mode-intro.html，通过`ReactDOM.createRoot`进行应用的创建，才是真正官方声称的Concurrent模式，支持可中断，多任务时间片的特性。

## 总结

我们通过对`React Scheduler`的分析，了解它是如何把一个个小的`diff任务`，通过**合作式调度**的方案，在多个时间片中调用，不阻塞浏览器的渲染，给用户带去丝滑的浏览体验。
