## 当前版本 rc-field-form@1.4.0

从一个最基本的例子来看
```js
export default function App() {
  const [form] = Form.useForm();
  return (
    <Form
      form={form}
      initialValues={{ username: 'shell' }}
      onFinish={data => {
        console.log('call onFinish ', data);
      }}
    >
      <Form.Field
          name="username"
          rules={[{ required: true }]}
        >
          {(control, meta) => (
            <>
              <input {...control} placeholder="username" />
              {meta.errors.toString()}
            </>
          )}
        </Form.Field>
      <button type="submit">submie</button>
    </Form>
  );
}
```

首先来看useForm返回什么

```js
function useForm(form?: FormInstance): [FormInstance] {
  const formRef = React.useRef<FormInstance>();
  const [, forceUpdate] = React.useState();

  if (!formRef.current) {
    if (form) {
      formRef.current = form;
    } else {
      // Create a new FormStore if not provided
      const forceReRender = () => {
        forceUpdate({});
      };

      const formStore: FormStore = new FormStore(forceReRender);

      formRef.current = formStore.getForm();
    }
  }

  return [formRef.current];
}
```

实际上就是初始化了`FormStore`并且返回`form`实例，并且创建了一个强制更新的方法, 然后先把form放到一遍，先来看Form组件的逻辑


```js
const Form = (// 忽略props ref) => {

  // 创建provider和consume后面使用
  const formContext: FormContextProps = React.useContext(FormContext);

  // 获取formStor的实例和当前实例上的钩子函数
  const [formInstance] = useForm(form);
  const {
    useSubscribe,
    setInitialValues,
    setCallbacks,
    setValidateMessages,
  } = (formInstance as InternalFormInstance).getInternalHooks(HOOK_MARK);

  // 一个form context里面可以注册多个表单，在拆分表单的时候比较有用，通过设置表单的名称来区分form实例
  React.useEffect(() => {
    formContext.registerForm(name, formInstance);
  }, []);

  // 用户传入的回调和默认的回调函数合并赋值给form实例，主要是用于调用context上的回调来通知注册的多个表单
  setCallbacks({
    onValuesChange,
    onFieldsChange: (changedFields: FieldData[], ...rest) => {
      formContext.triggerFormChange(name, changedFields);

      if (onFieldsChange) {
        onFieldsChange(changedFields, ...rest);
      }
    },
    onFinish: (values: Store) => {
      formContext.triggerFormFinish(name, values);

      if (onFinish) {
        onFinish(values);
      }
    },
    onFinishFailed,
  });

  /**
   * 在antd3中的form，如果initialValues一直为undefined，那么重新赋值是会更新到form内，
   * 这里通过mountRef.current来作为一个标志位，初始化后就无法对initialValues重新赋值
   * https://github.com/react-component/field-form/tree/98a1235a0764fdd7cb009bb9e4c1cdbc03b3d835#-field-will-not-keep-snyc-with-initialvalues-when-un-touched
   */  
  const mountRef = React.useRef(null);
  setInitialValues(initialValues, !mountRef.current);
  if (!mountRef.current) {
    mountRef.current = true;
  }


  const wrapperNode = (
    <FieldContext.Provider value={formInstance}>{children}</FieldContext.Provider>
  );

  // 如果传入的不是dom标签字符串，而是false，那么就可以作为一个表单内的表单来做拆分
  if (Component === false) {
    return wrapperNode;
  }

  return (
    <Component
      {...restProps}
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.stopPropagation();

        formInstance.submit();
      }}
    >
      {wrapperNode}
    </Component>
  );
};
```

看完Form组件的逻辑，接下去看看`Form.Field`组件做了什么事，猜测是通过Consumer拿到了form的实例来操作，Form.Field有一句注释
`We use Class instead of Hooks here since it will cost much code by using Hooks.`, 其实在有了hook以后也不是一定需要去写
函数组件，而是根据实际情况来用class组件还是函数组件。

Field组件外面还有一个WrapperField用来序列化name，例如把'a.b' 转换成 ['a', 'b']传入

由于Field的代码比较多，我们先只看初始化时候的逻辑

