# React中的reconcile流程

> *以下分析基于React, ReactDOM 16.13.1版本*

## 概览

React的渲染分为三个部分，分别是调度，调和，和提交阶段，之前我们讲完了调度，接下来来说说调和。

首先要明白React在这个阶段做了哪些事情，这个分为两块，分别是初始化和进行更新，其中会有一些不同点
初始化的目的主要是从单单一个HostRootFiber节点生成一颗全新的Fiber Tree, 能够让它在下一个阶段被渲染到浏览器的页面上，
更新阶段的目的是为了对比新老的阶段，进行Diff，如果能复用则进行复用，不能复用的则销毁和重新创建对应的节点，这里创建或者复用的节点
并不会实时更新在创建阶段的Fiber Tree上，而是使用双缓存的技术，通过alternate数学来关联出一颗新的Fiber Tree，当所有的diff结束以后，才会使用新创建的Fiber Tree来替换掉页面上老的Tree。

具体再往下细化一层则是首先会对每个Fiber节点进行创建或者复用的操作，接着下一步才会进行DOM实例的创建或者复用，中间还会夹杂着React组件的初始化等等一系列的动作。

我们知道不论是通过ReactDOM.render还是通过setState创建更新，最终都是调用到performSyncWorkOnRoot函数，它内部主要做了两件事情，对应了上面所说的创建/更新Fiber和提交更新两个任务，创建/更新Fiber对应的函数是renderRootSync,在其中会调用workLoopSync，workLoopSync中会依次对每一个workInProgress（当前正在更新的Fiber节点）进行做相应的工作，并且通过不断的对workInProgress进行赋值来实现依次跑完整个链表上的节点。

```js
function performSyncWorkOnRoot(root) {
  // ...

  // 构建完成fiber树，返回值表示是否构建过程中有异常抛出
  let exitStatus = renderRootSync(root, expirationTime);

  // 进行commit操作
  commitRoot(root);

  return null;
}

function renderRootSync(root, expirationTime) {
  workLoopSync();

  workInProgressRoot = null;
  return workInProgressRootExitStatus;
}

function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}

```

在performUnitOfWork中有两个函数
 - beginWork
    1. 创建阶段： 从零到一创建出Fiber Tree，同时执行组件的生命周期函数，生成出一颗新Fiber Tree
    2. 更新阶段： 对比新React Element对象和老的Fiber节点进行对比，是否决定复用老Fiber还是重新创建Fiber，最终结果也是生成出一颗新Fiber Tree
    所以它主要是对类组件和函数组件的初始化

 - completeUnitOfWork
    当beginWork运行结束以后，并不代表每一个React Element都已经被转换为Fiber节点，也就是并还未被初始化，所以completeWork可以通过先sibling，后return的手段，遍历每一个节点，如果当前是未被BeginWork处理过的节点，还会首先通过BeginWork去处理它，然后就紧接着继续回到
    completeUnitOfWork中，这个函数主要是对HostComponent和HostText的实例进行props的设置和diff

    创建：对于创建DOM实例，绑定事件，插入到父节点的实例上
    更新：对比props，diff出不同的props数组，挂载到workInProgress.updateQueue，更新当前节点的副作用，以备用于commit阶段使用
    主要是用于HostComponent, HostText节点的处理

performUnitOfWork中会根据beginWork返回的next节点是否是null来判断是否已经创建完毕children，需要进入到completeUnitOfWork阶段。
由于beginWork里逻辑比较多，我们在这里只关心FunctionComponent，ClassComponent，HostRoot，HostComponent，HostText这几个的逻辑，completeUnitOfWork同理，还需要提前指出的一点是在后面的逻辑中通常会用current === null来判断是创建阶段，还是更新阶段，这里会相互交叉着来讲解

```js
function performUnitOfWork(unitOfWork: Fiber): void {
  const current = unitOfWork.alternate;
  let next = beginWork(current, unitOfWork, renderExpirationTime);
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  if (next === null) {
    completeUnitOfWork(unitOfWork);
  } else {
    workInProgress = next;
  }
  ReactCurrentOwner.current = null;
}

```

## beginWork

进入到beginWork, 首先看下Fiber节点是否需要更新的策略，如果是创建阶段，didReceiveUpdate被设置为false，而在更新阶段则会通过新老props的对比是否相同，或者是否有遗留的context来设置didReceiveUpdate的值，还可以通过updateExpirationTime和renderExpirationTime的对比来跳过这个节点的更新,didReceiveUpdate会在后面更新是用来决定是否可以跳过更新。

