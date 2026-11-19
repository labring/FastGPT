import type { ApiPromise } from '../core/apiPromise';
import type { ChatStream } from '../core/sse';
import type { RequestOptions } from '../core/types';
import type { ChatResource } from '../generated/resources';
import type { ChatCompletionsV2Req, ChatCompletionsV2Res } from '../generated/types';

export type UserSelectInteractiveOption = {
  key: string;
  value: string;
};

export type InteractivePayload =
  | {
      type: 'userSelect';
      params: {
        description?: string;
        userSelectOptions: UserSelectInteractiveOption[];
        userSelectedVal?: string;
      };
    }
  | {
      type: 'userInput';
      params: {
        description?: string;
        inputForm: Array<Record<string, unknown>>;
        submitted?: boolean;
      };
    }
  | {
      type: 'paymentPause';
      params: {
        description?: string;
        continue?: boolean;
      };
    }
  | {
      type: string;
      params?: Record<string, unknown>;
    };

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

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const isInteractivePayload = (val: unknown): val is InteractivePayload =>
  isRecord(val) && typeof val.type === 'string' && val.type.length > 0;

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
    const child = isRecord(rawParams)
      ? (rawParams as Record<string, unknown>).childrenResponse
      : undefined;
    if (!isInteractivePayload(child)) {
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
  if (isInteractivePayload(result.interactive)) {
    return result.interactive;
  }
  if (isInteractivePayload(result)) {
    return result;
  }

  // 2. 兼容非流式 ChatCompletionsV2Res：检查 choices[0].message.content 数组内的 { interactive } 元素
  if (Array.isArray(result.choices) && result.choices.length > 0) {
    const firstChoice = result.choices[0];
    if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
      const content = firstChoice.message.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (isRecord(item) && isInteractivePayload(item.interactive)) {
            return item.interactive;
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
