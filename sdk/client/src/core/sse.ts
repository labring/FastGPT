import { createMappedApiError, FastGptError, FastGptNetworkError } from './errors';
import type { RawResponseInfo } from './types';

export type RawSseFrame = {
  event: string;
  data: string;
  id?: string;
};

export type ChatSseEvent =
  | {
      type: 'answer';
      textDelta: string;
      reasoningDelta?: string;
      fast: boolean;
      raw: unknown;
    }
  | {
      type: 'flowNodeStatus';
      status: string;
      name: string;
      raw: unknown;
    }
  | {
      type: 'flowNodeResponse';
      data: Record<string, unknown>;
      raw: unknown;
    }
  | {
      type: 'flowResponses';
      data: Array<Record<string, unknown>>;
      raw: unknown;
    }
  | {
      type: 'interactive';
      interactive: unknown;
      raw: unknown;
    }
  | {
      type: 'toolCall' | 'toolParams' | 'toolResponse';
      data: unknown;
      raw: unknown;
    }
  | {
      type: 'chatTitle';
      title: string;
      raw: unknown;
    }
  | {
      type: 'workflowDuration';
      durationSeconds: number;
      raw: unknown;
    }
  | {
      type: 'updateVariables';
      variables: Record<string, unknown>;
      raw: unknown;
    }
  | {
      type: 'plan' | 'planStatus' | 'sandboxStatus' | 'skillCall';
      data: unknown;
      raw: unknown;
    }
  | {
      type: 'resumePhase';
      phase: string;
      raw: string;
    }
  | {
      type: 'resumeCompleted' | 'resumeUnavailable';
      data: unknown;
      raw: unknown;
    }
  | {
      type: 'error';
      error: FastGptError;
      raw: unknown;
    }
  | {
      type: 'unknown';
      event: string;
      data: unknown;
    };

export type ChatStreamTerminalState = 'pending' | 'completed' | 'closed' | 'aborted' | 'failed';

export type ChatStreamFinalResult = {
  text: string;
  reasoningText: string;
  chatTitle?: string;
  durationSeconds?: number;
  interactive?: unknown;
  variables?: Record<string, unknown>;
  nodeResponses: Array<Record<string, unknown>>;
  quotes: unknown[];
};

const isRecord = (val: unknown): val is Record<string, unknown> =>
  val !== null && typeof val === 'object' && !Array.isArray(val);

const safeJsonParse = (raw: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
};

const extractChunkDeltas = (payload: unknown): { textDelta: string; reasoningDelta?: string } => {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return { textDelta: '' };
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.delta)) {
    return { textDelta: '' };
  }
  const delta = firstChoice.delta;
  const textDelta = typeof delta.content === 'string' ? delta.content : '';
  const reasoningDelta =
    typeof delta.reasoning_content === 'string' ? delta.reasoning_content : undefined;

  return {
    textDelta,
    ...(reasoningDelta !== undefined ? { reasoningDelta } : {})
  };
};

/**
 * 将底层 SSE 原始帧解析为强类型判别联合事件，同时兼容：
 * 1. detail=false 时的无名 OpenAI 标准增量帧；
 * 2. detail=true 时的 FastGPT 多事件流（answer / flowNodeStatus / interactive 等）；
 * 3. /core/chat/resume 的纯字符串帧（如 event: resumePhase, data: catchup）。
 */