```js
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
): Fiber | null {
  const updateExpirationTime = workInProgress.expirationTime;
  if (current !== null) {
    const oldProps = current.memoizedProps;
    const newProps = workInProgress.pendingProps;

    if (
      oldProps !== newProps ||
      hasLegacyContextChanged() ||
    ) {
      didReceiveUpdate = true;
    } else if (updateExpirationTime < renderExpirationTime) {
      didReceiveUpdate = false;
      return bailoutOnAlreadyFinishedWork(
        current,
        workInProgress,
        renderExpirationTime,
      );
    } else {
      didReceiveUpdate = false;
    }
  } else {
    didReceiveUpdate = false;
  }

  switch (workInProgress.tag) {
    case FunctionComponent: {
      const Component = workInProgress.type;
      const unresolvedProps = workInProgress.pendingProps;
      const resolvedProps =
        workInProgress.elementType === Component
          ? unresolvedProps
          : resolveDefaultProps(Component, unresolvedProps);
      return updateFunctionComponent(
        current,
        workInProgress,
        Component,
        resolvedProps,
        renderExpirationTime,
      );
    }
    case ClassComponent: {
      const Component = workInProgress.type;
      const unresolvedProps = workInProgress.pendingProps;
      const resolvedProps =
        workInProgress.elementType === Component
          ? unresolvedProps
          : resolveDefaultProps(Component, unresolvedProps);
      return updateClassComponent(
        current,
        workInProgress,
        Component,
        resolvedProps,
        renderExpirationTime,
      );
    }
    case HostRoot:
      return updateHostRoot(current, workInProgress, renderExpirationTime);
    case HostComponent:
      return updateHostComponent(current, workInProgress, renderExpirationTime);
    case HostText:
      return updateHostText(current, workInProgress);
  }
}
```

接着通过workInProgress.tag来执行不同组件的逻辑
  首先进入HostRoot，它是我们React应用挂载的根节点,
它通过对比prevChildren和nextChildren来决定是否要跳过更新，
  如果相同则调用bailoutOnAlreadyFinishedWork，通过childExpirationTime来判断子节点是否有更新，没有更新则返回null，调出这次调度，有更新则通过cloneChildFibers把current的child复制给workInProgress，
  如果不相同则通过reconcileChildren来调和子节点。

```js
function updateHostRoot(current, workInProgress, renderExpirationTime) {
  const prevState = workInProgress.memoizedState;
  const prevChildren = prevState !== null ? prevState.element : null;
  // ...
  const nextState = workInProgress.memoizedState;
  const nextChildren = nextState.element;
  if (nextChildren === prevChildren) {
    return bailoutOnAlreadyFinishedWork(
      current,
      workInProgress,
      renderExpirationTime,
    );
  }
  const root: FiberRoot = workInProgress.stateNode;
  reconcileChildren(
    current,
    workInProgress,
    nextChildren,
    renderExpirationTime,
  );
  return workInProgress.child;
}

function bailoutOnAlreadyFinishedWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
): Fiber | null {
  // ...
  const childExpirationTime = workInProgress.childExpirationTime;
  if (childExpirationTime < renderExpirationTime) {
    return null;
  } else {
    cloneChildFibers(current, workInProgress);
    return workInProgress.child;
  }
}

```

再来是分析Class组件，它会根据是否存在实例，和current是否是null，来决定调用对应的生命周期
   - 实例不存在，那么就调用constructClassInstance和mountClassInstance，分别对应new 操作和调用componentWillMount，给effectTag增加标签等一系列动作，所以从这里也能知道为什么会在后续的版本中废弃
   componentWillMount等生命周期，就是因为这里可能会被多次调用，会出现不可预期的异常。
   - 实例存在，但是当前是创建阶段，调用resumeMountClassInstance， 这种比较奇怪，有可能是服务端渲染的情况，不多展开
   - 实例存在，是更新阶段，这种情况很好理解，就是普通的更新调用updateClassInstance

```js
function updateClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  nextProps,
  renderExpirationTime: ExpirationTime,
) {
  const instance = workInProgress.stateNode;
  let shouldUpdate;
  if (instance === null) {
    if (current !== null) {
      current.alternate = null;
      workInProgress.alternate = null;
      workInProgress.effectTag |= Placement;
    }
    constructClassInstance(workInProgress, Component, nextProps);
    mountClassInstance(
      workInProgress,
      Component,
      nextProps,
      renderExpirationTime,
    );
    shouldUpdate = true;
  } else if (current === null) {
    shouldUpdate = resumeMountClassInstance(
      workInProgress,
      Component,
      nextProps,
      renderExpirationTime,
    );
  } else {
    shouldUpdate = updateClassInstance(
      current,
      workInProgress,
      Component,
      nextProps,
      renderExpirationTime,
    );
  }
  const nextUnitOfWork = finishClassComponent(
    current,
    workInProgress,
    Component,
    shouldUpdate,
    hasContext,
    renderExpirationTime,
  );
  return nextUnitOfWork;
}
```

接着来依次进行分析首先是constructClassInstance和mountClassInstance，会先初始化实例，然后调用
applyDerivedStateFromProps，componentWillMount生命周期，如果有componentDidMount定义，在effecTag上
会加一个Upadte标记以便后续调用。

