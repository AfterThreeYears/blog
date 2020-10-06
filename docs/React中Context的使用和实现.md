# React中Context的使用和实现

> *以下分析基于React, ReactDOM 16.13.1版本*

## Context的用处和用法

在React中有多种创建组件的方式，Class组件，函数组件和render Props来创建组件，Context也是一样有多种使用方式

### Class组件中使用contextType

```js
class D extends React.PureComponent {
  static contextType = UserContext;
  render() {
    return this.context.username;
  }
}
```

### Class组件中使用renderProps

```js
class C extends React.PureComponent {
  render() {
    return <div>
      <UserContext.Consumer>
        {ctx => ctx!.username}
      </UserContext.Consumer>
    </div>
  }
}
```

### 函数组件中使用useContext

```js
function E() {
  const userCtx = React.useContext(UserContext);
  return <div>
    {userCtx!.username}
  </div>;
}
```

以上三种方式都是能够直接获取到provider组件提供的值，并且能够根据provider组件上的值变化而进行数据的更新，所以我们在使用它们之前还需要创建provider组件，方式如下

```js
const UserContext = React.createContext<{ username: string } | null>(null);
class App extends React.PureComponent {
  state = {
    username: 'shell',
  }
  render() {
    return <UserContext.Provider value={{ username: this.state.username }}>
      <input value={this.state.username} onChange={e => this.setState({ username: e.target.value })} />
      <C />
      <D />
      <E />
    </UserContext.Provider>
  }
}
```

以上代码的运行效果如下

<img src="../image/context-demo" />

那么让我们来探究一下React内部是如何创建Context，并且让它能够工作的。

## 创建Context的方式

```js
const UserContext = React.createContext<{ username: string } | null>(null);
```

React提供createContext api来让我们创建context, 主要逻辑如下

```js
export function createContext<T>(
  defaultValue: T
): ReactContext<T> {

  const context: ReactContext<T> = {
    // 给Consumer打标
    $$typeof: REACT_CONTEXT_TYPE,
    _calculateChangedBits: calculateChangedBits,
    // Provider上的赋的值就是currentValue;
    _currentValue: defaultValue,
    Provider: (null: any),
    Consumer: (null: any),
  };

  context.Provider = {
    // 给Provider打标
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };

  // 需要注意的是这里，Consume其实就是context本身
  context.Consumer = context;

  return context;
}
```

这里逻辑不难理解，要是有了解过React，就会知道React其实很多方法并不直接执行逻辑，而只是打上一个标记，在reconciler阶段里才去根据标记执行不同的逻辑，这里返回一个对象，上面有Provider和Consumer两个属性，并且Conusmer还指向自身。

### ReactFiberStack

```js
const valueStack: Array<any> = [];
let index = -1;
function createCursor<T>(defaultValue: T): StackCursor<T> {
  return {
    current: defaultValue,
  };
}

function isEmpty(): boolean {
  return index === -1;
}

function pop<T>(cursor: StackCursor<T>, fiber: Fiber): void {
  if (index < 0) {
    return;
  }
  cursor.current = valueStack[index];
  valueStack[index] = null;
  index--;
}

function push<T>(cursor: StackCursor<T>, value: T, fiber: Fiber): void {
  index++;
  valueStack[index] = cursor.current;
  cursor.current = value;
}
```

在React中，定义了一个Stack，用来保存遍历Fiber时候的上下文，在beginWork往栈里推入多种类型的数据，在completeWork时候弹出数据，这是保证Context工作的基本条件。


## Context调用

### 初始化

每一个fiber节点的创建，都会经过beginWork，那么在beginWork会根据fiber的类型，进行不同的处理

```js
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
) {
    switch(workInPorgress.tag) {
        case ClassComponent:
            return updateClassComponent(
                current,
                workInProgress,
                Component,
                resolvedProps,
                renderExpirationTime,
            );
        case ContextProvider:
            return updateContextProvider(
                current,
                workInProgress,
                renderExpirationTime,
            );
        case ContextConsumer:
            return updateContextConsumer(
                current,
                workInProgress,
                renderExpirationTime,
            );
    }
}
```

