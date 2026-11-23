import type { ApiPromise } from '../core/apiPromise';
import type { ChatStream } from '../core/sse';
import type { RequestOptions } from '../core/types';
import type { ChatResource } from '../generated/resources';
import type { ChatCompletionsV2Req, ChatCompletionsV2Res } from '../generated/types';

export type UserSelectInteractiveOption = {
  key: string;
  value: string;
};

export type UserSelectInteractivePayload = {
  type: 'userSelect';
  params: {
    description?: string;
    userSelectOptions: UserSelectInteractiveOption[];
    userSelectedVal?: string;
  };
};

export type UserInputInteractivePayload = {
  type: 'userInput';
  params: {
    description?: string;
    inputForm: Array<Record<string, unknown>>;
    submitted?: boolean;
  };
};

export type PaymentPauseInteractivePayload = {
  type: 'paymentPause';
  params: {
    description?: string;
    continue?: boolean;
  };
};

export type NestedInteractiveWrapperType =
  | 'childrenInteractive'
  | 'toolChildrenInteractive'
  | 'loopInteractive'
  | 'loopRunInteractive';

export type NestedInteractivePayload = {
  type: NestedInteractiveWrapperType;
  params: {
    childrenResponse: InteractivePayload;
    [key: string]: unknown;
  };
};