```js
function constructClassInstance(
  workInProgress: Fiber,
  ctor: any,
  props: any,
): any {
  let context = emptyContextObject;
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    // 获取context
    context = readContext((contextType: any));
  }
  // 实例化
  const instance = new ctor(props, context);
  const state = (workInProgress.memoizedState =
    instance.state !== null && instance.state !== undefined
      ? instance.state
      : null);
  // 初始化setState等方法，所以在construct中无法调用setState等api
  adoptClassInstance(workInProgress, instance);

  return instance;
}

function adoptClassInstance(workInProgress: Fiber, instance: any): void {
  instance.updater = classComponentUpdater;
  workInProgress.stateNode = instance;
  setInstance(instance, workInProgress);
}

function mountClassInstance(
  workInProgress: Fiber,
  ctor: any,
  newProps: any,
  renderExpirationTime: ExpirationTime,
): void {
  const instance = workInProgress.stateNode;
  instance.props = newProps;
  instance.state = workInProgress.memoizedState;
  instance.refs = emptyRefsObject;

  const contextType = ctor.contextType;
  // class组件可以通过this.context获取context
  if (typeof contextType === 'object' && contextType !== null) {
    instance.context = readContext(contextType);
  }

  instance.state = workInProgress.memoizedState;

  // 调用getDerivedStateFromProps
  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(
      workInProgress,
      ctor,
      getDerivedStateFromProps,
      newProps,
    );
    instance.state = workInProgress.memoizedState;
  }

  // 调用componentWillMount，这里面可以访问this，所以需要重新处理UpdateQueue，重新赋值给state
  if (
    typeof ctor.getDerivedStateFromProps !== 'function' &&
    typeof instance.getSnapshotBeforeUpdate !== 'function' &&
    (typeof instance.UNSAFE_componentWillMount === 'function' ||
      typeof instance.componentWillMount === 'function')
  ) {
    callComponentWillMount(workInProgress, instance);
    processUpdateQueue(
      workInProgress,
      newProps,
      instance,
      renderExpirationTime,
    );
    instance.state = workInProgress.memoizedState;
  }

  // componentDidMount并不会调用，而是在effectTag上增加一个标记Update
  if (typeof instance.componentDidMount === 'function') {
    workInProgress.effectTag |= Update;
  }
}
```
resumeMountClassInstance情况比较特殊，所以不去展开，接着来看updateClassInstance的逻辑

```js

function updateClassInstance(
  current: Fiber,
  workInProgress: Fiber,
  ctor: any,
  newProps: any,
  renderExpirationTime: ExpirationTime,
): boolean {
  const instance = workInProgress.stateNode;

  cloneUpdateQueue(current, workInProgress);

  const oldProps = workInProgress.memoizedProps;
  instance.props = oldProps;
   const unresolvedOldProps = workInProgress.memoizedProps;
  const unresolvedNewProps = workInProgress.pendingProps;

  const oldContext = instance.context;
  const contextType = ctor.contextType;
  let nextContext = emptyContextObject;
  // 读取最新的context
  if (typeof contextType === 'object' && contextType !== null) {
    nextContext = readContext(contextType);
  }


  const getDerivedStateFromProps = ctor.getDerivedStateFromProps;
  const hasNewLifecycles =
    typeof getDerivedStateFromProps === 'function' ||
    typeof instance.getSnapshotBeforeUpdate === 'function';

  // 在有新生命周期getDerivedStateFromProps的情况下不调用componentWillReceiveProps
  // 如果新旧props或者新旧context引用不相同则会调用componentWillReceiveProps函数
  // 在componentWillReceiveProps中如果state被修改，会用新的state创建一个更新，启动一个新的调度，所以这里可能会出现无限更新的情况
  if (
    !hasNewLifecycles &&
    (typeof instance.UNSAFE_componentWillReceiveProps === 'function' ||
      typeof instance.componentWillReceiveProps === 'function')
  ) {
    if (
      unresolvedOldProps !== unresolvedNewProps ||
      oldContext !== nextContext
    ) {
      callComponentWillReceiveProps(
        workInProgress,
        instance,
        newProps,
        nextContext,
      );
    }
  }

  const oldState = workInProgress.memoizedState;
  let newState = (instance.state = oldState);
  // 处理更新队列，生成新的state
  processUpdateQueue(workInProgress, newProps, instance, renderExpirationTime);
  newState = workInProgress.memoizedState;

  // workInProgress的props和state都没有变化，说明当前组件没有更新，返回false指示当前组件可以不更新
  if (
    unresolvedOldProps === unresolvedNewProps &&
    oldState === newState &&
    !hasContextChanged() &&
    !checkHasForceUpdateAfterProcessing()
  ) {
    // ...
    return false;
  }

  // 调用getDerivedStateFromProps设置新的state
  if (typeof getDerivedStateFromProps === 'function') {
    applyDerivedStateFromProps(
      workInProgress,
      ctor,
      getDerivedStateFromProps,
      newProps,
    );
    newState = workInProgress.memoizedState;
  }

  /**
   ** checkShouldComponentUpdate首先会根据shouldComponentUpdate的返回值来决定是否需要更新，其次是isPureReactComponent的话还会默认浅对比props和state来决定是否需要更新
   */
  const shouldUpdate =
    checkHasForceUpdateAfterProcessing() ||
    checkShouldComponentUpdate(
      workInProgress,
      ctor,
      oldProps,
      newProps,
      oldState,
      newState,
      nextContext,
    );

  // 需要更新的话，会调用componentWillUpdate钩子，另外定义了componentDidUpdate或者getSnapshotBeforeUpdate生命周期函数的话， 在effectTag上加Update或者Snapshot Tag。
  if (shouldUpdate) {
    if (
      !hasNewLifecycles &&
      (typeof instance.UNSAFE_componentWillUpdate === 'function' ||
        typeof instance.componentWillUpdate === 'function')
    ) {
      if (typeof instance.componentWillUpdate === 'function') {
        instance.componentWillUpdate(newProps, newState, nextContext);
      }
      if (typeof instance.UNSAFE_componentWillUpdate === 'function') {
        instance.UNSAFE_componentWillUpdate(newProps, newState, nextContext);
      }
    }
    if (typeof instance.componentDidUpdate === 'function') {
      workInProgress.effectTag |= Update;
    }
    if (typeof instance.getSnapshotBeforeUpdate === 'function') {
      workInProgress.effectTag |= Snapshot;
    }
  } else {
    // ...
  }

  // 最终把新值复制，返回shouldUpdate，作为是否要调用render函数的标志
  instance.props = newProps;
  instance.state = newState;
  instance.context = nextContext;

  return shouldUpdate;
}
```

