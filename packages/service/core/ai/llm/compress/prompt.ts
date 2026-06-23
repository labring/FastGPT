import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

/**
 * 从原文抽取生产场景通用的结构锚点。
 *
 * 这里只保留跨业务稳定成立的信息：字段名、工具名、ID、URL、路径、错误码、日期、数字和代码样式 token。
 * 不抽普通关键词和领域词表，避免压缩结果被 benchmark 或某类英文报告形状污染。
 */
export const extractExactAnchors = (content: string, limit = 80) => {
  const anchors: string[] = [];
  const seen = new Set<string>();
  const push = (anchor: string) => {
    const normalized = anchor.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length < 3 || normalized.length > 120) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    anchors.push(normalized);
    return anchors.length >= limit;
  };
  const source = content.slice(0, 12000);

  const patterns: RegExp[] = [
    /`([^`\n]{3,120})`/g,
    /"([A-Za-z_][A-Za-z0-9_-]{2,})"\s*:/g,
    /'([A-Za-z_][A-Za-z0-9_-]{2,})'\s*:/g,
    /^\s{0,3}#{1,6}\s+([^#\n]{3,120})$/gm,
    /^\s*[-*]?\s*([\p{L}\p{N}_][\p{L}\p{N}_ .()[\]【】《》「」'"/-]{1,59})\s*[:：]/gmu,
    /^\s*(?:(?:\d+(?:\.\d+)+)\s+|\d+[.)、]\s*|[一二三四五六七八九十百千]+[、.]\s*)([\p{L}\p{N}_][\p{L}\p{N}_ .()[\]【】《》「」'"/-]{2,79})$/gmu,
    /[【「《]([^】」》\n]{2,80})[】」》]/g,
    /^\s*[-*]?\s*([A-Za-z_][A-Za-z0-9_ -]{2,60})\s*:/gm,
    /<\/?([A-Za-z][A-Za-z0-9_-]{2,})\b[^>]*>/g,
    /https?:\/\/[^\s"'(),}\]]+/gi,
    /\b[A-Z]{2,}(?:-[A-Z0-9]+)*\b/g,
    /\b[A-Za-z_][A-Za-z0-9_]*_[A-Za-z0-9_]+\b/g,
    /\b[A-Za-z][A-Za-z0-9]+-[A-Za-z0-9-]+\b/g,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?\b/g,
    /\b\d+(?:[.,:/-]\d+)*(?:%|[A-Za-z]+)?\b/g,
    /(?:^|\s)((?:\.{0,2}\/|\/)[\w@./-]{3,})/g
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (push(match[1] ?? match[0])) return anchors;
    }
  }

  return anchors;
};

/**
 * 将结构锚点渲染成 prompt 中的显式候选列表。
 *
 * 这不是普通关键词召回，只提醒模型优先原样保留字段名、路径、ID、数字等跨业务稳定信息。
 */
const renderExactAnchors = (content: string, limit?: number) => {
  const anchors = extractExactAnchors(content, limit);
  if (anchors.length === 0) return '';

  return `<structural_anchor_candidates>
${anchors.map((anchor) => `- ${anchor}`).join('\n')}
</structural_anchor_candidates>

`;
};

/**
 * 将历史消息格式化成 checkpoint 压缩模型可读的 JSON。
 *
 * 这里只暴露压缩需要的协议字段，避免把无关运行时字段塞进 prompt 增加 token 和噪声。
 */
const formatMessagesForCheckpoint = (messages: ChatCompletionMessageParam[]) =>
  JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: message.content,
      reasoning_content: message.reasoning_content,
      tool_calls: message.role === 'assistant' ? message.tool_calls : undefined,
      tool_call_id: message.role === 'tool' ? message.tool_call_id : undefined
    })),
    null,
    2
  );

export const getCompressRequestMessagesPrompt = async () => {
  return `你是 Agent 历史上下文 checkpoint 压缩专家。你的任务是把用户提供的对话历史压缩成一段可继续工作的高保真上下文摘要 string。

你的优先级顺序：
1. 保留后续继续任务必须依赖的信息。
2. 精确保留字段名、工具名、函数名、参数名、ID、路径、URL、错误码、数字、日期和明确约束。
3. 保留原文中的关键实体、对象、地点、人物、组织、状态、结果、原因、时间线和数值关系。
4. 删除寒暄、重复确认、无结论推理和低价值展开。

## 输出要求

1. 只输出一个 <context_checkpoint>...</context_checkpoint> 文本块。
2. 不要输出 JSON，不要输出 Markdown 代码块，不要输出解释。
3. 旧工具调用只总结关键输入、关键结果和失败原因；不要保留 tool_call_id，不伪造工具执行。
4. 所有小节都可以为空，但不要删除小节标题，便于后续机器读取。
5. 原文主要是中文就用中文输出，原文主要是英文就用英文输出；不要翻译名称、字段、ID、路径、URL、错误码、代码和工具参数。

## 必须保留的信息

- 用户长期目标和当前任务
- 用户明确约束、偏好、禁止事项
- 已完成的工作、已做决策、失败但影响后续选择的尝试
- 关键事实、数据、文件名、资源名、接口名、错误信息
- 工具调用得到的关键结果、失败原因和后续依赖
- 未解决问题、下一步应做事项

