import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import {
  extractDeepestInteractive,
  isValidInteractive
} from '@fastgpt/global/core/workflow/runtime/utils';

const LANGFUSE_MAX_STRING_LENGTH = 10000;
const LANGFUSE_MAX_ARRAY_LENGTH = 100;
const LANGFUSE_MAX_OBJECT_KEYS = 100;
const LANGFUSE_MAX_DEPTH = 8;
const LANGFUSE_MAX_SERIALIZED_LENGTH = 100000;

/**
 * trace.output 的白名单字段：只上报回复内容相关字段。
 * 输入上下文（inputContext，本轮改写后的完整用户输入）、恢复上下文（contextCheckpoint）
 * 以及服务端内部状态一律不上报，避免把用户输入写进 trace。
 */
const langfuseTraceOutputItemKeys = [
  'id',
  'text',
  'reasoning',
  'tools',
  'skills',
  'interactive',
  'plan',
  'planStatus',
  'tool'
] as const;

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

/**
 * trace.output 需要放行的字段：1.5.0 的 trace.output 直接序列化 AI 消息项数组，
 * 其中包含 reasoning 项；1.6 默认会过滤推理内容，这里按上报契约显式放行，
 * 保证下游拿到的字段集合与 1.5.0 一致。
 */
export const langfuseTraceOutputAllowedKeys: ReadonlySet<string> = new Set(['reasoning']);

/** 只有“纯文本 / 纯推理”项参与合并；带 tools/skills/interactive/plan 等字段的项保持边界。 */
const isPureLangfuseTextItem = (item: AIChatItemValueItemType) =>
  !!item.text &&
  !item.reasoning &&
  !item.tools &&
  !item.skills &&
  !item.interactive &&
  !item.plan &&
  !item.planStatus &&
  !item.tool;

const isPureLangfuseReasoningItem = (item: AIChatItemValueItemType) =>
  !!item.reasoning &&
  !item.text &&
  !item.tools &&
  !item.skills &&
  !item.interactive &&
  !item.plan &&
  !item.planStatus &&
  !item.tool;

/**
 * 构造 trace.output 的 AI 消息项数组，合并规则与 1.5.0 的
 * `mergeAssistantResponseAnswerText` 保持一致：连续纯 text 合并、连续纯 reasoning 合并，
 * 结果为空时补一个空 text 项。
 *
 * 只有“纯文本 / 纯推理”项参与合并：同一项同时带 text + tools，或带 interactive/plan 等字段时
 * 保持独立边界，避免合并时丢掉工具记录与交互快照。
 * 合并时生成新对象，不修改调用方的消息项（避免同一数组被多次归一时内容叠加）。
 */
export const getLangfuseTraceOutput = (
  values: AIChatItemValueItemType[]
): AIChatItemValueItemType[] => {
  const result: AIChatItemValueItemType[] = [];

  for (const item of values) {
    const lastItem = result[result.length - 1];

    if (isPureLangfuseTextItem(item)) {
      if (lastItem && isPureLangfuseTextItem(lastItem) && lastItem.text?.content) {
        result[result.length - 1] = {
          ...lastItem,
          text: { content: (lastItem.text?.content || '') + (item.text?.content || '') }
        };
        continue;
      }
    } else if (isPureLangfuseReasoningItem(item)) {
      if (lastItem && isPureLangfuseReasoningItem(lastItem)) {
        result[result.length - 1] = {
          ...lastItem,
          reasoning: {
            ...(lastItem.reasoning ?? {}),
            content: (lastItem.reasoning?.content || '') + (item.reasoning?.content || '')
          }
        };
        continue;
      }
    }

    result.push(item);
  }

  // 与 1.5.0 对齐：空结果补一个空 text 项，而不是返回空数组。
  if (result.length === 0) result.push({ text: { content: '' } });

  return result;
};

/**
 * trace.output 中交互的上报形状：type + 结构化 params。
 * 这是投影后的独立形状，不承载调度字段，也不等同完整运行时交互。
 */
type LangfuseTraceInteractiveType = {
  type: InteractiveNodeResponseType['type'];
  params: Record<string, unknown>;
};

/**
 * 按叶子类型投影遥测所需的结构信息，剔除运行时值。
 *
 * 动态选项（userSelectOptions）与表单字段可引用上游文本（如工作流开始节点的完整用户输入），
 * 模型工具参数（arguments）可携带会话上下文，一律不上报；只保留静态配置结构：
 * - userSelect / userInput / paymentPause：description 为工作流编辑器中的静态文案；
 *   userInput 的 inputForm 仅保留字段名/标签/类型/必填。
 * - agentAsk / workflowBuilderPreview：仅保留工具调用 ID。
 */
