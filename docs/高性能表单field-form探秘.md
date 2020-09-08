- 有哪几大模块，分别承担了哪些职责。
useForm
  实例化FormStroe，提供一系列取数，校验，状态控制等方法。

Form
  负责初始化FormStore，并且通过FieldContext提供FormStore给Field使用。

FormContext
  TODO

Field
  通过getControlled重写子组件的props，在组件初始化的时候通过name把组件实例注册到FormStore上，在用户手动修改数据的时候同步修改FormStroe内的表单数据

FieldContext
  FormStroe实例的生产者

- initialValues是怎么工作的，为什么后续修改不会生效？

  ```js
    const mountRef = React.useRef(null);
    setInitialValues(initialValues, !mountRef.current);
    if (!mountRef.current) {
      mountRef.current = true;
    }

    private setInitialValues = (initialValues: Store, init: boolean) => {
      this.initialValues = initialValues || {};
      if (init) {
        this.store = setValues({}, initialValues, this.store);
      }
    };
  ```

  通过mountRef.current标志位控制只有第一次渲染的时候才会进行赋值，后续改动不赋值，把initialValues赋值给this.store,接下来在Form渲染流程走完后，进行Field的渲染，其中getControlled函数内部调用this.getValue()函数通过name属性的值来从store中获取对应的值

- Form和Field是什么关系？
Form提供了FieldContext.Provider提供给Field使用

- useForm提供了什么功能？
useForm使用了单例模式，在一个生命周期内只提供一个formStore来储存表单的数据，状态，提供了以下API供使用这个以编程方式来使用form的功能
```js
export interface FormInstance {
  // Origin Form API
  getFieldValue: (name: NamePath) => StoreValue;
  getFieldsValue: (nameList?: NamePath[] | true, filterFunc?: (meta: Meta) => boolean) => Store;
  getFieldError: (name: NamePath) => string[];
  getFieldsError: (nameList?: NamePath[]) => FieldError[];
  isFieldsTouched(nameList?: NamePath[], allFieldsTouched?: boolean): boolean;
  isFieldsTouched(allFieldsTouched?: boolean): boolean;
  isFieldTouched: (name: NamePath) => boolean;
  isFieldValidating: (name: NamePath) => boolean;
  isFieldsValidating: (nameList: NamePath[]) => boolean;
  resetFields: (fields?: NamePath[]) => void;
  setFields: (fields: FieldData[]) => void;
  setFieldsValue: (value: Store) => void;
  validateFields: ValidateFields;

  // New API
  submit: () => void;
}
```

- 表单数据是保存在哪里,如何进行修改？
两个修改方式，一种是通过操作表单元素修改，另外一种以编程的方式修改数据

操作表单元素修改`internal`

```js
// Field.tsx
const originTriggerFunc: any = childProps[trigger];
control[trigger] = (...args: EventArgs) => {
  this.touched = true;
  this.dirty = true;

  dispatch({
    type: 'updateValue',
    namePath,
    value: defaultGetValueFromEvent(valuePropName, ...args),
  });

  if (originTriggerFunc) {
    originTriggerFunc(...args);
  }
};
```

```js
// FormStore.ts
private dispatch = (action: ReducerAction) => {
  switch (action.type) {
    case 'updateValue': {
      const { namePath, value } = action;
      this.updateValue(namePath, value);
      break;
    }
    case 'validateField': {
      // some other code
    }
    default:
    // Currently we don't have other action. Do nothing.
  }
};

private updateValue = (name: NamePath, value: StoreValue) => {
  // 1.
  const namePath = getNamePath(name);
  const prevStore = this.store;
  this.store = setValue(this.store, namePath, value);

  this.notifyObservers(prevStore, [namePath], {
    type: 'valueUpdate',
    source: 'internal',
  });

  // 2. Notify dependencies children with parent update

  // 3. trigger callback function onValuesChange and OnFieldsChange
};

private notifyObservers = (
  prevStore: Store,
  namePathList: InternalNamePath[] | null,
  info: NotifyInfo,
) => {
  if (this.subscribable) {
    this.getFieldEntities().forEach(({ onStoreChange }) => {
      onStoreChange(prevStore, namePathList, info);
    });
  }
};
```

```js
// Field.tsx
 public onStoreChange: FieldEntity['onStoreChange'] = (prevStore, namePathList, info) => {
   const namePath = this.getNamePath();
  // 当前表单路径是否存在于需要更新的表单中
  const namePathMatch = namePathList && containsNamePath(namePathList, namePath);
  if (namePathMatch) {
    this.forceUpdate();
    return;
  }
};
```

编程的方式修改数据`external`

```js
private setFieldsValue = (store: Store) => {
  const prevStore = this.store;

  if (store) {
    this.store = setValues(this.store, store);
  }

  this.notifyObservers(prevStore, null, {
    type: 'valueUpdate',
    source: 'external',
  });
};

private notifyObservers = (
  prevStore: Store,
  namePathList: InternalNamePath[] | null,
  info: NotifyInfo,
) => {
  if (this.subscribable) {
    this.getFieldEntities().forEach(({ onStoreChange }) => {
      onStoreChange(prevStore, namePathList, info);
    });
  }
};
```

```js
// Field.tsx
  public onStoreChange: FieldEntity['onStoreChange'] = (prevStore, namePathList, info) => {
    const { shouldUpdate, dependencies = [], onReset } = this.props;
    const { getFieldsValue }: FormInstance = this.context;
    // 所有的表单数据
    const values = getFieldsValue(true);
    const namePath = this.getNamePath();
    // 上一个值
    const prevValue = this.getValue(prevStore);
    // 当前的值
    const curValue = this.getValue();
    if (
      requireUpdate(shouldUpdate, prevStore, values, prevValue, curValue, info)
    ) {
      this.reRender();
      return;
    }
  };
```

- 为什么能做到增量更新, 有没有办法做全量更新？

  由于每次表单数据改变通过Field#onStoreChange方法来进行操作，该函数内都会对比新老数据是否被改变，从而来控制是否需要focreUpdate Field组件来做到控制局部更新，当然如果是需要回归到v3那种全局更新的话有两种方式，第一种是官方文档中描写的给Field组件添加shouldUpdate属性，另外一种在官方文档中未提及，通过给Form组件传递renderPropsChildren来使其关闭订阅功能，从而任意一个表单数据变化，都会全量渲染Form组件，最终使得Field组件全量更新。
  
  ```js
  // Form.tsx
  const childrenRenderProps = typeof children === 'function';

  // Not use subscribe when using render props
  useSubscribe(!childrenRenderProps);
  ```

  ```js
  // useForm.ts
  private notifyObservers = (
    prevStore: Store,
    namePathList: InternalNamePath[] | null,
    info: NotifyInfo,
  ) => {
    if (this.subscribable) {
      this.getFieldEntities().forEach(({ onStoreChange }) => {
        onStoreChange(prevStore, namePathList, info);
      });
    } else {
      this.forceRootUpdate();
    }
  };
  ```

- 数据校验怎么工作？
Field重做子表单元素的props，会对事件进行包裹，在触发源事件之前会去首先做校验工作,校验失败的内容会推入Field组件实例的errors属性上，在渲染函数子组件的之前会把meta属性做相关的处理传递给renderPropsChildren做相关处理。

- 创建阶段做了怎么事情？

- 更新阶段做了怎么事情？

- 销毁阶段做了怎么事情？

- 用了哪些设计模式？
观察者模式，FormStore通过接受每一个Field组件的实例，然后在需要更新数据的时候去notify每一个Field组件，使其自行进行组件渲染。