在updateClassInstance中会去分别比对新旧state，props，context来给shouldUpdate赋值，用于决定是否需要调用render函数，其中会依次componentWillReceiveProps，getDerivedStateFromProps，ShouldComponentUpdate，componentWillUpdate钩子，另外如果定义componentDidUpdate或者getSnapshotBeforeUpdate还会额外打上Tag，用于后续调用，其中componentWillReceiveProps和componentWillUpdate都是可以创建更新来设置state，所以两个方法在后续会被废弃，目前可以用getDerivedStateFromProps来替代。

另外对于Pure组件还会使用内置的浅对比算法来进行状态的比对，用于防止无谓的更新，所以推荐写Class组件的时候默认使用Pure组件来进行继承。

当上述流程结束以后，我们就能知道这个组件是否应该更新，如果不更新的话，就直接跳过，否则的话需要调用render函数，
返回新的children element节点，对children节点进行处理，最后返回第一个子节点，用于下一次循环使用

```js
function finishClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  shouldUpdate: boolean,
  hasContext: boolean,
  renderExpirationTime: ExpirationTime,
) {
  // 不需要更新，直接跳过
  if (!shouldUpdate) {
    return bailoutOnAlreadyFinishedWork(
      current,
      workInProgress,
      renderExpirationTime,
    );
  }

  const instance = workInProgress.stateNode;

  ReactCurrentOwner.current = workInProgress;
  // 调用render，生成children，进行children的处理
  let nextChildren = instance.render();

  reconcileChildren(
    current,
    workInProgress,
    nextChildren,
    renderExpirationTime,
  );

  workInProgress.memoizedState = instance.state;

  // 处理结束返回第一个子节点
  return workInProgress.child;
}
```


说完了Class组件再来看下函数组件，函数组件不谈hooks的话，逻辑就比Class组件简单不少，只是需要调用函数组件，返回
nextChildren element，根据didReceiveUpdate和hooks的情况来决定是否需要跳过更新，不跳过更新的话就会和class组件一样去调和子节点，返回子节点中的第一个用于下次循环使用。

这里值得一提的是无论组件需不需要更新，都是会render，而不是像class组件去通过shouldUpate后再来执行render函数，所以React提供了memo组件来帮助优化Function组件的性能。

```js
function updateFunctionComponent(
  current,
  workInProgress,
  Component,
  nextProps: any,
  renderExpirationTime,
) {
  let context;
  let nextChildren;
  prepareToReadContext(workInProgress, renderExpirationTime);
  // 下面类似 nextChildren = Component(nextProps, context);
  nextChildren = renderWithHooks(
    current,
    workInProgress,
    Component,
    nextProps,
    context,
    renderExpirationTime,
  );

  // 在除去hooks的影响下，能够让函数组件进行更新的就只有props和context，所以这里只需要根据didReceiveUpdate的值，来决定是否跳过更新
  if (current !== null && !didReceiveUpdate) {
    bailoutHooks(current, workInProgress, renderExpirationTime);
    return bailoutOnAlreadyFinishedWork(
      current,
      workInProgress,
      renderExpirationTime,
    );
  }

  reconcileChildren(
    current,
    workInProgress,
    nextChildren,
    renderExpirationTime,
  );
  return workInProgress.child;
}
```

两个常用的React组件讲完后我们来看看DOM组件和Text组件的创建和更新,这两个组件的逻辑主要在completeWork中，所以放在一起带过

DOM组件
  DOM组件这里React在这里做了一次优化，在只有一个子节点的情况下，直接停止往下遍历，进入到completeWork的阶段，
另外一种情况是更新之前有单个子节点，但是到现在没有子节点了，这就需要把之前的节点内容删除，会给effectTag打一个
ContentReset的Tag，在commit阶段被使用，然后就是普通情况，有多个子节点，那就继续调用reconcileChildren调和子节点，返回第一个子节点。
Text组件
  无需做任何事情，结束beginWork，进入到completeWork。

```js
function updateHostComponent(current, workInProgress, renderExpirationTime) {
  const type = workInProgress.type;
  const nextProps = workInProgress.pendingProps;
  const prevProps = current !== null ? current.memoizedProps : null;

  let nextChildren = nextProps.children;
  const isDirectTextChild = shouldSetTextContent(type, nextProps);

  if (isDirectTextChild) {
    nextChildren = null;
  } else if (prevProps !== null && shouldSetTextContent(type, prevProps)) {
    workInProgress.effectTag |= ContentReset;
  }

  reconcileChildren(
    current,
    workInProgress,
    nextChildren,
    renderExpirationTime,
  );
  return workInProgress.child;
}

function updateHostText(current, workInProgress) {
  return null;
}
```

接下来就说到reconcileChildren这个方法，这个方法是大家都很熟悉的diff算法的实现，一起来看看他做了哪些事情