#### 初始化Provider

```js
function updateContextProvider(current, workInProgress, renderExpirationTime) {
  var newProps = workInProgress.pendingProps;
  var newValue = newProps.value;
  pushProvider(workInProgress, newValue);
}
```

在初始化Provider中，只会把provider上新的value推入前文说的栈中。

#### 初始化Class组件

```js
function updateClassComponent(
  current: Fiber | null,
  workInProgress: Fiber,
  Component: any,
  nextProps,
  renderExpirationTime: ExpirationTime,
) {

  let hasContext = false;
  prepareToReadContext(workInProgress, renderExpirationTime);
  const instance = workInProgress.stateNode;
  let shouldUpdate;
  if (instance === null) {
    // ...
    constructClassInstance(workInProgress, Component, nextProps);
    mountClassInstance(
      workInProgress,
      Component,
      nextProps,
      renderExpirationTime,
    );
    shouldUpdate = true;
  } else if (current === null) {
    // ...
  } else {
    // ...
  }
  // ...
  return nextUnitOfWork;
}

function constructClassInstance(
  workInProgress: Fiber,
  ctor: any,
  props: any,
): any {
  let context = emptyContextObject;
  const contextType = ctor.contextType;

  if (typeof contextType === 'object' && contextType !== null) {
    context = readContext((contextType: any));
  } else if (!disableLegacyContext) {
    // ...
  }
  const instance = new ctor(props, context);
  // ...
  return instance;
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
  if (typeof contextType === 'object' && contextType !== null) {
    instance.context = readContext(contextType);
  } else if (disableLegacyContext) {
    // ...
  } else {
    // ...
  }
}

```


```js
export function prepareToReadContext(
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
): void {
  // 当前的fiber节点
  currentlyRenderingFiber = workInProgress;
  lastContextDependency = null;
  lastContextWithAllBitsObserved = null;

  const dependencies = workInProgress.dependencies_old;
  if (dependencies !== null) {
    const firstContext = dependencies.firstContext;
    if (firstContext !== null) {
      if (dependencies.expirationTime >= renderExpirationTime) {
        // Context list has a pending update. Mark that this fiber performed work.
        markWorkInProgressReceivedUpdate();
      }
      // Reset the work-in-progress list
      dependencies.firstContext = null;
    }
  }
}


export function readContext<T>(
  context: ReactContext<T>,
): T {
  if (lastContextWithAllBitsObserved === context) {
    // ...
  } else if (observedBits === false || observedBits === 0) {
    // ...
  } else {
    const contextItem = {
      context: ((context: any): ReactContext<mixed>),
      observedBits: undefined,
      next: null,
    };

    if (lastContextDependency === null) {
      lastContextDependency = contextItem;
      currentlyRenderingFiber.dependencies_old = {
        expirationTime: NoWork,
        firstContext: contextItem,
        responders: null,
      };
    } else {
      lastContextDependency = lastContextDependency.next = contextItem;
    }
  }
  return context._currentValue;
}
```

首先会调用`prepareToReadContext`，这个方法只是初始化一些全局变量，做一些准备工作，接下去在constructClassInstance中会实例化组件，并且把context当做第二个参数传入 **new ctor(props, context);**, 接着在mountClassInstance把contextType挂在的组件的实例上，这样通过this.context就能访问到对应的数据了, 这里还有一个关键的方法`readContext`, 都是通过它来读取当前组件对应的context的，readContext中除了会返回context对象上的_currentValue属性以外，还有一个重要的作用是会给currentlyRenderingFiber上dependencies_old的属性赋值，这点很重要，直接说明了这个fiber节点是依赖哪个context，后续的更新需要通过它来寻找。
函数组件和Class组件唯一的区别是它只会调用prepareToReadContext，而不会去读取readContext，这是因为函数组件是可以使用useContext hook来操作context，在使用useContext的时候才会去调用readContext函数，或者说`useContext === readContext`;

