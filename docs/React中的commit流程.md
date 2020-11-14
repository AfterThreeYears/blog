# React中的reconcile流程

> *以下分析基于React, ReactDOM 16.13.1版本*

```js
function commitRootImpl(root, renderPriorityLevel) {
  // 开始commit的节点设置局部变量
  const finishedWork = root.finishedWork;
  const expirationTime = root.finishedExpirationTime;

  // 恢复默认值
  root.finishedWork = null;
  root.finishedExpirationTime = NoWork;
  root.callbackNode = null;
  root.callbackExpirationTime = NoWork;
  root.callbackPriority_old = NoPriority;

  let firstEffect;
  let nextEffect;
  firstEffect = finishedWork.firstEffect;

  if (firstEffect !== null) {
    const prevExecutionContext = executionContext;
    executionContext |= CommitContext;

    ReactCurrentOwner.current = null;

    // 1.beforeMutation, 负责调用 getSnapshotBeforeUpdate，useEffect
    nextEffect = firstEffect;
    do {
      // class组件执行getSnapshotBeforeUpdate，
      // function组件执行useEffect
      commitBeforeMutationEffects();
    } while (nextEffect !== null);

    nextEffect = firstEffect;
    do {
      // 1. 增删改DOM到页面上
      // 2. 调用useLayoutEffect销毁函数
      // 3. 删除的节点调用销毁函数
      // 4. 销毁掉Ref
      commitMutationEffects(root, renderPriorityLevel);
    } while (nextEffect !== null);

    // 当页面DOM渲染结束以后，可以把root.current指向workInProgress替代原来的current
    root.current = finishedWork;

    nextEffect = firstEffect;
    do {
      // 1. 调用useLayoutEffect创建函数
      // 2. 创建/更新的节点调用componentDidMount，componentDidUpdate
      // 3. 重新设置Ref
      commitLayoutEffects(root, expirationTime);
    } while (nextEffect !== null);

    nextEffect = null;

    executionContext = prevExecutionContext;
  }

  // 重新检查是否有新的调度
  ensureRootIsScheduled(root);

  // 如果layout阶段有调度更新, 在这里进行刷新
  flushSyncCallbackQueue();

  return null;
}
```

```js
function commitBeforeMutationEffects() {
  while (nextEffect !== null) {
    const current = nextEffect.alternate;

    const effectTag = nextEffect.effectTag;
    // 拥有Snapshot副作用，执行getSnapshotBeforeUpdate钩子
    // 结果挂载在实例的__reactInternalSnapshotBeforeUpdate属性上，
    // 按照官方的说法可以在componentDidUpdate钩子的第三个参数获取到，但是上通过hack的手段
    // 在实例上通过this.__reactInternalSnapshotBeforeUpdate就可以获取了，虽然一般没必要去通过私有属性读取
    if ((effectTag & Snapshot) !== NoEffect) {
      commitBeforeMutationEffectOnFiber(current, nextEffect);
    }
    if ((effectTag & Passive) !== NoEffect) {
      // hook相关，依次调用useEffect的destroy和create函数
      flushPassiveEffects();
    }
    nextEffect = nextEffect.nextEffect;
  }
}
```

```js
function commitMutationEffects(root: FiberRoot, renderPriorityLevel) {
  while (nextEffect !== null) {

    const effectTag = nextEffect.effectTag;

    // 文本节点重设内容
    if (effectTag & ContentReset) {
      commitResetTextContent(nextEffect);
    }

    // 重置Ref
    if (effectTag & Ref) {
      const current = nextEffect.alternate;
      if (current !== null) {
        commitDetachRef(current);
      }
    }

    const primaryEffectTag =
      effectTag & (Placement | Update | Deletion | Hydrating);
    switch (primaryEffectTag) {
      case Placement: {
        // 创建新增加的节点，并且插入到父级节点内
        commitPlacement(nextEffect);
        nextEffect.effectTag &= ~Placement;
        break;
      }
      case Update: {
        const current = nextEffect.alternate;
        // 根据新的updateQueue来进行DOM的更新
        commitWork(current, nextEffect);
        break;
      }
      case Deletion: {
        // 销毁阶段会根据当前节点的类型分别进行删除DOM节点和调用组件的销毁函数
        commitDeletion(root, nextEffect, renderPriorityLevel);
        break;
      }
    }

    nextEffect = nextEffect.nextEffect;
  }
}
```