reconcileChildren其实就是调用了reconcileChildFibers，其中入参分别是
 - returnFiber： 当前全局的workInProgress节点
 - currentFirstChild： 创建阶段为null，更新节点是current的第一个Fiber子节点
 - newChild： render函数返回的React element对象
 - expirationTime： 渲染时间
```js
function reconcileChildFibers(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChild: any,
    expirationTime: ExpirationTime,
  ): Fiber | null {
    // 当前ReactElement对象是ReactFragment对象的话，直接把ReactFragment对象的child拿出来，这是因为ReactFragment没有意义只是一个组合代码的片段，也不需要渲染到页面上
    const isUnkeyedTopLevelFragment =
      typeof newChild === 'object' &&
      newChild !== null &&
      newChild.type === REACT_FRAGMENT_TYPE &&
      newChild.key === null;
    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children;
    }

    // newChild是对象，说明是单独一个组件或者DOM节点
    if (typeof newChild === 'object' && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(
            reconcileSingleElement(
              returnFiber,
              currentFirstChild,
              newChild,
              expirationTime,
            ),
          );
      }
    }

    // 说明是一个文本节点
    if (typeof newChild === 'string' || typeof newChild === 'number') {
      return placeSingleChild(
        reconcileSingleTextNode(
          returnFiber,
          currentFirstChild,
          '' + newChild,
          expirationTime,
        ),
      );
    }

    // 是ReactElement节点数组
    if (isArray(newChild)) {
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        expirationTime,
      );
    }
    return deleteRemainingChildren(returnFiber, currentFirstChild);
  }
```

上述代码首先判断newChild的类型，如果是React对象，(字符串，数字)或者数组都会有相应的处理

**deleteRemainingChildren**

先来看不属于上述任何一种情况的case,其中shouldTrackSideEffects为false表示创建阶段，为true表示更新阶段

```js
function deleteRemainingChildren(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
  ): null {
    // 创建阶段无动作
    if (!shouldTrackSideEffects) {
      // Noop.
      return null;
    }

    // 这里的case说的是开始有内容，更新后无内容的情况，所以需要把之前的Fiber节点都删除
    let childToDelete = currentFirstChild;
    while (childToDelete !== null) {
      // 通过循环不停的寻找sibling，直到最后一个，将每一个Fiber节点打上Deletion的Tag
      deleteChild(returnFiber, childToDelete);
      childToDelete = childToDelete.sibling;
    }
    return null;
  }

  function deleteChild(returnFiber: Fiber, childToDelete: Fiber): void {
    // 创建阶段无动作
    if (!shouldTrackSideEffects) {
      return;
    }
    // 把子节点挂载到父节点的Effect链表上，后续就不用再次遍历每一个节点来确定哪些节点有副作用了
    const last = returnFiber.lastEffect;
    if (last !== null) {
      last.nextEffect = childToDelete;
      returnFiber.lastEffect = childToDelete;
    } else {
      returnFiber.firstEffect = returnFiber.lastEffect = childToDelete;
    }
    
    // 打 Deletion Tag
    childToDelete.nextEffect = null;
    childToDelete.effectTag = Deletion;
  }
```

上述函数的工作内容把需要被删除的节点打上Deletion的Tag，并且串联起来放到父节点上
 
**reconcileSingleElement**

接着来看单个React对象节点的情况

```js
 function reconcileSingleElement(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    element: ReactElement,
    expirationTime: ExpirationTime,
  ): Fiber {
    // 根据key，和type进行对比，比对上就复用Fiber，因为新的节点只有一个，所以最后需要删除剩余的兄弟Fiber节点
    const key = element.key;
    let child = currentFirstChild;
    while (child !== null) {
      // 对比key
      if (child.key === key) {
        // 对比type
        if (child.elementType === element.type) {
          // 相同的话，就复用当前Fiber，删除后面的Fiber
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, element.props);
          existing.ref = coerceRef(returnFiber, child, element);
          existing.return = returnFiber;
          return existing;
        } else {
          // key相同但是type不同，无法复用，全部删除
          deleteRemainingChildren(returnFiber, child);
          break;
        }
      } else {
        // key都不同，可能是被位移了，删除当前的Fiber
        deleteChild(returnFiber, child);
      }
      // 继续往下找兄弟
      child = child.sibling;
    }

    // 无法复用Fiber，只能重新创建一个新的Fiber节点,但是Ref需要被转移到新的Fiber节点上
    const created = createFiberFromElement(
      element,
      returnFiber.mode,
      expirationTime,
    );
    created.ref = coerceRef(returnFiber, currentFirstChild, element);
    created.return = returnFiber;
    return created;
  }
```

根据key和type对比，选择复用还是新建Fiber，另外对多余的Fiber进行清理。

**reconcileSingleTextNode**

也和reconcileSingleElement逻辑类似，只不过只要对比Fiber是否是HostText类型即可复用

```js    
function reconcileSingleTextNode(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    textContent: string,
    expirationTime: ExpirationTime,
  ): Fiber {
    // 更新阶段查看之前的Fiber是否也是HostText类型，是的话就复用它，修改textContent即可
    if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
      const existing = useFiber(currentFirstChild, textContent);
      existing.return = returnFiber;
      return existing;
    }
    // 无法复用则删除所有的Fiber节点,重新创建一个新的Fiber
    deleteRemainingChildren(returnFiber, currentFirstChild);
    const created = createFiberFromText(
      textContent,
      returnFiber.mode,
      expirationTime,
    );
    created.return = returnFiber;
    return created;
  }
```