#### 初始化Consumer组件
```js
function updateContextConsumer(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
) {
  let context: ReactContext<any> = workInProgress.type;
  context = (context: any)._context;
  const newProps = workInProgress.pendingProps;
  const render = newProps.children;

  prepareToReadContext(workInProgress, renderExpirationTime);
  const newValue = readContext(context, newProps.unstable_observedBits);
  let newChildren = render(newValue);

  // ...
  return workInProgress.child;
}
```
Consume组件更加简单，由于本身就是context，那么直接获取到_context属性，然后通过prepareToReadContext和readContext的组合，进行依赖收集和获取到value，直接调用children函数即可。


### 更新

接着来了解Context是如何进行更新之后，能够让依赖的组件进行更新

```js
function updateContextProvider(
  current: Fiber | null,
  workInProgress: Fiber,
  renderExpirationTime: ExpirationTime,
) {
  // ...
  if (oldProps !== null) {
    const oldValue = oldProps.value;
    const changedBits = calculateChangedBits(context, newValue, oldValue);
    if (changedBits === 0) {
      if (
        oldProps.children === newProps.children &&
        !hasLegacyContextChanged()
      ) {
        return bailoutOnAlreadyFinishedWork(
          current,
          workInProgress,
          renderExpirationTime,
        );
      }
    } else {
      propagateContextChange(
        workInProgress,
        context,
        changedBits,
        renderExpirationTime,
      );
    }
  }
  // ...
```

```js
export function propagateContextChange(
  workInProgress: Fiber,
  context: ReactContext<mixed>,
  changedBits: number,
  renderExpirationTime: ExpirationTime,
): void {
  let fiber = workInProgress.child;
  if (fiber !== null) {
    fiber.return = workInProgress;
  }
  while (fiber !== null) {
    let nextFiber;

    // Visit this fiber.
    const list = fiber.dependencies_old;
    if (list !== null) {
      nextFiber = fiber.child;

      let dependency = list.firstContext;
      while (dependency !== null) {
        // Check if the context matches.
        if (
          dependency.context === context &&
          (dependency.observedBits & changedBits) !== 0
        ) {
          if (fiber.tag === ClassComponent) {
            const update = createUpdate(renderExpirationTime, null);
            update.tag = ForceUpdate;
            enqueueUpdate(fiber, update);
          }

          if (fiber.expirationTime < renderExpirationTime) {
            fiber.expirationTime = renderExpirationTime;
          }
          scheduleWorkOnParentPath(fiber.return, renderExpirationTime);
          if (list.expirationTime < renderExpirationTime) {
            list.expirationTime = renderExpirationTime;
          }
          break;
        }
        dependency = dependency.next;
      }
    }
}
```

在`updateContextProvider`中有一部分是用于更新的逻辑,如果oldProps不为空，那么当次是在更新阶段，会通过Object.is函数进行新老value的对比，如果对比一样则调用`bailoutOnAlreadyFinishedWork`看是否能够跳过子节点的更新。否则就调用`propagateContextChange`来寻找到哪些节需要更新，`propagateContextChange`函数相对复杂，我们在之前通过readContext会在fiber节点上挂载dependencies_old属性，然后通过dependencies_old上context和当前的context进行对比，匹配上如果是class组件，会创建一个强制更新`ForceUpdate`，函数组件和renderProps则通过修改`expirationTime`属性来触发更新，然后继续往父节点上寻找需要更新的fiber节点。

## 被废弃的Context api

此前版本还有通过contextTypes属性来进行context的使用，但是由于它会合并同名的context并且无法进行性能优化在后面版本被废弃，则不进行深入研究

## 结束语

Context在我们的开发中随处可见，希望通过这篇文章能让你对Context有更深一步的了解。

// 