export const parseChatSseFrame = (
  frame: RawSseFrame,
  options?: { responseInfo?: RawResponseInfo; extraSecrets?: ReadonlyArray<string> }
): ChatSseEvent | null => {
  const responseInfo = options?.responseInfo;
  const extraSecrets = options?.extraSecrets;
  const trimmedData = frame.data.trim();
  if (trimmedData === '[DONE]' || frame.event === 'done') {
    return null;
  }

  if (frame.event === 'resumePhase') {
    return {
      type: 'resumePhase',
      phase: trimmedData,
      raw: frame.data
    };
  }

  const parsed = safeJsonParse(frame.data);
  const payload = parsed.ok ? parsed.value : frame.data;
  const eventName = frame.event || 'message';

  if (eventName === 'message' || eventName === 'answer' || eventName === 'fastAnswer') {
    if (isRecord(payload) && isRecord(payload.error)) {
      const errObj = payload.error;
      const errMsg = typeof errObj.message === 'string' ? errObj.message : 'Stream error received';
      return {
        type: 'error',
        error: createMappedApiError({
          message: errMsg,
          statusText: typeof errObj.type === 'string' ? errObj.type : undefined,
          requestId: responseInfo?.requestId,
          url: responseInfo?.url,
          extraSecrets
        }),
        raw: payload
      };
    }

    const { textDelta, reasoningDelta } = extractChunkDeltas(payload);
    return {
      type: 'answer',
      textDelta,
      ...(reasoningDelta !== undefined ? { reasoningDelta } : {}),
      fast: eventName === 'fastAnswer',
      raw: payload
    };
  }

  if (eventName === 'error') {
    const errMsg = (() => {
      if (typeof payload === 'string') return payload;
      if (isRecord(payload)) {
        if (typeof payload.message === 'string') return payload.message;
        if (typeof payload.statusText === 'string') return payload.statusText;
      }
      return 'SSE workflow execution error';
    })();

    const httpStatus =
      isRecord(payload) && typeof payload.httpStatus === 'number' ? payload.httpStatus : undefined;
    const serverCode =
      isRecord(payload) && typeof payload.code === 'number' ? payload.code : undefined;
    const statusText =
      isRecord(payload) && typeof payload.statusText === 'string' ? payload.statusText : undefined;

    return {
      type: 'error',
      error: createMappedApiError({
        message: errMsg,
        ...(httpStatus !== undefined ? { httpStatus } : {}),
        serverCode,
        statusText,
        requestId: responseInfo?.requestId,
        url: responseInfo?.url,
        extraSecrets
      }),
      raw: payload
    };
  }

  if (eventName === 'flowNodeStatus') {
    return {
      type: 'flowNodeStatus',
      status: isRecord(payload) && typeof payload.status === 'string' ? payload.status : '',
      name: isRecord(payload) && typeof payload.name === 'string' ? payload.name : '',
      raw: payload
    };
  }

  if (eventName === 'flowNodeResponse') {
    return {
      type: 'flowNodeResponse',
      data: isRecord(payload) ? payload : { value: payload },
      raw: payload
    };
  }

  if (eventName === 'flowResponses') {
    const list = Array.isArray(payload)
      ? payload.filter((item): item is Record<string, unknown> => isRecord(item))
      : [];
    return {
      type: 'flowResponses',
      data: list,
      raw: payload
    };
  }

  if (eventName === 'interactive') {
    const interactiveVal =
      isRecord(payload) && 'interactive' in payload ? payload.interactive : payload;
    return {
      type: 'interactive',
      interactive: interactiveVal,
      raw: payload
    };
  }

  if (eventName === 'toolCall' || eventName === 'toolParams' || eventName === 'toolResponse') {
    return {
      type: eventName,
      data: payload,
      raw: payload
    };
  }

  if (eventName === 'chatTitle') {
    // 服务端 workflowSseEvent.chatTitle() 下发对象 { title: string }，同时兼容旧/自定义纯字符串格式。
    const title = (() => {
      if (isRecord(payload) && typeof payload.title === 'string') {
        return payload.title;
      }
      if (typeof payload === 'string') {
        return payload;
      }
      return '';
    })();
    return {
      type: 'chatTitle',
      title,
      raw: payload
    };
  }

  if (eventName === 'workflowDuration') {
    const seconds = (() => {
      if (typeof payload === 'number') return payload;
      if (isRecord(payload) && typeof payload.durationSeconds === 'number') {
        return payload.durationSeconds;
      }
      return Number(payload) || 0;
    })();
    return {
      type: 'workflowDuration',
      durationSeconds: seconds,
      raw: payload
    };
  }

  if (eventName === 'updateVariables') {
    return {
      type: 'updateVariables',
      variables: isRecord(payload) ? payload : {},
      raw: payload
    };
  }

  if (
    eventName === 'plan' ||
    eventName === 'planStatus' ||
    eventName === 'sandboxStatus' ||
    eventName === 'skillCall'
  ) {
    return {
      type: eventName,
      data: payload,
      raw: payload
    };
  }

  if (eventName === 'resumeCompleted' || eventName === 'resumeUnavailable') {
    return {
      type: eventName,
      data: payload,
      raw: payload
    };
  }

  return {
    type: 'unknown',
    event: eventName,
    data: payload
  };
};