**reconcileChildrenArray**

终于来到这其中复杂的diff对比算法，先浏览代码流程

```js
 function reconcileChildrenArray(
    returnFiber: Fiber,
    currentFirstChild: Fiber | null,
    newChildren: Array<*>,
    expirationTime: ExpirationTime,
  ): Fiber | null {
    let resultingFirstChild: Fiber | null = null;
    let previousNewFiber: Fiber | null = null;

    let oldFiber = currentFirstChild;
    let lastPlacedIndex = 0;
    let newIdx = 0;
    let nextOldFiber = null;
    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber;
        oldFiber = null;
      } else {
        nextOldFiber = oldFiber.sibling;
      }
      // 如果type和key相同则复用Fiber，key不相同则返回null，key相同但是type不相同就创建一个新的Fiber
      const newFiber = updateSlot(
        returnFiber,
        oldFiber,
        newChildren[newIdx],
        expirationTime,
      );
      // 当oldFiber和newChildren[newIdx]的key不相同时，就跳出当前循环
      if (newFiber === null) {
        if (oldFiber === null) {
          oldFiber = nextOldFiber;
        }
        break;
      }
      // ...
      // 如果是新增或者是移动的节点，打上Placement的Tag
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      // 当前循环结束，往下走一位索引，进行下一个位置的对比
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }

    // 新的Element索引已经走完了，删除剩余老的Fiber节点，这种是删除的情况
    if (newIdx === newChildren.length) {
      // We've reached the end of the new children. We can delete the rest.
      deleteRemainingChildren(returnFiber, oldFiber);
      return resultingFirstChild;
    }

    // 新的Element索引没有走完，但是老的Fiber已经没有了，这种是新增的情况，
    // 就直接把剩余的新Element创建一遍即可
    if (oldFiber === null) {
      for (; newIdx < newChildren.length; newIdx++) {
        const newFiber = createChild(
          returnFiber,
          newChildren[newIdx],
          expirationTime,
        );
        // ...
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      return resultingFirstChild;
    }

    // 能走到这里说明，新的Element也还有，老的Fiber节点也还有，只是key无法比对上
    // 把老的Fiber用key创建一个Map
    const existingChildren = mapRemainingChildren(returnFiber, oldFiber);

    // 接下去按序遍历新Element节点，通过key去map中寻找是否有可以被复用的
    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = updateFromMap(
        existingChildren,
        returnFiber,
        newIdx,
        newChildren[newIdx],
        expirationTime,
      );
      if (newFiber !== null) {
        // 找到了能够复用的Fiber节点，就需要从map中剔除
        if (shouldTrackSideEffects) {
          if (newFiber.alternate !== null) {
            existingChildren.delete(
              newFiber.key === null ? newIdx : newFiber.key,
            );
          }
        }
        lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
        // ...
      }
    }

    // 新Element节点循环结束后，如果map中还有剩余的Fiber，这些Fiber会被打上删除的标记
    if (shouldTrackSideEffects) {
      existingChildren.forEach(child => deleteChild(returnFiber, child));
    }

    return resultingFirstChild;
  }
```
虽然其中有三个循环，但是每一个循环都是以newIdx为结束条件的，所以实际上只有O(n)的复杂度。

我们用一个例子来分析执行过程

```js
// key和内容一致，type都是div
A B C D
A E F D C
```

第一轮循环的时候type都是div，key都是A，所以会通过*updateSlot*直接复用老的Fiber节点
第二轮循环老的是key是B，新的key是E，newFiber被设置为null，接就跳出第一个循环。
但是也不符合下面两种情况，第一种是newIdx已经走完了，第二种是oldFiber已经为null。
所以最终会把老的Fiber节点放到map中，接下去依次遍历新的Element，看是否能够复用Fiber，当newIdx到最后的时候，流程结束。
另外每创建一个Fiber节点都会通过placeChild来往上打Placement Tag

至此beginWork的工作就结束了，接下去是往上遍历调用CompleteWork

## completeWork

当我们进入到completeUnitOfWork，意味着我们已经到达了树的最底部，接下来就要依次往上进行遍历，对没有进行过beginWork处理的节点调用BeginWork和completeWork，对于已经进行过调用的节点直接调用completeWork即可。
往上遍历的规则是
 1. 如果有兄弟节点，优先对兄弟节点进行beginWork，在兄弟节点有child的情况下，会继续对兄弟的child节点进行深度优先的遍历，等child都遍历结束完，再对兄弟节点进行completeWork
 2. 没有兄弟节点，则对父节点进行completeWork的调用

在completeUnitOfWork首先会判断当前节点在beginWork阶段是否有异常抛出，如果没有的话则调用completeWork函数，使用渲染器来实例化DOM和事件绑定等一系列操作，最后返回next，正常情况下next都是null，所以一般不需要重新回到performUnitOfWork阶段。
接着调用一个比较重要的函数resetChildExpirationTime，会把所以子节点中最早更新时间赋值给父节点，在父节点是否决定可以跳过整颗字数的更新起到决定的作用，然后把子节点的effect链到父节点上，最终就可以在HostRootFiber通过effect链表获取所有有副作用的节点了。
处理完当前节点，就按照先slibing，在return的规则依次遍历。

