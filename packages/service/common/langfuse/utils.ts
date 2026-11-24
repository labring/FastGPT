import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

const LANGFUSE_MAX_STRING_LENGTH = 10000;
const LANGFUSE_MAX_ARRAY_LENGTH = 100;
const LANGFUSE_MAX_OBJECT_KEYS = 100;
const LANGFUSE_MAX_DEPTH = 8;
const LANGFUSE_MAX_SERIALIZED_LENGTH = 100000;

const LANGFUSE_TRACE_NAME = 'message';

/**
 * 不上报的历史上下文与内部推理对象。
 * 推理文本默认过滤；仅当调用方确认字段属于上报契约时（generation 输出），通过
 * `keepExcludedKeys` 放开，避免普通节点的输入/输出泄露推理内容。
 */
const langfuseExcludedKeys = new Set([
  'history',
  'histories',
  'aiChatDatasetQuote',
  'fileUrlList',
  'reasoning',
  'reasoningText'
]);

type LangfuseSerializeOptions = {
  /** 仅放行调用方明确需要上报的排除字段；其他位置仍按默认规则过滤。 */
  keepExcludedKeys?: ReadonlySet<string>;
};

type LangfuseTraceAttributesProps = {
  sessionId: string;
  userId: string;
  appId: string;
  appName: string;
  input: unknown;
};

/**
 * 将业务数据转换为有界的 Langfuse attribute 字符串。
 * 不可序列化的观测数据会被忽略，避免 tracing 反向中断工作流主流程。
 * 默认过滤敏感字段；`keepExcludedKeys` 仅供调用方按上报契约放行指定字段。
 */
export const serializeLangfuseValue = (
  value: unknown,
  { keepExcludedKeys }: LangfuseSerializeOptions = {}
): string | undefined => {
  const seen = new WeakSet<object>();

  const normalize = (current: unknown, depth: number, key?: string): unknown => {
    if (key && langfuseExcludedKeys.has(key) && !keepExcludedKeys?.has(key)) return undefined;
    if (current === null) return null;

    if (typeof current === 'string') {
      return current.length > LANGFUSE_MAX_STRING_LENGTH
        ? `${current.slice(0, LANGFUSE_MAX_STRING_LENGTH)}...[truncated]`
        : current;
    }
    if (typeof current === 'number' || typeof current === 'boolean') return current;
    if (typeof current === 'bigint') return current.toString();
    if (
      typeof current === 'undefined' ||
      typeof current === 'function' ||
      typeof current === 'symbol'
    ) {
      return undefined;
    }
    if (current instanceof Date) return current.toISOString();
    if (current instanceof Uint8Array)
      return `[${current.constructor.name} length=${current.byteLength}]`;
    if (depth >= LANGFUSE_MAX_DEPTH) return '[MaxDepth]';
    if (seen.has(current)) return '[Circular]';

    seen.add(current);
    if (Array.isArray(current)) {
      const normalized = current
        .slice(0, LANGFUSE_MAX_ARRAY_LENGTH)
        .map((item) => normalize(item, depth + 1));
      if (current.length > LANGFUSE_MAX_ARRAY_LENGTH) normalized.push('[Truncated]');
      return normalized;
    }

    const normalized: Record<string, unknown> = {};
    const entries = Object.entries(current).slice(0, LANGFUSE_MAX_OBJECT_KEYS);
    for (const [entryKey, entryValue] of entries) {
      const normalizedValue = normalize(entryValue, depth + 1, entryKey);
      if (normalizedValue !== undefined) normalized[entryKey] = normalizedValue;
    }
    if (Object.keys(current).length > LANGFUSE_MAX_OBJECT_KEYS) normalized.__truncated = true;
    return normalized;
  };

  try {
    const serialized = JSON.stringify(normalize(value, 0));
    if (serialized === undefined) return undefined;
    if (serialized.length <= LANGFUSE_MAX_SERIALIZED_LENGTH) return serialized;

    return JSON.stringify(`${serialized.slice(0, LANGFUSE_MAX_STRING_LENGTH)}...[truncated]`);
  } catch {
    return undefined;
  }
};

/** 提取最终回复中的可见文本，不上传内部推理消息。 */
export const getLangfuseAssistantOutput = (values: AIChatItemValueItemType[]): string =>
  values.flatMap((item) => (item.text?.content ? [item.text.content] : [])).join('');

/** 构造根 workflow span 的初始属性，使 Langfuse 能在 onStart 阶段识别应用根。 */
export const getLangfuseTraceAttributes = ({
  sessionId,
  userId,
  appId,
  appName,
  input
}: LangfuseTraceAttributesProps) => {
  const serializedInput = serializeLangfuseValue(input);
  return {
    'langfuse.trace.name': LANGFUSE_TRACE_NAME,
    'langfuse.session.id': sessionId,
    'langfuse.user.id': userId,
    'langfuse.trace.metadata.app_id': appId,
    'langfuse.trace.metadata.appName': appName,
    // workflow.run 既是根 trace 也是 observation，两个维度都带 app_id，便于下游按 observation 过滤。
    'langfuse.observation.metadata.app_id': appId,
    ...(serializedInput !== undefined ? { 'langfuse.trace.input': serializedInput } : {})
  };
};

/**
 * 构造节点 span 的初始标记，确保 processor 从 span 启动时就跟踪该节点。
 * nodeId/nodeName 用于区分同类型节点；trace.name 挂在每个 step 上，便于下游按 trace 名过滤。
 */
export const getLangfuseStepStartAttributes = ({
  appId,
  nodeId,
  nodeName
}: {
  appId: string;
  nodeId: string;
  nodeName?: string;
}) => ({
  'langfuse.observation.metadata.app_id': appId,
  'langfuse.observation.metadata.nodeId': nodeId,
  ...(nodeName ? { 'langfuse.observation.metadata.nodeName': nodeName } : {}),
  'langfuse.trace.name': LANGFUSE_TRACE_NAME
});