export type UnknownInteractivePayload = {
  /** 无法识别或结构不匹配已知交互协议时的独立判别值，避免与已知分支重叠破坏严格类型收窄 */
  type: 'unknown';
  /** 服务端下发的原始交互类型名称 */
  rawType: string;
  params?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export type InteractivePayload =
  | UserSelectInteractivePayload
  | UserInputInteractivePayload
  | PaymentPauseInteractivePayload
  | NestedInteractivePayload
  | UnknownInteractivePayload;

export type InteractiveUserMessage = {
  role: 'user';
  content: string;
};

export type ReplyUserSelectParams = Omit<ChatCompletionsV2Req, 'messages'> & {
  /** 待恢复的会话 ID */
  chatId: string;
  /** 用户所选选项的 value 字符串（需与 userSelectOptions[].value 一致） */
  value: string;
};

export type ReplyUserFormParams = Omit<ChatCompletionsV2Req, 'messages'> & {
  /** 待恢复的会话 ID */
  chatId: string;
  /** 表单字段键值对（键为 inputForm[].key），SDK 自动按服务端协议序列化为 JSON 文本 */
  values: Record<string, unknown>;
};

const NESTED_WRAPPER_TYPES = new Set<string>([
  'childrenInteractive',
  'toolChildrenInteractive',
  'loopInteractive',
  'loopRunInteractive'
]);

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const isUserSelectOption = (val: unknown): val is UserSelectInteractiveOption =>
  isRecord(val) && typeof val.key === 'string' && typeof val.value === 'string';

/**
 * 运行时校验并归一化服务端下发的交互负载为严格可判别的 InteractivePayload。
 * 已知类型只有在 params 结构校验通过时才保留具体判别值，否则降级为 `type: 'unknown'` 保留原始字段。
 */
const parseInteractivePayload = (val: unknown, maxDepth = 12): InteractivePayload | null => {
  if (maxDepth < 0 || !isRecord(val) || typeof val.type !== 'string' || val.type.length === 0) {
    return null;
  }

  const rawParams = isRecord(val.params) ? val.params : undefined;

  if (
    val.type === 'userSelect' &&
    rawParams !== undefined &&
    Array.isArray(rawParams.userSelectOptions) &&
    rawParams.userSelectOptions.every(isUserSelectOption)
  ) {
    return {
      type: 'userSelect',
      params: {
        ...(typeof rawParams.description === 'string'
          ? { description: rawParams.description }
          : {}),
        userSelectOptions: rawParams.userSelectOptions,
        ...(typeof rawParams.userSelectedVal === 'string'
          ? { userSelectedVal: rawParams.userSelectedVal }
          : {})
      }
    };
  }

  if (
    val.type === 'userInput' &&
    rawParams !== undefined &&
    Array.isArray(rawParams.inputForm) &&
    rawParams.inputForm.every(isRecord)
  ) {
    return {
      type: 'userInput',
      params: {
        ...(typeof rawParams.description === 'string'
          ? { description: rawParams.description }
          : {}),
        inputForm: rawParams.inputForm,
        ...(typeof rawParams.submitted === 'boolean' ? { submitted: rawParams.submitted } : {})
      }
    };
  }

  if (val.type === 'paymentPause' && rawParams !== undefined) {
    return {
      type: 'paymentPause',
      params: {
        ...(typeof rawParams.description === 'string'
          ? { description: rawParams.description }
          : {}),
        ...(typeof rawParams.continue === 'boolean' ? { continue: rawParams.continue } : {})
      }
    };
  }

  if (NESTED_WRAPPER_TYPES.has(val.type) && rawParams !== undefined) {
    const nestedChild = parseInteractivePayload(rawParams.childrenResponse, maxDepth - 1);
    if (nestedChild !== null) {
      return {
        type: val.type as NestedInteractiveWrapperType,
        params: {
          ...rawParams,
          childrenResponse: nestedChild
        }
      };
    }
  }

  if (val.type === 'unknown' && typeof val.rawType === 'string' && isRecord(val.raw)) {
    return {
      type: 'unknown',
      rawType: val.rawType,
      ...(rawParams !== undefined ? { params: rawParams } : {}),
      raw: val.raw
    };
  }

  return {
    type: 'unknown',
    rawType: val.type,
    ...(rawParams !== undefined ? { params: rawParams } : {}),
    raw: val
  };
};

/** 判断交互负载是否为经过字段校验的 `userSelect` 节点。 */
export const isUserSelectInteractive = (
  payload: InteractivePayload | null | undefined
): payload is UserSelectInteractivePayload =>
  payload !== null &&
  payload !== undefined &&
  payload.type === 'userSelect' &&
  Array.isArray(payload.params.userSelectOptions);

/** 判断交互负载是否为经过字段校验的 `userInput` 表单节点。 */
export const isUserInputInteractive = (
  payload: InteractivePayload | null | undefined
): payload is UserInputInteractivePayload =>
  payload !== null &&
  payload !== undefined &&
  payload.type === 'userInput' &&
  Array.isArray(payload.params.inputForm);

/** 判断交互负载是否为 `paymentPause` 节点。 */
export const isPaymentPauseInteractive = (
  payload: InteractivePayload | null | undefined
): payload is PaymentPauseInteractivePayload =>
  payload !== null && payload !== undefined && payload.type === 'paymentPause';

/**
 * 递归展开嵌套子工作流 / 循环节点的交互包装（childrenResponse），定位最内层需要用户响应的交互节点。
 */
export const unwrapInteractive = (
  interactive: InteractivePayload,
  maxDepth = 10
): InteractivePayload => {
  let current: InteractivePayload = interactive;
  let depth = 0;

  while (depth < maxDepth) {
    const rawParams = current.params;
    const child =
      isRecord(rawParams) && 'childrenResponse' in rawParams
        ? parseInteractivePayload(rawParams.childrenResponse, maxDepth - depth)
        : null;
    if (child === null) {
      return current;
    }
    current = child;
    depth += 1;
  }

  return current;
};

/**
 * 从非流式 `completionsV2` 响应或流式 `stream.finalResult()` 中提取挂起的交互配置；
 * 若当前回合未触发人机交互，则返回 null。
 */
export const extractInteractive = (result: unknown): InteractivePayload | null => {
  if (!isRecord(result)) {
    return null;
  }

  // 1. 兼容 ChatStreamFinalResult（含 interactive 顶层属性）或直接传入的 InteractivePayload
  const topInteractive = parseInteractivePayload(result.interactive);
  if (topInteractive !== null) {
    return topInteractive;
  }
  const directInteractive = parseInteractivePayload(result);
  if (directInteractive !== null) {
    return directInteractive;
  }

  // 2. 兼容非流式 ChatCompletionsV2Res：检查 choices[0].message.content 数组内的 { interactive } 元素
  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const firstChoice = result.choices[0];
    if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
      const content = firstChoice.message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (isRecord(item)) {
            const itemInteractive = parseInteractivePayload(item.interactive);
            if (itemInteractive !== null) {
              return itemInteractive;
            }
          }
        }
      }
    }
  }

  return null;
};