```js
function completeUnitOfWork(unitOfWork: Fiber): void {
  let completedWork = unitOfWork;
  do {
    const current = completedWork.alternate;
    const returnFiber = completedWork.return;

    // 当前节点render正常结束，没有抛出异常
    if ((completedWork.effectTag & Incomplete) === NoEffect) {
      // 对DOMFiber节点进行DOM创建和关联，事件绑定
      let next = completeWork(current, completedWork, renderExpirationTime);

      if (next !== null) {
        // completeWork过程产生了新的Fiber节点, 退出循环, 回到performUnitOfWork阶段
        workInProgress = next;
        return;
      }

      // 这里会把子节点的最早更新时间赋值给父节点的childExpirationTime上，在父节点是否要跳过更新中有决定性的作用
      resetChildExpirationTime(completedWork);

      if (
        returnFiber !== null &&
        (returnFiber.effectTag & Incomplete) === NoEffect
      ) {
        // 1. 收集当前Fiber节点和它的后代节点的effect, 挂载到父节点上
        /**
         * 如果当前节点有副作用，
         *  那么把这个节点的副作用挂载在父节点的effect链表的结尾。
         * 这样在commit阶段就不需要遍历每一个fiber节点了，查看哪些fiber节点有副作用
         * 只需要通过rootfiber节点的firstEffect依次执行对应副作用就行
         */
        if (returnFiber.firstEffect === null) {
          returnFiber.firstEffect = completedWork.firstEffect;
        }
        if (completedWork.lastEffect !== null) {
          if (returnFiber.lastEffect !== null) {
            returnFiber.lastEffect.nextEffect = completedWork.firstEffect;
          }
          returnFiber.lastEffect = completedWork.lastEffect;
        }
        // ... React DevTool use
      }
    } else {
      // error render...
    }

    // 接下去就是先查看兄弟节点，如果有那么这个兄弟节点肯定没有被beginWork处理过,需要先对这个节点调用beginWork
    const siblingFiber = completedWork.sibling;
    if (siblingFiber !== null) {
      workInProgress = siblingFiber;
      return;
    }
    // 另外如果没有兄弟节点，那么当前已经是最后一个子节点了，直接往上寻找父节点，接着对父节点进行completeWork的处理
    completedWork = returnFiber;
    workInProgress = completedWork;
  } while (completedWork !== null);


  // 最终到达HostRootfiber节点，所有的子节点都经过beginWork和completeWork的处理，已经生成出一颗离屏DOM树，
  // 另外有副作用的节点也已经在HostRootfiber.firstEffect链表上, 等待后续调用
  if (workInProgressRootExitStatus === RootIncomplete) {
    workInProgressRootExitStatus = RootCompleted;
  }
}
```

completeUnitOfWork主要用于节点遍历规则的调度，而真实的节点处理逻辑就是在completeWork中
从前文知道completeWork主要是对DOM和Text组件进行实例化，属性diff，添加effect Tag，事件绑定等操作。

```js

case HostComponent: {
  // #app
  const rootContainerInstance = getRootHostContainer();
  const type = workInProgress.type;
  if (current !== null && workInProgress.stateNode != null) {
    // 更新DOM, 不做实际更新，只是diff出不同的props数组，结构为奇数位表示key，偶数位表示value，挂载到workInProgress.updateQueue上，并且给
    // workInProgress的effectTag加一个Update的tag，用于commit阶段来更新到实际DOM上
    updateHostComponent(
      current,
      workInProgress,
      type,
      newProps,
      rootContainerInstance,
    );

    if (current.ref !== workInProgress.ref) {
      markRef(workInProgress);
    }
  } else {
    // create ...
  }
  return null;
}

```

对于更新阶段的Fiber节点来看只需要进行props的Diff，通过prepareUpdate对新老的props diff出来差异，并且把差异作为updateQueue
赋值给当前的DOM节点，加上Update Tag，在后续commit中实际修改到页面上，

updateQueue的数据结构是一个数组，奇数位为key，偶数位是value。

```js
function updateHostComponent(
  current: Fiber,
  workInProgress: Fiber,
  type: Type,
  newProps: Props,
  rootContainerInstance: Container,
) {
  const oldProps = current.memoizedProps;
  if (oldProps === newProps) {
    return;
  }

  const instance: Instance = workInProgress.stateNode;
  /**
   * updatePayload
   * [
   *  'style', { color: 'red'， width: '1px' },
   *  'value', 'newVal'
   * ]
   */
  const updatePayload = prepareUpdate(
    instance,
    type,
    oldProps,
    newProps,
    rootContainerInstance,
  );
  workInProgress.updateQueue = updatePayload;
  if (updatePayload) {
    markUpdate(workInProgress);
  }
};
```

另外还有创建阶段，在这个阶段做的事情会比较多，首先需要通过createElement创建实际的DOM实例, 
然后去把子节点的DOM实例append到新创建的DOM实例上，最后一起批量插入到页面上，能够优化性能