const projectLangfuseInteractiveParams = (
  leaf: InteractiveNodeResponseType
): Record<string, unknown> => {
  switch (leaf.type) {
    case 'userSelect':
      return { description: leaf.params.description };
    case 'userInput':
      return {
        description: leaf.params.description,
        inputForm: leaf.params.inputForm.map(({ key, label, type, required }) => ({
          key,
          label,
          type,
          required
        }))
      };
    case 'paymentPause':
      return { description: leaf.params.description, continue: leaf.params.continue };
    case 'agentAsk':
    case 'workflowBuilderPreview':
      return { toolCallId: leaf.params.toolCallId };
    default:
      return {};
  }
};

/**
 * 交互载荷判别：消息项 interactive 字段是宽联合（含旧版字符串副本、plan 状态等形状），
 * 只有“对象且带字符串 type”的载荷才进入解包与叶子校验。
 */
const isLangfuseInteractivePayload = (value: unknown): value is WorkflowInteractiveResponseType =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === 'string';

/**
 * 上报出口只投影“最终展示交互”的结构信息，不变量：续跑快照、调度状态与运行时用户输入
 * 不得进入 trace.output。
 *
 * 1. 复用 extractDeepestInteractive 解包嵌套包装（childrenInteractive / loopInteractive /
 *    loopRunInteractive 等），loopHistory / loopResult 等内部续跑快照随整层包装一起丢弃。
 * 2. 用 isValidInteractive（叶子 Schema 校验）收窄解包结果，非叶子或载荷不完整的交互不上报。
 * 3. 按叶子类型投影结构化 params（见 projectLangfuseInteractiveParams）。
 */
const projectLangfuseInteractive = (value: unknown): LangfuseTraceInteractiveType | undefined => {
  if (!isLangfuseInteractivePayload(value)) return undefined;

  const leaf = extractDeepestInteractive(value);
  if (!isValidInteractive(leaf)) return undefined;

  return {
    type: leaf.type,
    params: projectLangfuseInteractiveParams(leaf)
  };
};

/** 按白名单投影消息项，剥离输入上下文、恢复上下文与内部状态。 */
const projectLangfuseTraceOutputItem = (item: AIChatItemValueItemType): AIChatItemValueItemType => {
  const projected: Record<string, unknown> = {};
  for (const key of langfuseTraceOutputItemKeys) {
    const value = item[key];
    if (value === undefined || value === null) continue;
    if (key === 'interactive') {
      const projectedInteractive = projectLangfuseInteractive(value);
      if (projectedInteractive !== undefined) projected.interactive = projectedInteractive;
      continue;
    }
    projected[key] = value;
  }
  return projected as AIChatItemValueItemType;
};

/** 结果必须是“消息项对象数组”：排除字符串占位（如 "[Truncated]"）与空元素。 */
const isLangfuseMessageItemArray = (value?: string) => {
  if (value === undefined) return false;
  try {
    const parsed = JSON.parse(value);
    return (
      Array.isArray(parsed) &&
      parsed.every((item) => !!item && typeof item === 'object' && !Array.isArray(item))
    );
  } catch {
    return false;
  }
};

/**
 * 序列化 trace.output。
 *
 * 1. 只序列化白名单字段，输入与恢复上下文不上报；交互对象只保留展示字段。
 * 2. 先取最近的完整消息项（最多 LANGFUSE_MAX_ARRAY_LENGTH 条），避免通用序列化按条数
 *    截断时丢掉最终答复、并在数组里混入 "[Truncated]" 字符串。
 * 3. 总长度仍超限时继续丢弃较早的项，保证结果始终是消息项对象数组。
 */
export const serializeLangfuseTraceOutput = (values: AIChatItemValueItemType[]): string => {
  const projected = getLangfuseTraceOutput(values).map(projectLangfuseTraceOutputItem);
  const items = projected.slice(-LANGFUSE_MAX_ARRAY_LENGTH);

  for (let start = 0; start < items.length; start++) {
    const serialized = serializeLangfuseValue(items.slice(start), {
      keepExcludedKeys: langfuseTraceOutputAllowedKeys
    });
    if (isLangfuseMessageItemArray(serialized)) return serialized as string;
  }

  // 兜底：单条消息项自身超限时保留其可见文本并标记截断，仍然返回数组。
  const last = items[items.length - 1];
  const content = (last?.text?.content ?? last?.reasoning?.content ?? '').slice(
    0,
    LANGFUSE_MAX_STRING_LENGTH
  );
  return JSON.stringify([{ text: { content: content ? `${content}...[truncated]` : '' } }]);
};

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