```js
function commitPlacement(finishedWork: Fiber): void {
  // 往上寻找到最接近的Host节点，因为这里就直接需要进行DOM操作，进行页面的渲染了
  const parentFiber = getHostParentFiber(finishedWork);

  let parent;
  let isContainer;
  const parentStateNode = parentFiber.stateNode;
  switch (parentFiber.tag) {
    case HostComponent:
      parent = parentStateNode;
      isContainer = false;
      break;
    case HostRoot:
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    case HostPortal:
      parent = parentStateNode.containerInfo;
      isContainer = true;
      break;
    default:
  }
  if (parentFiber.effectTag & ContentReset) {
    // 需要删除文本内容，直接删除就行
    resetTextContent(parent);
    // 清除ContentReset副作用Tag
    parentFiber.effectTag &= ~ContentReset;
  }

  // 往sibling寻找最近的一个没有Placement Tag的Host节点，用于parentNode.insertBefore的第二个参数
  const before = getHostSibling(finishedWork);
  // 把DOM节点插入到页面上，根据是否有before节点，分别调用insertBefore还是appendChild方法
  if (isContainer) {
    insertOrAppendPlacementNodeIntoContainer(finishedWork, before, parent);
  } else {
    insertOrAppendPlacementNode(finishedWork, before, parent);
  }
}



function commitWork(current: Fiber | null, finishedWork: Fiber): void {
  switch (finishedWork.tag) {
    case FunctionComponent: {
      // 调用useLayoutEffect
      commitHookEffectListUnmount(HookLayout | HookHasEffect, finishedWork);
      return;
    }
    case ClassComponent: {
      return;
    }
    case HostComponent: {
      const instance: Instance = finishedWork.stateNode;
      if (instance != null) {
        const newProps = finishedWork.memoizedProps;
        const oldProps = current !== null ? current.memoizedProps : newProps;
        const type = finishedWork.type;
        // 获取在completeWork阶段对props进行diff的结果
        const updatePayload: null | UpdatePayload = (finishedWork.updateQueue: any);
        finishedWork.updateQueue = null;
        // 根据updatePayload对DOM进行属性的更新
        if (updatePayload !== null) {
          commitUpdate(
            instance,
            updatePayload,
            type,
            oldProps,
            newProps,
            finishedWork,
          );
        }
      }
      return;
    }
    case HostText: {
      const textInstance: TextInstance = finishedWork.stateNode;
      const newText: string = finishedWork.memoizedProps;
      const oldText: string =
        current !== null ? current.memoizedProps : newText;
      // 对Text进行新内容的赋值
      commitTextUpdate(textInstance, oldText, newText);
      return;
    }
    case HostRoot: {
      return;
    }
  }
}


function commitDeletion(
  finishedRoot: FiberRoot,
  current: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  unmountHostComponents(finishedRoot, current, renderPriorityLevel);
}

function unmountHostComponents(
  finishedRoot,
  current,
  renderPriorityLevel,
): void {
  let node: Fiber = current;

  let currentParentIsValid = false;

  let currentParent;
  let currentParentIsContainer;

  while (true) {
    if (!currentParentIsValid) {
      let parent = node.return;
      findParent: while (true) {
        const parentStateNode = parent.stateNode;
        switch (parent.tag) {
          case HostComponent:
            currentParent = parentStateNode;
            currentParentIsContainer = false;
            break findParent;
          case HostRoot:
            currentParent = parentStateNode.containerInfo;
            currentParentIsContainer = true;
            break findParent;
          case HostPortal:
        }
        parent = parent.return;
      }
      currentParentIsValid = true;
    }

    if (node.tag === HostComponent || node.tag === HostText) {
      commitNestedUnmounts(finishedRoot, node, renderPriorityLevel);
      if (currentParentIsContainer) {
        removeChildFromContainer(currentParent, node.stateNode);
      } else {
        removeChild(currentParent, node.stateNode);
      }
    }
    else {
      commitUnmount(finishedRoot, node, renderPriorityLevel);
      if (node.child !== null) {
        node.child.return = node;
        node = node.child;
        continue;
      }
    }
    if (node === current) {
      return;
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === current) {
        return;
      }
      node = node.return;
      if (node.tag === HostPortal) {
        currentParentIsValid = false;
      }
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}


function commitUnmount(
  finishedRoot: FiberRoot,
  current: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  switch (current.tag) {
    case FunctionComponent: {
      const updateQueue: FunctionComponentUpdateQueue | null = (current.updateQueue: any);
      if (updateQueue !== null) {
        const lastEffect = updateQueue.lastEffect;
        if (lastEffect !== null) {
          const firstEffect = lastEffect.next;

          let effect = firstEffect;
          do {
            const {destroy, tag} = effect;
            if (destroy !== undefined) {
              if ((tag & HookPassive) !== NoHookEffect) {
                enqueuePendingPassiveHookEffectUnmount(current, effect);
              } else {
                safelyCallDestroy(current, destroy);
              }
            }
            effect = effect.next;
          } while (effect !== firstEffect);
        }
      }
      return;
    }
    case ClassComponent: {
      safelyDetachRef(current);
      const instance = current.stateNode;
      if (typeof instance.componentWillUnmount === 'function') {
        safelyCallComponentWillUnmount(current, instance);
      }
      return;
    }
    case HostComponent: {
      safelyDetachRef(current);
      return;
    }
  }
}

function commitNestedUnmounts(
  finishedRoot: FiberRoot,
  root: Fiber,
  renderPriorityLevel: ReactPriorityLevel,
): void {
  let node: Fiber = root;
  while (true) {
    commitUnmount(finishedRoot, node, renderPriorityLevel);
    if (
      node.child !== null
    ) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === root) {
      return;
    }
    while (node.sibling === null) {
      if (node.return === null || node.return === root) {
        return;
      }
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
}

```