/**
 * 判断一次非流式或流式对话结果是否处于工作流人机交互挂起状态。
 */
export const isInteractivePending = (result: unknown): boolean =>
  extractInteractive(result) !== null;

/**
 * 构造符合 FastGPT `dispatchUserSelect` 协议的选项回复消息对象。
 */
export const buildUserSelectMessage = (selectedValue: string): InteractiveUserMessage => ({
  role: 'user',
  content: selectedValue
});

/**
 * 构造符合 FastGPT `dispatchFormInput` 协议的表单提交消息对象。
 */
export const buildUserFormMessage = (values: Record<string, unknown>): InteractiveUserMessage => ({
  role: 'user',
  content: JSON.stringify(values)
});

/**
 * 挂载在 `client.chat.interactive` 上的工作流交互恢复助手，避免调用方手写恢复消息格式。
 */
export class ChatInteractiveHelper {
  private readonly _chat: ChatResource;

  constructor(chatResource: ChatResource) {
    this._chat = chatResource;
  }

  /** 判断对话结果是否命中交互挂起。 */
  isPending(result: unknown): boolean {
    return isInteractivePending(result);
  }

  /** 从非流式或流式聚合结果中提取交互挂起配置。 */
  extract(result: unknown): InteractivePayload | null {
    return extractInteractive(result);
  }

  /** 递归展开嵌套子流程交互包装，定位最内层待用户处理的交互节点。 */
  unwrap(interactive: InteractivePayload): InteractivePayload {
    return unwrapInteractive(interactive);
  }

  /** 构造 `userSelect` 节点恢复消息。 */
  buildUserSelectMessage(selectedValue: string): InteractiveUserMessage {
    return buildUserSelectMessage(selectedValue);
  }

  /** 构造 `userInput` 表单节点恢复消息。 */
  buildUserFormMessage(values: Record<string, unknown>): InteractiveUserMessage {
    return buildUserFormMessage(values);
  }

  /** 以非流式方式提交 `userSelect` 选项并恢复工作流执行。 */
  replyUserSelect(
    params: ReplyUserSelectParams,
    options?: RequestOptions
  ): ApiPromise<ChatCompletionsV2Res> {
    const { value, ...rest } = params;
    return this._chat.completionsV2(
      {
        ...rest,
        messages: [buildUserSelectMessage(value)]
      },
      options
    );
  }

  /** 以流式 SSE 方式提交 `userSelect` 选项并恢复工作流执行。 */
  replyUserSelectStream(
    params: ReplyUserSelectParams,
    options?: RequestOptions
  ): Promise<ChatStream> {
    const { value, ...rest } = params;
    return this._chat.completionsV2Stream(
      {
        ...rest,
        messages: [buildUserSelectMessage(value)]
      },
      options
    );
  }

  /** 以非流式方式提交 `userInput` 表单并恢复工作流执行。 */
  replyUserForm(
    params: ReplyUserFormParams,
    options?: RequestOptions
  ): ApiPromise<ChatCompletionsV2Res> {
    const { values, ...rest } = params;
    return this._chat.completionsV2(
      {
        ...rest,
        messages: [buildUserFormMessage(values)]
      },
      options
    );
  }

  /** 以流式 SSE 方式提交 `userInput` 表单并恢复工作流执行。 */
  replyUserFormStream(params: ReplyUserFormParams, options?: RequestOptions): Promise<ChatStream> {
    const { values, ...rest } = params;
    return this._chat.completionsV2Stream(
      {
        ...rest,
        messages: [buildUserFormMessage(values)]
      },
      options
    );
  }
}
