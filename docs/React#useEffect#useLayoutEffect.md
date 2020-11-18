# React中useEffect和useLayoutEffect分析.md

> *以下分析基于React, ReactDOM 16.13.1版本*

## 初始化

### useEffect

```js
function mountEffect(
  create,
  deps,
) {
  return mountEffectImpl(
    UpdateEffect | PassiveEffect,
    HookPassive,
    create,
    deps,
  );
}

function updateEffect(
  create,
  deps,
) {
  return updateEffectImpl(
    UpdateEffect | PassiveEffect,
    HookPassive,
    create,
    deps,
  );
}
```
### useLayoutEffect

```js
function mountLayoutEffect(
  create,
  deps,
) {
  return mountEffectImpl(UpdateEffect, HookLayout, create, deps);
}

function updateLayoutEffect(
  create,
  deps,
) {
  return updateEffectImpl(UpdateEffect, HookLayout, create, deps);
}
```

### 通用

```js
function mountEffectImpl(fiberEffectTag, hookEffectTag, create, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  currentlyRenderingFiber.effectTag |= fiberEffectTag;
  hook.memoizedState = pushEffect(
    HookHasEffect | hookEffectTag,
    create,
    undefined,
    nextDeps,
  );
}

function updateEffectImpl(fiberEffectTag, hookEffectTag, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  let destroy = undefined;

  if (currentHook !== null) {
    const prevEffect = currentHook.memoizedState;
    destroy = prevEffect.destroy;
    if (nextDeps !== null) {
      const prevDeps = prevEffect.deps;
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        pushEffect(hookEffectTag, create, destroy, nextDeps);
        return;
      }
    }
  }

  currentlyRenderingFiber.effectTag |= fiberEffectTag;

  hook.memoizedState = pushEffect(
    HookHasEffect | hookEffectTag,
    create,
    destroy,
    nextDeps,
  );
}

function pushEffect(tag, create, destroy, deps) {
  const effect: Effect = {
    tag,
    create,
    destroy,
    deps,
    // Circular
    next: null,
  };
  let componentUpdateQueue = (currentlyRenderingFiber.updateQueue: any);
  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber.updateQueue = componentUpdateQueue;
    componentUpdateQueue.lastEffect = effect.next = effect;
  } else {
    const lastEffect = componentUpdateQueue.lastEffect;
    if (lastEffect === null) {
      componentUpdateQueue.lastEffect = effect.next = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      componentUpdateQueue.lastEffect = effect;
    }
  }
  return effect;
}
```


## 调用

commit阶段函数调用栈

```js
commitBeforeMutationEffects -> schedule useEffect
          ⬇️
commitMutationEffects -> call useLayoutEffect destory
          ⬇️
commitLayoutEffects -> call useLayoutEffect create
          ⬇️ (nextTick)
flushPassiveEffects -> call useEffect destory create
```

commitBeforeMutationEffects中会通过scheduleCallback调用flushPassiveEffects,启动useEffect的调度，所以useEffect是异步调用的。

commitMutationEffects中通过Update effect和Deletion effect中以同步的方式调用useLayoutEffect的destory

commitLayoutEffects中以同步方式调用useLayoutEffect的create

在事件循环的下一个tick，最初调度的flushPassiveEffects方法会被执行，通过先调用useEffect的destroy，再调用create的方式异步来执行useEffect

## 区别

综上所述，不论是useEffect还是useLayoutEffect都是在DOM变更以后才会被调用的，至于为什么useEffect需要被异步调用，这里引用官方的话来说，这是希望useEffect中的函数不会阻塞浏览器的渲染，而你如果需要同步操作DOM的话，可以使用useLayoutEffect

<img src="../images/useEffect1.png" width="600" />