```js
case HostComponent: {
  // #app
  const rootContainerInstance = getRootHostContainer();
  const type = workInProgress.type;
  if (current !== null && workInProgress.stateNode != null) {
    // update ...
  } else {
    const currentHostContext = getHostContext();
    // 创建阶段，创建出DOM的实例，但是并不实际挂载DOM的属性，而是通过internalInstanceKey和internalPropsKey分别把fiber实例和props对象挂载到DOM上
    const instance = createInstance(
      type,
      newProps,
      rootContainerInstance,
      currentHostContext,
      workInProgress,
    );
    
    // 把子DOM节点，都append到instance上，在内存中组装DOM树，能够一次性插入到页面中，优化性能。
    appendAllChildren(instance, workInProgress, false, false);

    workInProgress.stateNode = instance;

    if (
      finalizeInitialChildren(
        instance,
        type,
        newProps,
        rootContainerInstance,
        currentHostContext,
      )
    ) {
      // 只有button，input，select，textarea并且authFocus属性为True的时候增加Update Tag
      markUpdate(workInProgress);
    }

    // 是否增加Ref tag
    if (workInProgress.ref !== null) {
      markRef(workInProgress);
    }
  }
  return null;
}

export function createInstance(
  type: string,
  props: Props,
  rootContainerInstance: Container,
  hostContext: HostContext,
  internalInstanceHandle: Object,
): Instance {
  const domElement: Instance = createElement(
    type,
    props,
    rootContainerInstance,
    hostContext,
  );
  domElement[internalInstanceKey] = internalInstanceHandle;
  domElement[internalPropsKey] = props;
  return domElement;
}
```

这里也是React中经常出现的深度优先遍历算法，但是区别的话只会往下找一层DOM节点或者null即返回。
  先寻找child，如果child不是DOM，那么继续往下，直到找到DOM节点或者null，
  接着查看是否有sibling，没有的话则结束
  找到sibling，再按照深度优先把sibling子树中的第一层的DOM节点挂到父节点上
  另外在sibling回溯return时候需要继续查看是否有另外的sibling，也就是sibling.sibling，直到找到null停止

```js
function appendAllChildren(
    parent: Instance,
    workInProgress: Fiber,
    needsVisibilityToggle: boolean,
    isHidden: boolean,
  ) {
    let node = workInProgress.child;
    while (node !== null) {
      // 是普通的DOM节点，可以把这个DOM节点append到当前的DOM节点上，组成一颗离屏DOM树
      if (node.tag === HostComponent || node.tag === HostText) {
        appendInitialChild(parent, node.stateNode);
      } else if (node.child !== null) {
        // 这种情况下代表子节点不是DOM节点，例如Class节点，那么继续往下寻找可以使用的DOM节点
        node.child.return = node;
        node = node.child;
        continue;
      }
      if (node === workInProgress) {
        return;
      }
      // 没有子节点，也没有兄弟节点，说明它已经是最后一个节点了，往上找父节点即可
      while (node.sibling === null) {
        if (node.return === null || node.return === workInProgress) {
          return;
        }
        node = node.return;
      }
      // 兄弟节点指向同一个父节点
      node.sibling.return = node.return;
      // 有兄弟节点则循环到兄弟节点上
      node = node.sibling;
    }
  };
```

后面就是通过finalizeInitialChildren来给dom实例添加属性，事件的绑定，这里可能会有一个疑问，
为什么在Update阶段不能直接把属性更新到dom上，这是因为更新阶段部分可以复用DOM都已经在页面上，对DOM的修改会实时反映，但是由于可中断的特性，有可能修改会被撤销或者覆盖，但是创建阶段DOM都在内存中，无论你对它做什么都不会显示在页面上，所以
这里可以直接设置属性，另外事件的话React会把事件绑定在应用的根元素上，并且对于已经绑定过的事件不会重复绑定，所以更新阶段只需要把新的事件绑定到根元素上即可，最后根据设置了Ref来决定是否要加Ref Tag

相对于DOM节点，Text节点就简单很多，创建只需要创建一个新的文本节点即可，更新的话只需要对比一下内容来决定是否要增加Update Tag

```js
case HostText: {
  const newText = newProps;
  if (current && workInProgress.stateNode != null) {
    const oldText = current.memoizedProps;
    // 新老文本不一样给 workInProgress.effectTag 加一个Update tag
    updateHostText(current, workInProgress, oldText, newText);
  } else {
    const rootContainerInstance = getRootHostContainer();
    const currentHostContext = getHostContext();
    // 新老文本不一样给 workInProgress.effectTag 加一个Update tag
    workInProgress.stateNode = createTextInstance(
      newText,
      rootContainerInstance,
      currentHostContext,
      workInProgress,
    );
  }
  return null;
}

function updateHostText(
  current: Fiber,
  workInProgress: Fiber,
  oldText: string,
  newText: string,
) {
  if (oldText !== newText) {
    markUpdate(workInProgress);
  }
};

```

## 总结

我们分析了调和阶段的两大块主要的逻辑，它也是React能够跨平台的底层保障，是如何从React Element对象转换为Fiber对象，又是如何从Fiber转到宿主对象，其中包括beginWork和completeWork，对常用的节点类型的创建以及更新做了分析，从一个组件的创建会调用哪些生命周期，并且为什么要废弃一些生命周期，以及如何来跳过组件的更新，能够减少无意义的渲染，还知道了React是如何把两个树的对比复杂度控制在O(n)的等等，了解了背后的运行机制，当我们使用React编写业务的时候才能够更好的驾驭它，其中还有很多重要的知识，例如UpdateQueue的处理，ExpirationTime的创建等， 另外Lazy，mome，forwordRef，Portal等等组件的逻辑我们并没有涉及到，希望感兴趣同学能够顺着这篇文章的思路自行进行探索。