## 事实保留规则

- 用紧凑 bullet 保留“实体/对象 -> 属性/状态/结论/数值/原因”的事实关系，不要只写泛化结论。
- 人名、地名、组织名、产品名、资源名、字段值、标题、编号、金额、比例、时间、地址和错误文本要尽量原样保留。
- 对中文内容，不要把具体事实改写成“相关信息、若干项目、一些结果、该问题”等空泛表达。
- 如果多个事实同属一个主题，可以合并成一行，但不能丢掉具体实体和值。

## 结构锚点规则

- 对 structural_anchor_candidates 和 tool_call_memory 里的字段名、函数名、参数名、ID、路径、URL、错误码、数字、日期，优先原样保留。
- 不要为了保留锚点而堆无关关键词；锚点必须服务于后续执行、定位资源、复现工具结果或理解约束。
- 不要把具体工具名、机构名、文件名、接口名压成“相关工具/某机构/该文件/接口”。

## 忠实性要求

- 不要添加原文不存在的事实。
- 不确定的信息必须标注为不确定。
- 可以概括和重组表达，但不能改变事实、数字、名称、状态。

## 输出模板

<context_checkpoint>
# Context Checkpoint

## User Goal

## Current Task

## Important Constraints

## Decisions Made

## Facts / Data To Preserve

## Entity / Value / Relation Ledger

## Exact Keys / Labels / Names To Preserve
- tools/functions:
- argument_or_field_keys:
- ids/paths/urls:
- error_codes_or_numbers:

## Tool Results Worth Remembering

## Files / Resources Mentioned

## Open Questions

## Next Steps
</context_checkpoint>`;
};

export const getCompressRequestMessagesUserPrompt = async ({
  messages,
  outputTokenLimit,
  toolCallMemory
}: {
  messages: ChatCompletionMessageParam[];
  outputTokenLimit?: number;
  toolCallMemory?: string;
}) => {
  const histories = formatMessagesForCheckpoint(messages);

  return `<histories>
${histories}
</histories>

${outputTokenLimit ? `<output_budget>\nTarget maximum output tokens: ${outputTokenLimit}. Use compact bullets and omit nonessential prose.\n</output_budget>\n\n` : ''}${toolCallMemory ? `${toolCallMemory}\n\n` : ''}${renderExactAnchors(histories, 100)}
请执行历史上下文 checkpoint 压缩，只输出 <context_checkpoint>...</context_checkpoint>。
`;
};

export const getCompressLargeContentPrompt = async () => {
  return `你是一个生产场景通用文本压缩专家。请在保留后续使用所需事实的前提下，压缩用户提供的长文本。

核心目标：
- 保真优先于文风；只删除低价值信息，不添加原文不存在的信息。
- 优先保留稳定结构信息：标题、字段名、编号、ID、路径、URL、错误码、数字、日期、工具名、函数名、参数 key、返回字段 key。
- 同时保留语义事实信息：实体、对象、地点、人物、组织、状态、结果、原因、条件、时间线、数值和比较关系。

## 压缩原则

1. 只能删除、概括和重组原文已有信息，不能新增事实。
2. 保留核心结论、约束、状态、因果关系、失败原因、下一步依赖和支撑结论的关键事实。
3. 用高密度 bullet 或短段落输出“主题 -> 事实/数值/关系”，不要只输出抽象摘要。
4. 对 structural_anchor_candidates 中确实重要的结构锚点，优先原样保留。
5. 删除重复描述、修辞、铺垫、泛泛背景、例行说明和无新增事实的长句。
6. 原文主要是中文时使用中文，原文主要是英文时使用英文；不要翻译字段名、函数名、参数名、路径、URL、ID、错误码和专有名称。
7. 不要把具体人名、地名、组织名、产品名、资源名、标题、地址、金额、比例、日期、编号改写成“某人、某地、某机构、若干项目、相关数据”。
8. 如果原文是问答、报告、会议记录或多文档材料，优先保留可回答问题的事实，而不是只保留背景和结论。

## 输出要求

只输出压缩后的文本内容，不要包含解释、前后缀说明或 Markdown 代码块标记。

## 推荐输出形态

- 使用紧凑 bullet，每行保留一个主题或原文标签下的关键事实。
- 优先用原文标题、字段、问题、条目名称作为 bullet 前缀，再接具体事实、数值或结论。
- 预算紧张时先缩短解释性文字，再删除重复事实；不要先删除名称、标签、数字和结论。`;
};

export const getCompressLargeContentUserPrompt = async ({
  content,
  outputTokenLimit
}: {
  content: string;
  outputTokenLimit?: number;
}) => {
  return `<content>
${content}
</content>

${
  outputTokenLimit
    ? `<output_budget>\nTarget maximum output tokens: ${outputTokenLimit}.
Use compact bullets; preserve original labels, names, numbers and conclusions first.\n</output_budget>\n\n`
    : ''
}${renderExactAnchors(content)}
请执行压缩操作。`;
};
