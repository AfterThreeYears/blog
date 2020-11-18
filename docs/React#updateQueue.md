## Class组件setState

创建queue

类组件在mountClassInstance会调用initializeUpdateQueue方法创建queue，挂载到fiber的updateQueue属性上

```js
export function initializeUpdateQueue<State>(fiber: Fiber): void {
  const queue: UpdateQueue<State> = {
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: {
      pending: null,
    },
    effects: null,
  };
  fiber.updateQueue = queue;
}
```

通过setState能够创建update，并且链到updateQueue的sharedQueue上，sharedQueue是一个环状链表

```js
function enqueueSetState(inst, payload, callback) {
  const fiber = getInstance(inst);
  const currentTime = requestCurrentTimeForUpdate();
  const suspenseConfig = requestCurrentSuspenseConfig();
  const expirationTime = computeExpirationForFiber(
      currentTime,
      fiber,
      suspenseConfig,
  );

  // 创建更新
  const update = createUpdate(expirationTime, suspenseConfig);
  update.payload = payload;
  if (callback !== undefined && callback !== null) {
      update.callback = callback;
  }
  // 链到sharedQueue上
  enqueueUpdate(fiber, update);
  // 启动调度
  scheduleUpdateOnFiber(fiber, expirationTime);
}

export function enqueueUpdate<State>(fiber: Fiber, update: Update<State>) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    return;
  }

  const sharedQueue: SharedQueue<State> = (updateQueue: any).shared;
  const pending = sharedQueue.pending;
  if (pending === null) {
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  sharedQueue.pending = update;
}
```

处理Queue中的update链条

```js
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderExpirationTime: ExpirationTime,
): void {
  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // Check if there are pending updates. If so, transfer them to the base queue.
  // 查看当前fiber上的BaseQueue是否有没处理的update，有的话把pendingQueue链到后面，没有就直接复制，清空pendingQueue
  let pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    queue.shared.pending = null;

    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular.
    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next;
    lastPendingUpdate.next = null;
    // Append pending updates to base queue
    if (lastBaseUpdate === null) {
      firstBaseUpdate = firstPendingUpdate;
    } else {
      lastBaseUpdate.next = firstPendingUpdate;
    }
    lastBaseUpdate = lastPendingUpdate;

    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    const current = workInProgress.alternate;
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }

  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    // Iterate through the list of updates to compute the result.
    let newState = queue.baseState;
    let newExpirationTime = NoWork;

    let newBaseState = null;
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    let update = firstBaseUpdate;
    do {
      const updateExpirationTime = update.expirationTime;
      if (updateExpirationTime < renderExpirationTime) {
        // update优先级不够，不执行，拷贝一份当前的update，完事后赋值给BaseQueue，等待下一次调度
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<State> = {
          expirationTime: update.expirationTime,
          suspenseConfig: update.suspenseConfig,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };
        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          newBaseState = newState;
        } else {
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        // Update the remaining priority in the queue.
        if (updateExpirationTime > newExpirationTime) {
          newExpirationTime = updateExpirationTime;
        }
      } else {
        // update先级足够
        // This update does have sufficient priority.

        // 应该是中断相关，猜测是需要保证update调用的连续性，否则可能有多个结果
        if (newLastBaseUpdate !== null) {
          const clone: Update<State> = {
            expirationTime: Sync, // This update is going to be committed so we never want uncommit it.
            suspenseConfig: update.suspenseConfig,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }

        // 调用update，生成新的state
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );
        const callback = update.callback;
        if (callback !== null) {
          // setState有callback，打标签，callback放入effects中，等commit阶段调用
          workInProgress.effectTag |= Callback;
          const effects = queue.effects;
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }
      // 下一个更新
      update = update.next;
      // ...
    } while (true);

    // 所有的更新都已经完成
    if (newLastBaseUpdate === null) {
      newBaseState = newState;
    }

    queue.baseState = ((newBaseState: any): State);
    // 还未到时间的update赋值给BaseUpdate
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markUnprocessedUpdateTime(newExpirationTime);
    workInProgress.expirationTime = newExpirationTime;
    workInProgress.memoizedState = newState;
  }
}
```

