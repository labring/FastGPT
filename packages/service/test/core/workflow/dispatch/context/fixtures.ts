import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/dispatch/context/file';
import {
  getWorkflowFileContext,
  getWorkflowContext,
  runWithContext
} from '@fastgpt/service/core/workflow/dispatch/context';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import {
  createWorkflowEntryNodeResponseSink,
  type WorkflowNodeResponseContext,
  type WorkflowNodeResponseOutputLike
} from '@fastgpt/service/core/workflow/dispatch/context/nodeResponse';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import type { WorkflowRuntimeControl } from '@fastgpt/service/core/workflow/dispatch/context/runtimeControl';

type TestWorkflowContextProps = Partial<WorkflowRuntimeControl> & {
  runtimeControl?: Partial<WorkflowRuntimeControl>;
  variableContext?: WorkflowVariableStateLike;
  nodeResponseSink?: WorkflowNodeResponseContext | WorkflowNodeResponseOutputLike;
};

/** 测试入口统一准备运行控制；节点夹具中的旧字段只在此处转换，不传给生产节点。 */
export const createTestRuntimeControl = (
  overrides: Partial<WorkflowRuntimeControl> = {}
): WorkflowRuntimeControl => ({
  mode: 'test',
  maxRunTimes: 1000,
  workflowDispatchDeep: 0,
  isToolCall: false,
  ...overrides
});

/** 只在测试构建处适配 publish-only 输出；生产节点必须持有完整响应 Context。 */
export const createTestNodeResponseContext = (
  sink?: WorkflowNodeResponseContext | WorkflowNodeResponseOutputLike
): WorkflowNodeResponseContext => {
  if (sink && 'getChildContext' in sink) return sink;
  return createWorkflowEntryNodeResponseSink(sink ? { output: sink } : {});
};

/** 无配置变量的同步内存 Adapter；文件/密码转换用例仍使用真实 WorkflowVariableState。 */
export const createTestVariableContext = (
  values: Record<string, unknown> = {}
): WorkflowVariableStateLike => ({
  get: (key) => values[key],
  getStoreValue: (key) => values[key],
  getFileStoreValueByRuntimeUrl: () => undefined,
  set: async (key, value) => {
    values[key] = value;
    return value;
  },
  toRuntimeRecord: () => ({ ...values }),
  toStoreRecord: () => ({ ...values }),
  clone: () => createTestVariableContext({ ...values })
});

/** 文件/资源单测不关注变量时，补齐空变量上下文；显式变量 Adapter 优先使用。 */
export const runWithTestWorkflowContext = <T>(
  value: Omit<
    Parameters<typeof runWithContext>[0],
    'variableContext' | 'nodeResponseSink' | 'runtimeControl'
  > & {
    runtimeControl?: WorkflowRuntimeControl;
    variableContext?: WorkflowVariableStateLike;
    nodeResponseSink?: WorkflowNodeResponseContext | WorkflowNodeResponseOutputLike;
  },
  fn: (context: ReturnType<typeof getWorkflowContext>) => T
): T => {
  // 补齐测试夹具时保留对象身份，以继续验证 ALS 存储的就是传入 Context。
  const context = Object.assign(value, {
    runtimeControl: value.runtimeControl ?? createTestRuntimeControl(),
    variableContext: value.variableContext ?? createTestVariableContext(),
    nodeResponseSink: createTestNodeResponseContext(value.nodeResponseSink)
  });
  return runWithContext(context, fn);
};

/** 无附件用例也构建真实空登记表，避免用不完整上下文模拟节点运行。 */
export const createTestWorkflowFileContext = async () => {
  const { fileContext } = await prepareWorkflowFileContext({
    query: [],
    histories: [],
    scope: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'test-app',
      uid: 'test-user',
      chatId: 'test-chat'
    },
    maxFileAmount: 20,
    maxBytesPerFile: 1024
  });
  return fileContext;
};

/** 为单节点测试建立运行作用域；已有父作用域时保留其文件选择、额度和权限。 */
export const runInTestWorkflowContext = async <T>(
  fn: () => Promise<T>,
  variableContext?: WorkflowVariableStateLike
): Promise<T> => {
  if (getWorkflowFileContext())
    return variableContext
      ? runWithContext(getWorkflowContext().getChildContext({ variableContext }), fn)
      : fn();
  const fileContext = await createTestWorkflowFileContext();
  return runWithTestWorkflowContext(
    { checkIsStopping: () => false, mcpClientMemory: {}, fileContext, variableContext },
    fn
  );
};