首先在DidMount时候把组件实例注册到formStore上，并且在注册的时候如果传入了initialValue，formStore会根据Field 的name属性来调用Field的更新函数，这块通知更新的逻辑在后面讲到formStore的时候会讲到，

接下去看render就直接判断一下是否是函数还是组件，处理完生成新的children返回

```js
class Field extends React.Component {
  public static contextType = FieldContext;

  public static defaultProps = {
    trigger: 'onChange',
    valuePropName: 'value',
  };

  context: InternalFormInstance;

  public state = {
    resetCount: 0,
  };

  private cancelRegisterFunc: () => void | null = null;

  private destroy = false;

  private touched: boolean = false;

  private dirty: boolean = false;

  private validatePromise: Promise<string[]> | null = null;

  private prevValidating: boolean;

  private errors: string[] = [];

  // ============================== Subscriptions ==============================
  public componentDidMount() {
    const { getInternalHooks } = this.context;
    const { registerField } = getInternalHooks(HOOK_MARK);
  }

  // ================================== Utils ==================================
  public getNamePath = (): InternalNamePath => {
    const { name } = this.props;
    const { prefixName = [] }: InternalFormInstance = this.context;

    return name !== undefined ? [...prefixName, ...name] : [];
  };

  public getRules = (): RuleObject[] => {
    const { rules = [] } = this.props;

    return rules.map(
      (rule: Rule): RuleObject => {
        if (typeof rule === 'function') {
          return rule(this.context);
        }
        return rule;
      },
    );
  };

  // public reRender() {
  //   if (this.destroy) return;
  //   this.forceUpdate();
  // }

  // public refresh = () => {
  //   if (this.destroy) return;

  //   /**
  //    * Clean up current node.
  //    */
  //   this.setState(({ resetCount }) => ({
  //     resetCount: resetCount + 1,
  //   }));
  // };

  // ========================= Field Entity Interfaces =========================
  // Trigger by store update. Check if need update the component
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

    // 当前表单路径是否存在于需要更新的表单中
    const namePathMatch = namePathList && containsNamePath(namePathList, namePath);

    // `setFieldsValue` is a quick access to update related status
    if (info.type === 'valueUpdate' && info.source === 'external' && prevValue !== curValue) {
      this.touched = true;
      this.dirty = true;
      this.validatePromise = null;
      this.errors = [];
    }

    switch (info.type) {
      case 'reset':
        if (!namePathList || namePathMatch) {
          // Clean up state
          this.touched = false;
          this.dirty = false;
          this.validatePromise = null;
          this.errors = [];

          if (onReset) {
            onReset();
          }

          this.refresh();
          return;
        }
        break;

      case 'setField': {
        if (namePathMatch) {
          const { data } = info;
          if ('touched' in data) {
            this.touched = data.touched;
          }
          if ('validating' in data && !('originRCField' in data)) {
            this.validatePromise = data.validating ? Promise.resolve([]) : null;
          }
          if ('errors' in data) {
            this.errors = data.errors || [];
          }
          this.dirty = true;

          this.reRender();
          return;
        }

        // Handle update by `setField` with `shouldUpdate`
        if (
          shouldUpdate &&
          !namePath.length &&
          requireUpdate(shouldUpdate, prevStore, values, prevValue, curValue, info)
        ) {
          this.reRender();
          return;
        }
        break;
      }

      case 'dependenciesUpdate': {
        /**
         * Trigger when marked `dependencies` updated. Related fields will all update
         */
        const dependencyList = dependencies.map(getNamePath);
        if (
          namePathMatch ||
          dependencyList.some(dependency => containsNamePath(info.relatedFields, dependency))
        ) {
          this.reRender();
          return;
        }
        break;
      }

      default:
        /**
         * - If `namePath` exists in `namePathList`, means it's related value and should update.
         * - If `dependencies` exists in `namePathList`, means upstream trigger update.
         * - If `shouldUpdate` provided, use customize logic to update the field
         *   - else to check if value changed
         */
        if (
          namePathMatch ||
          dependencies.some(dependency =>
            containsNamePath(namePathList, getNamePath(dependency)),
          ) ||
          requireUpdate(shouldUpdate, prevStore, values, prevValue, curValue, info)
        ) {
          this.reRender();
          return;
        }
        break;
    }

    if (shouldUpdate === true) {
      this.reRender();
    }
  };

  public validateRules = (options?: ValidateOptions) => {
    const { validateFirst = false, messageVariables } = this.props;
    const { triggerName } = (options || {}) as ValidateOptions;
    const namePath = this.getNamePath();

    let filteredRules = this.getRules();
    if (triggerName) {
      filteredRules = filteredRules.filter((rule: RuleObject) => {
        const { validateTrigger } = rule;
        if (!validateTrigger) {
          return true;
        }
        const triggerList = toArray(validateTrigger);
        return triggerList.includes(triggerName);
      });
    }

    const promise = validateRules(
      namePath,
      this.getValue(),
      filteredRules,
      options,
      validateFirst,
      messageVariables,
    );
    this.dirty = true;
    this.validatePromise = promise;
    this.errors = [];

    promise
      .catch(e => e)
      .then((errors: string[] = []) => {
        if (this.validatePromise === promise) {
          this.validatePromise = null;
          this.errors = errors;
          this.reRender();
        }
      });

    return promise;
  };

  public isFieldValidating = () => !!this.validatePromise;

  public isFieldTouched = () => this.touched;

  public isFieldDirty = () => this.dirty;

  public getErrors = () => this.errors;

  // ============================= Child Component =============================
  public getMeta = (): Meta => {
    // Make error & validating in cache to save perf
    this.prevValidating = this.isFieldValidating();

    const meta: Meta = {
      touched: this.isFieldTouched(),
      validating: this.prevValidating,
      errors: this.errors,
      name: this.getNamePath(),
    };

    return meta;
  };

  // ============================== Field Control ==============================
  public getValue = (store?: Store) => {
    const { getFieldsValue }: FormInstance = this.context;
    const namePath = this.getNamePath();
    return getValue(store || getFieldsValue(true), namePath);
  };

  public getControlled = (childProps: ChildProps = {}) => {
    const {
      trigger,
      validateTrigger,
      getValueFromEvent,
      normalize,
      valuePropName,
      getValueProps,
    } = this.props;
    const mergedValidateTrigger =
      validateTrigger !== undefined ? validateTrigger : this.context.validateTrigger;

    const namePath = this.getNamePath();
    const { getInternalHooks, getFieldsValue }: InternalFormInstance = this.context;
    const { dispatch } = getInternalHooks(HOOK_MARK);
    const value = this.getValue();
    const mergedGetValueProps = getValueProps || ((val: StoreValue) => ({ [valuePropName]: val }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originTriggerFunc: any = childProps[trigger];

    const control = {
      ...childProps,
      ...mergedGetValueProps(value),
    };

    // Add trigger
    control[trigger] = (...args: EventArgs) => {
      // console.log('trigger', trigger, defaultGetValueFromEvent(valuePropName, ...args));

      // Mark as touched
      this.touched = true;
      this.dirty = true;

      let newValue: StoreValue;
      if (getValueFromEvent) {
        newValue = getValueFromEvent(...args);
      } else {
        newValue = defaultGetValueFromEvent(valuePropName, ...args);
      }

      if (normalize) {
        newValue = normalize(newValue, value, getFieldsValue(true));
      }

      dispatch({
        type: 'updateValue',
        namePath,
        value: newValue,
      });

      if (originTriggerFunc) {
        originTriggerFunc(...args);
      }
    };

    // Add validateTrigger
    const validateTriggerList: string[] = toArray(mergedValidateTrigger || []);

    validateTriggerList.forEach((triggerName: string) => {
      // Wrap additional function of component, so that we can get latest value from store
      const originTrigger = control[triggerName];
      control[triggerName] = (...args: EventArgs) => {
        if (originTrigger) {
          originTrigger(...args);
        }

        // Always use latest rules
        const { rules } = this.props;
        if (rules && rules.length) {
          // We dispatch validate to root,
          // since it will update related data with other field with same name
          dispatch({
            type: 'validateField',
            namePath,
            triggerName,
          });
        }
      };
    });

    return control;
  };

  public render() {
    const { resetCount } = this.state;
    const { children } = this.props;

    const child = children(this.getControlled(), this.getMeta(), this.context);

    return <React.Fragment key={resetCount}>{child}</React.Fragment>;
  }
}
```











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