调用流程，初始化组件的时候创建Queue，其中调用setState来创建update，计算出新的state，启动调度，更新视图。

## Function组件 useState，useReduce

hooks queue and update

```js

const queue = fiber.queue = {
  pending: null,
  dispatch: null,
  lastRenderedReducer: basicStateReducer,
  lastRenderedState: (initialState: any),
};

const update = {
  expirationTime,
  suspenseConfig,
  action,
  eagerReducer: null,
  eagerState: null,
  next: null
};
```

mounted useState

```js
function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  const hook = mountWorkInProgressHook();
  if (typeof initialState === 'function') {
    // $FlowFixMe: Flow doesn't like mixed types
    initialState = initialState();
  }
  hook.memoizedState = hook.baseState = initialState;
  const queue = (hook.queue = {
    pending: null,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: (initialState: any),
  });
  const dispatch: Dispatch<
    BasicStateAction<S>,
  > = (queue.dispatch = (dispatchAction.bind(
    null,
    currentlyRenderingFiber,
    queue,
  ): any));
  return [hook.memoizedState, dispatch];
}
```

update useState

```js
function updateReducer<S, I, A>(
  reducer: (S, A) => S,
  S,
): [S, Dispatch<A>] {
  const hook = updateWorkInProgressHook();
  const queue = hook.queue;

  queue.lastRenderedReducer = reducer;

  const current: Hook = ();

  // The last rebase update that is NOT part of the base state.
  let baseQueue = current.baseQueue;

  // The last pending update that hasn't been processed yet.
  // 把pengdingQueue链接到baseQueue后，清除pengding
  const pendingQueue = queue.pending;
  if (pendingQueue !== null) {
    // We have new updates that haven't been processed yet.
    // We'll add them to the base queue.
    if (baseQueue !== null) {
      // Merge the pending queue and the base queue.
      const baseFirst = baseQueue.next;
      const pendingFirst = pendingQueue.next;
      baseQueue.next = pendingFirst;
      pendingQueue.next = baseFirst;
    }
    current.baseQueue = baseQueue = pendingQueue;
    queue.pending = null;
  }

  if (baseQueue !== null) {
    // We have a queue to process.
    const first = baseQueue.next;
    let newState = current.baseState;

    let newBaseState = null;
    let newBaseQueueFirst = null;
    let newBaseQueueLast = null;
    let update = first;
    do {
      const updateExpirationTime = update.expirationTime;
      if (updateExpirationTime < renderExpirationTime) {
        // 优先级不足，把这个update链到newBaseQueueFirst，等循环结束后，重设到baseQueue, 等待下一次的调度
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<S, A> = {
          expirationTime: update.expirationTime,
          suspenseConfig: update.suspenseConfig,
          action: update.action,
          eagerReducer: update.eagerReducer,
          eagerState: update.eagerState,
          next: (null: any),
        };
        if (newBaseQueueLast === null) {
          newBaseQueueFirst = newBaseQueueLast = clone;
          newBaseState = newState;
        } else {
          newBaseQueueLast = newBaseQueueLast.next = clone;
        }
        // Update the remaining priority in the queue.
        if (updateExpirationTime > currentlyRenderingFiber.expirationTime) {
          currentlyRenderingFiber.expirationTime = updateExpirationTime;
          markUnprocessedUpdateTime(updateExpirationTime);
        }
      } else {
        // This update does have sufficient priority.

        if (newBaseQueueLast !== null) {
          const clone: Update<S, A> = {
            expirationTime: Sync, // This update is going to be committed so we never want uncommit it.
            suspenseConfig: update.suspenseConfig,
            action: update.action,
            eagerReducer: update.eagerReducer,
            eagerState: update.eagerState,
            next: (null: any),
          };
          newBaseQueueLast = newBaseQueueLast.next = clone;
        }

        // Mark the event time of this update as relevant to this render pass.
        // TODO: This should ideally use the true event time of this update rather than
        // its priority which is a derived and not reverseable value.
        // TODO: We should skip this update if it was already committed but currently
        // we have no way of detecting the difference between a committed and suspended
        // update here.
        markRenderEventTimeAndConfig(
          updateExpirationTime,
          update.suspenseConfig,
        );

        // 根据reducer处理旧state，生成新state
        if (update.eagerReducer === reducer) {
          // If this update was processed eagerly, and its reducer matches the
          // current reducer, we can use the eagerly computed state.
          newState = ((update.eagerState: any): S);
        } else {
          const action = update.action;
          newState = reducer(newState, action);
        }
      }
      // 下一个update
      update = update.next;
    } while (update !== null && update !== first);

    if (newBaseQueueLast === null) {
      // 这一轮的update都处理完毕
      newBaseState = newState;
    } else {
      // 遗留未处理的update，等待下一次调度执行
      newBaseQueueLast.next = newBaseQueueFirst;
    }

    // state变化，修改didReceiveUpdate为true
    if (!is(newState, hook.memoizedState)) {
      markWorkInProgressReceivedUpdate();
    }

    hook.memoizedState = newState;
    hook.baseState = newBaseState;
    hook.baseQueue = newBaseQueueLast;

    queue.lastRenderedState = newState;
  }

  const dispatch: Dispatch<A> = (queue.dispatch: any);
  return [hook.memoizedState, dispatch];
}
```