/** 测试构造器携带的运行依赖只注入 Context，真正交给节点的 props 必须剥离这些字段。 */
export const runTestWorkflowDispatch = async <Props extends object, Result>(
  props: Props & TestWorkflowContextProps,
  {
    dispatch,
    newWorkflow = false
  }: {
    dispatch: (props: Props) => Result | Promise<Result>;
    newWorkflow?: boolean;
  }
): Promise<Result> => {
  const {
    variableContext,
    nodeResponseSink,
    runtimeControl,
    mode,
    maxRunTimes,
    workflowDispatchDeep,
    isToolCall,
    ...nodeProps
  } = props;
  return runInTestWorkflowContext(async () => {
    // 未显式指定时继承外层输出；显式 undefined 表达当前单节点用例没有输出。
    const parentContext = getWorkflowContext();
    const responseContext =
      'nodeResponseSink' in props
        ? createTestNodeResponseContext(nodeResponseSink)
        : parentContext.nodeResponseSink;
    const parentId =
      'nodeResponseParentId' in props && typeof props.nodeResponseParentId === 'string'
        ? props.nodeResponseParentId
        : undefined;
    const childContext = parentContext.getChildContext({
      runtimeControl: {
        ...(mode !== undefined ? { mode } : {}),
        ...(maxRunTimes !== undefined ? { maxRunTimes } : {}),
        ...(workflowDispatchDeep !== undefined ? { workflowDispatchDeep } : {}),
        ...(isToolCall !== undefined ? { isToolCall } : {}),
        ...runtimeControl
      },
      ...(variableContext ? { variableContext } : {}),
      nodeResponseSink: newWorkflow
        ? responseContext.getChildContext({
            workflowRuntimeSummary: createWorkflowRuntimeSummary(),
            ...(parentId !== undefined ? { defaultParentId: parentId } : {})
          })
        : responseContext
    });
    return runWithContext(childContext, () => dispatch(nodeProps as unknown as Props));
  });
};

/** 将纯节点调用包装为完整测试运行，变量依赖只注入 Context，不传入节点参数。 */
export const createTestWorkflowDispatch =
  <Props extends object, Result>(
    dispatch: (props: Props) => Result,
    options: { newWorkflow?: boolean } = {}
  ) =>
  (props: Props & TestWorkflowContextProps): Promise<Awaited<Result>> =>
    runTestWorkflowDispatch(props, { dispatch, newWorkflow: options.newWorkflow }) as Promise<
      Awaited<Result>
    >;

const capturedVariableContexts = new WeakMap<object, WorkflowVariableStateLike>();
/** 子运行 mock 在调用时捕获 Context，而不是在 workflow props 中伪造变量字段。 */
export const captureTestVariableContext = <Props extends object>(props: Props): Props => {
  capturedVariableContexts.set(props, getWorkflowContext().variableContext);
  return props;
};
/** 读取某次子运行调用的变量 Context，以验证父子身份、隔离和回写行为。 */
export const getCapturedTestVariableContext = (props: object): WorkflowVariableStateLike => {
  const context = capturedVariableContexts.get(props);
  if (!context) throw new Error('Test variable context was not captured');
  return context;
};

const capturedNodeResponseSinks = new WeakMap<object, WorkflowNodeResponseContext | undefined>();
const capturedRuntimeControls = new WeakMap<object, WorkflowRuntimeControl>();

/** 子流程 mock 捕获真实运行控制，避免将控制字段重新塞回业务 props 供断言。 */
export const captureTestRuntimeControl = <Props extends object>(props: Props): Props => {
  capturedRuntimeControls.set(props, getWorkflowContext().runtimeControl);
  return props;
};

/** 返回子流程调用时的控制状态，用于校验模式、预算、深度及工具标记。 */
export const getCapturedTestRuntimeControl = (props: object): WorkflowRuntimeControl => {
  const control = capturedRuntimeControls.get(props);
  if (!control) throw new Error('Test runtime control was not captured');
  return control;
};

/** 子流程 mock 在调用时捕获响应 Scope，验证输出策略时不从节点 props 读取依赖。 */
export const captureTestNodeResponseSink = <Props extends object>(props: Props): Props => {
  capturedNodeResponseSinks.set(props, getWorkflowContext().nodeResponseSink);
  return props;
};
/** 返回某次子流程调用实际使用的响应 Scope。 */
export const getCapturedTestNodeResponseSink = (props: object) =>
  capturedNodeResponseSinks.get(props);