const readNextChunkWithSignal = (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): Promise<ReadableStreamReadResult<Uint8Array>> => {
  if (signal === undefined) {
    return reader.read();
  }
  if (signal.aborted) {
    void reader.cancel(signal.reason).catch(() => {});
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }

  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const onAbort = () => {
      void reader.cancel(signal.reason).catch(() => {});
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    reader.read().then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
};

/**
 * 按标准 WHATWG EventSource 行帧规范解析字节流，兼容 \r\n、多行 data:、注释心跳行及取消信号。
 */
export async function* iterateRawSseFrames(
  stream: ReadableStream<Uint8Array>,
  options?: {
    signal?: AbortSignal;
    onReaderReady?: (cancelReader: (reason?: unknown) => void) => void;
  }
): AsyncGenerator<RawSseFrame, void, undefined> {
  const signal = options?.signal;
  const reader = stream.getReader();
  const cancelReader = (reason?: unknown): void => {
    void reader.cancel(reason).catch(() => {});
  };
  options?.onReaderReady?.(cancelReader);
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let currentEvent = '';
  let currentId: string | undefined;
  let dataLines: string[] = [];

  const flushFrame = (): RawSseFrame | null => {
    if (dataLines.length === 0 && !currentEvent) {
      return null;
    }
    const frame: RawSseFrame = {
      event: currentEvent,
      data: dataLines.join('\n'),
      ...(currentId !== undefined ? { id: currentId } : {})
    };
    currentEvent = '';
    currentId = undefined;
    dataLines = [];
    return frame;
  };

  const processLine = (rawLine: string): RawSseFrame | null => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      return flushFrame();
    }
    if (line.startsWith(':')) {
      return null;
    }

    const colonIndex = line.indexOf(':');
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    if (field === 'event') {
      currentEvent = value;
    } else if (field === 'data') {
      dataLines.push(value);
    } else if (field === 'id' && !value.includes('\0')) {
      currentId = value;
    }

    return null;
  };

  try {
    while (true) {
      const { done, value } = await readNextChunkWithSignal(reader, signal);
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const rawLine = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        const frame = processLine(rawLine);
        if (frame !== null) {
          yield frame;
        }
        newlineIdx = buffer.indexOf('\n');
      }
    }

    if (buffer.length > 0) {
      const frame = processLine(buffer);
      if (frame !== null) {
        yield frame;
      }
    }
    const trailingFrame = flushFrame();
    if (trailingFrame !== null) {
      yield trailingFrame;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * 对话与流式恢复响应流封装：既支持 `for await (const ev of stream)` 逐帧消费，
 * 也支持在逐帧消费结束后（或直接不遍历）调用 `.finalText()` / `.finalResult()` 获取完整聚合结果。
 * 迭代与聚合共享统一终态机，严格区分正常完成（completed）、主动提前结束（closed）、
 * 显式或外部取消（aborted）与读流/服务端失败（failed）。
 */
export class ChatStream implements AsyncIterable<ChatSseEvent> {
  readonly response: RawResponseInfo;
  private readonly _body: ReadableStream<Uint8Array>;
  private readonly _controller: AbortController;
  private readonly _onDispose?: () => void;
  private readonly _requireDoneSignal: boolean;
  private readonly _extraSecrets?: ReadonlyArray<string>;
  private _cancelActiveReader: ((reason?: unknown) => void) | null = null;
  private _started = false;
  private _disposed = false;
  private _abortRequested = false;
  private _isConsumerClosing = false;
  private _state: ChatStreamTerminalState = 'pending';
  private _terminalError: unknown = undefined;
  private readonly _donePromise: Promise<void>;
  private _resolveDone!: () => void;
  private _rejectDone!: (error: unknown) => void;

  // 流消费期间同步累计聚合状态，使 `for await` 结束后仍可直接调用 `finalResult()` / `finalText()`。
  private _text = '';
  private _reasoningText = '';
  private _chatTitle: string | undefined;
  private _durationSeconds: number | undefined;
  private _interactive: unknown;
  private _variables: Record<string, unknown> | undefined;
  private readonly _nodeResponses: Array<Record<string, unknown>> = [];
  private readonly _quotes: unknown[] = [];
  private _streamError: FastGptError | undefined;

  private readonly _onControllerAbort = (): void => {
    if (this._isConsumerClosing || this._state !== 'pending') {
      return;
    }
    this._abortRequested = true;
    const reason = this._controller.signal.reason;
    const abortError = this._createAbortError(reason);

    // 取消必须独立驱动流资源释放与终态结算：即使消费者正暂停在 yield 处不再推进 iterator，
    // 底层 reader 也会立即被 cancel，且等待中的 finalResult()/finalText() 立即拒绝而不挂起。
    if (this._cancelActiveReader !== null) {
      this._cancelActiveReader(reason);
    } else if (!this._started) {
      void this._body.cancel(reason).catch(() => {});
    }
    this._finalize({ state: 'aborted', error: abortError });
  };

  constructor({
    body,
    response,
    controller,
    onDispose,
    requireDoneSignal = true,
    extraSecrets
  }: {
    body: ReadableStream<Uint8Array>;
    response: RawResponseInfo;
    controller: AbortController;
    onDispose?: () => void;
    /** 是否要求收到协议终止帧（[DONE] / event: done）才确认正常完成（FastGPT v2 completions 与 resume 均为 true） */
    requireDoneSignal?: boolean;
    extraSecrets?: ReadonlyArray<string>;
  }) {
    this._body = body;
    this.response = response;
    this._controller = controller;
    this._onDispose = onDispose;
    this._requireDoneSignal = requireDoneSignal;
    this._extraSecrets = extraSecrets;
    this._donePromise = new Promise<void>((resolve, reject) => {
      this._resolveDone = resolve;
      this._rejectDone = reject;
    });
    // 防止在调用方仅通过 for await 捕获错误而未调用 finalResult() 时触发 unhandledRejection。
    this._donePromise.catch(() => {});

    if (this._controller.signal.aborted) {
      this._onControllerAbort();
    } else {
      this._controller.signal.addEventListener('abort', this._onControllerAbort, { once: true });
    }
  }

  /** 当前流终态：pending / completed / closed / aborted / failed */
  get state(): ChatStreamTerminalState {
    return this._state;
  }

  private _isAborted(): boolean {
    return this._state === 'aborted' || this._abortRequested || this._controller.signal.aborted;
  }

  private _createAbortError(cause?: unknown): FastGptError {
    if (cause instanceof FastGptError) {
      return cause;
    }
    return new FastGptError({
      message: 'Chat stream was aborted',
      requestId: this.response.requestId,
      url: this.response.url,
      ...(cause !== undefined ? { cause } : {}),
      extraSecrets: this._extraSecrets
    });
  }

  private _dispose(): void {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._controller.signal.removeEventListener('abort', this._onControllerAbort);
    this._onDispose?.();
  }

  private _finalize({
    state,
    error
  }: {
    state: Exclude<ChatStreamTerminalState, 'pending'>;
    error?: unknown;
  }): void {
    if (this._state !== 'pending') {
      this._dispose();
      return;
    }
    this._state = state;
    this._terminalError = error;
    this._dispose();

    if (state === 'failed' || state === 'aborted') {
      this._rejectDone(error);
    } else {
      this._resolveDone();
    }
  }

  /**
   * 主动中断底层 HTTP 流连接并独立结算为 aborted 终态。
   */
  abort(reason?: unknown): void {
    this._abortRequested = true;
    if (!this._controller.signal.aborted) {
      this._controller.abort(reason);
    } else {
      this._onControllerAbort();
    }
  }

  private _accumulateEvent(event: ChatSseEvent): void {
    if (event.type === 'error') {
      this._streamError ??= event.error;
      return;
    }
    if (event.type === 'answer') {
      this._text += event.textDelta;
      if (event.reasoningDelta !== undefined) {
        this._reasoningText += event.reasoningDelta;
      }
      return;
    }
    if (event.type === 'chatTitle') {
      this._chatTitle = event.title;
      return;
    }
    if (event.type === 'workflowDuration') {
      this._durationSeconds = event.durationSeconds;
      return;
    }
    if (event.type === 'interactive') {
      this._interactive = event.interactive;
      return;
    }
    if (event.type === 'updateVariables') {
      this._variables = { ...(this._variables ?? {}), ...event.variables };
      return;
    }
    if (event.type === 'flowNodeResponse') {
      this._nodeResponses.push(event.data);
      if (Array.isArray(event.data.quoteList)) {
        this._quotes.push(...event.data.quoteList);
      }
      return;
    }
    if (event.type === 'flowResponses') {
      for (const item of event.data) {
        this._nodeResponses.push(item);
        if (Array.isArray(item.quoteList)) {
          this._quotes.push(...item.quoteList);
        }
      }
    }
  }

  private _buildFinalResultSnapshot(): ChatStreamFinalResult {
    return {
      text: this._text,
      reasoningText: this._reasoningText,
      ...(this._chatTitle !== undefined ? { chatTitle: this._chatTitle } : {}),
      ...(this._durationSeconds !== undefined ? { durationSeconds: this._durationSeconds } : {}),
      ...(this._interactive !== undefined ? { interactive: this._interactive } : {}),
      ...(this._variables !== undefined ? { variables: { ...this._variables } } : {}),
      nodeResponses: [...this._nodeResponses],
      quotes: [...this._quotes]
    };
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatSseEvent> {
    if (this._started) {
      throw new FastGptError({
        message: 'ChatStream can only be iterated once',
        extraSecrets: this._extraSecrets
      });
    }
    this._started = true;

    if (this._isAborted()) {
      const abortErr =
        this._terminalError ?? this._createAbortError(this._controller.signal.reason);
      this._finalize({ state: 'aborted', error: abortErr });
      throw abortErr;
    }

    let receivedDoneSignal = false;
    let reachedStreamEnd = false;
    let failedWith: unknown;
    let hasFailure = false;

    try {
      for await (const rawFrame of iterateRawSseFrames(this._body, {
        signal: this._controller.signal,
        onReaderReady: (cancelReader) => {
          this._cancelActiveReader = cancelReader;
          if (this._isAborted()) {
            cancelReader(this._controller.signal.reason);
          }
        }
      })) {
        if (this._isAborted()) {
          throw this._terminalError ?? this._createAbortError(this._controller.signal.reason);
        }

        const parsed = parseChatSseFrame(rawFrame, {
          responseInfo: this.response,
          extraSecrets: this._extraSecrets
        });
        if (parsed === null) {
          receivedDoneSignal = true;
          reachedStreamEnd = true;
          return;
        }
        this._accumulateEvent(parsed);
        yield parsed;

        // 若消费者暂停在 yield 期间发生了 abort() 或外部取消，恢复推进时立即抛出同一取消异常。
        if (this._isAborted()) {
          throw this._terminalError ?? this._createAbortError(this._controller.signal.reason);
        }
      }

      reachedStreamEnd = true;
      // v2 completions 与 chat resume 正常结束均显式发送 [DONE] / event: done；
      // 未收到协议终止帧且未收到服务端 error 帧的提前 EOF 视为传输截断失败，绝不标为 completed。
      if (this._streamError === undefined && this._requireDoneSignal && !receivedDoneSignal) {
        throw new FastGptNetworkError({
          message: 'Chat stream ended unexpectedly before receiving [DONE] termination frame',
          requestId: this.response.requestId,
          url: this.response.url,
          extraSecrets: this._extraSecrets
        });
      }
    } catch (error) {
      hasFailure = true;
      if (this._isAborted()) {
        failedWith = this._terminalError ?? this._createAbortError(error);
      } else {
        failedWith = error;
      }
      throw failedWith;
    } finally {
      this._cancelActiveReader = null;
      if (this._state !== 'pending') {
        this._dispose();
      } else if (hasFailure) {
        this._finalize({
          state: this._isAborted() ? 'aborted' : 'failed',
          error: failedWith
        });
      } else if (this._isAborted()) {
        this._finalize({
          state: 'aborted',
          error: this._createAbortError(this._controller.signal.reason)
        });
      } else if (this._streamError !== undefined) {
        this._finalize({
          state: 'failed',
          error: this._streamError
        });
      } else if (reachedStreamEnd && (receivedDoneSignal || !this._requireDoneSignal)) {
        this._finalize({ state: 'completed' });
      } else {
        // 调用方在未报错、未取消的情况下主动提前 break 结束遍历：释放底层连接并标记为 closed 终态，
        // 允许后续 finalResult()/finalText() 读取已接收到的部分快照。
        this._isConsumerClosing = true;
        if (!this._controller.signal.aborted) {
          this._controller.abort();
        }
        this._finalize({ state: 'closed' });
      }
    }
  }

  /**
   * 等待事件流结束并返回聚合结果（支持在 `for await` 结束后直接调用，也支持不遍历直接调用）；
   * 迭代失败、流被取消或收到服务端 `error` 事件时始终抛出对应的终止错误，绝不把截断文本当作成功结果返回。
   */
  async finalResult(): Promise<ChatStreamFinalResult> {
    if (!this._started && this._state === 'pending') {
      for await (const _event of this) {
        // 迭代驱动 _accumulateEvent 完成聚合
      }
    } else {
      await this._donePromise;
    }

    if (this._terminalError !== undefined) {
      throw this._terminalError;
    }

    return this._buildFinalResultSnapshot();
  }

  /**
   * 等待事件流结束并仅返回拼接后的最终回复文本。
   */
  async finalText(): Promise<string> {
    const result = await this.finalResult();
    return result.text;
  }
}