dispatch

```js
function dispatchAction<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  const currentTime = requestCurrentTimeForUpdate();
  const suspenseConfig = requestCurrentSuspenseConfig();
  const expirationTime = computeExpirationForFiber(
    currentTime,
    fiber,
    suspenseConfig,
  );

  const update: Update<S, A> = {
    expirationTime,
    suspenseConfig,
    action,
    eagerReducer: null,
    eagerState: null,
    next: (null: any),
  };

  // Append the update to the end of the list.
  // 把新update挂载到pending上
  const pending = queue.pending;
  if (pending === null) {
    // This is the first update. Create a circular list.
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  queue.pending = update;

  const alternate = fiber.alternate;
  if (
    fiber === currentlyRenderingFiber ||
    (alternate !== null && alternate === currentlyRenderingFiber)
  ) {
    // 在render阶段创建了更新，需要确认是不是死循环
    // This is a render phase update. Stash it in a lazily-created map of
    // queue -> linked list of updates. After this render pass, we'll restart
    // and apply the stashed updates on top of the work-in-progress hook.
    didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
    update.expirationTime = renderExpirationTime;
  } else {
    if (
      fiber.expirationTime === NoWork &&
      (alternate === null || alternate.expirationTime === NoWork)
    ) {
      // The queue is currently empty, which means we can eagerly compute the
      // next state before entering the render phase. If the new state is the
      // same as the current state, we may be able to bail out entirely.
      const lastRenderedReducer = queue.lastRenderedReducer;
      if (lastRenderedReducer !== null) {
        let prevDispatcher;
        try {
          const currentState: S = (queue.lastRenderedState: any);
          // 根据[state, setState]，根据setState创建出新的state
          const eagerState = lastRenderedReducer(currentState, action);
          // Stash the eagerly computed state, and the reducer used to compute
          // it, on the update object. If the reducer hasn't changed by the
          // time we enter the render phase, then the eager state can be used
          // without calling the reducer again.
          update.eagerReducer = lastRenderedReducer;
          update.eagerState = eagerState;
          // 新老state对比，没有更新则可以不启动调度
          if (is(eagerState, currentState)) {
            // Fast path. We can bail out without scheduling React to re-render.
            // It's still possible that we'll need to rebase this update later,
            // if the component re-renders for a different reason and by that
            // time the reducer has changed.
            return;
          }
        } catch (error) {
          // Suppress the error. It will throw again in the render phase.
        } finally {
        }
      }
    }
    // 启动调度
    scheduleUpdateOnFiber(fiber, expirationTime);
  }
}
```