```js
function commitLayoutEffects(
  root: FiberRoot,
  committedExpirationTime: ExpirationTime,
) {
  while (nextEffect !== null) {

    const effectTag = nextEffect.effectTag;

    if (effectTag & (Update | Callback)) {
      const current = nextEffect.alternate;
      commitLayoutEffectOnFiber(
        root,
        current,
        nextEffect,
        committedExpirationTime,
      );
    }

    if (effectTag & Ref) {
      commitAttachRef(nextEffect);
    }

    nextEffect = nextEffect.nextEffect;
  }
}
```

```js
function commitLayoutEffectOnFiber(
  finishedRoot: FiberRoot,
  current: Fiber | null,
  finishedWork: Fiber,
  committedExpirationTime: ExpirationTime,
): void {
  switch (finishedWork.tag) {
    case FunctionComponent: {
      commitHookEffectListMount(HookLayout | HookHasEffect, finishedWork);

      schedulePassiveEffects(finishedWork);
      return;
    }
    case ClassComponent: {
      const instance = finishedWork.stateNode;
      if (finishedWork.effectTag & Update) {
        if (current === null) {
          instance.componentDidMount();
        } else {
          const prevProps =
            finishedWork.elementType === finishedWork.type
              ? current.memoizedProps
              : resolveDefaultProps(finishedWork.type, current.memoizedProps);
          const prevState = current.memoizedState;
          instance.componentDidUpdate(
            prevProps,
            prevState,
            instance.__reactInternalSnapshotBeforeUpdate,
          );
        }
      }

      const updateQueue = finishedWork.updateQueue;
      if (updateQueue !== null) {
        // 调用setState的回调
        commitUpdateQueue(finishedWork, updateQueue, instance);
      }
      return;
    }
    case HostRoot: {
      const updateQueue = finishedWork.updateQueue;
      if (updateQueue !== null) {
        let instance = null;
        if (finishedWork.child !== null) {
          switch (finishedWork.child.tag) {
            case HostComponent:
              instance = getPublicInstance(finishedWork.child.stateNode);
              break;
            case ClassComponent:
              instance = finishedWork.child.stateNode;
              break;
          }
        }
        commitUpdateQueue(finishedWork, updateQueue, instance);
      }
      return;
    }
    case HostComponent: {
      return;
    } 
  }
}

```