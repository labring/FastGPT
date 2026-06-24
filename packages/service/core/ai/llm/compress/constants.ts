/**
 * request messages checkpoint 的起始标签。
 * 用于 compress/index.ts 中识别、规范化和生成隐藏历史 checkpoint。
 */
export const CONTEXT_CHECKPOINT_START_TAG = '<context_checkpoint>';

/**
 * request messages checkpoint 的结束标签。
 * 用于 compress/index.ts 中识别、规范化和生成隐藏历史 checkpoint。
 */
export const CONTEXT_CHECKPOINT_END_TAG = '</context_checkpoint>';

/**
 * token 预算转字符预算时使用的近似换算比例。
 * 用于 compress/index.ts 的本地 head-tail 截断、二分缩短和内容分块。
 */
export const APPROX_CHARS_PER_TOKEN = 3;

/**
 * LLM 分块压缩合并结果仍超预算时，最多再次压缩合并结果的轮数。
 * 用于 compressLargeContent 的 merge compression 阶段。
 */
export const MERGED_COMPRESSION_MAX_ROUNDS = 2;

/**
 * 本地 head-tail 截断时，字符预算分配给开头内容的比例。
 * 用于 compress/index.ts 的 truncateContentByHeadTail。
 */
export const FINAL_HEAD_RATIO = 0.6;

/**
 * request messages 调用 LLM 生成 checkpoint 时的软目标比例。
 * 用于 getCompressRequestMessagesUserPrompt 的 output_budget。
 */
export const CHECKPOINT_OUTPUT_TARGET_RATIO = 0.2;

/**
 * 压缩相关比例阈值的最小 token 数。
 * 用于避免小上下文模型按比例计算出的压缩目标过小；实际值不会超过模型 maxContext。
 */
export const COMPRESSION_MIN_TOKEN_LIMIT = 4096;

/**
 * request messages 调用 LLM 生成 checkpoint 时的最小软目标 token 数。
 * 保留旧常量名，避免调用方理解成本；实际值与通用压缩最小值一致。
 */
export const CHECKPOINT_OUTPUT_MIN_TOKENS = COMPRESSION_MIN_TOKEN_LIMIT;

/**
 * request checkpoint LLM 输出 token 可接受比例。
 * 用于判断 completion token 是否明显超过软目标；超过时记录警告但仍以最终 messages token 校验为准。
 */
export const REQUEST_CHECKPOINT_COMPLETION_ACCEPT_CONTEXT_RATIO = 0.5;

/**
 * 大内容压缩结果过短时，若压缩结果已占目标预算的该比例以上，则不再追加原文摘录。
 * 用于 appendSourceExcerptForUnderfilledCompression。
 */
export const SOURCE_ANCHOR_APPEND_SKIP_RATIO = 0.8;

/**
 * 大内容压缩后最多追加的原文结构锚点数量。
 * 用于 appendSourceAnchorsWithinBudget，避免锚点列表挤占摘要主体。
 */
export const SOURCE_ANCHOR_APPEND_MAX_COUNT = 12;

/**
 * tool response 原文直接返回阈值比例。
 * 用于 compressToolResponse：响应不超过 20% context 时不做任何处理。
 */
export const TOOL_RESPONSE_DIRECT_RETURN_CONTEXT_RATIO = 0.2;

/**
 * tool response 进入 LLM 压缩的阈值比例。
 * 用于 compressToolResponse：本地轻量处理后仍超过 50% context 才调用 LLM 压缩。
 */
export const TOOL_RESPONSE_LIGHT_PROCESS_CONTEXT_RATIO = 0.5;

/**
 * 本地截断时插入中间省略内容的标记。
 * 用于 head-tail 截断，明确告知后续模型中间内容被省略。
 */
export const TRUNCATED_MARKER =
  '\n\n... [content truncated: middle omitted to fit token budget] ...\n\n';

/**
 * Depends on（系统提示词中的步骤历史）压缩触发比例。
 *
 * 拼接依赖步骤完整 response 后，超过模型上下文 15% 时触发压缩。
 * 用于 calculateCompressionThresholds().dependsOn。
 */
export const DEPENDS_ON_THRESHOLD_RATIO = 0.15;

/**
 * 对话历史压缩触发比例。
 *
 * messages + tools schema 超过模型上下文 80% 时，尝试压缩成 checkpoint。
 * 用于 compressRequestMessages 的触发阈值。
 */
export const MESSAGE_THRESHOLD_RATIO = 0.8;

/**
 * 文件读取结果压缩触发比例。
 *
 * 文件解析工具返回的大型文档内容超过模型上下文 50% 时触发压缩。
 * 用于 calculateCompressionThresholds().fileReadResponse。
 */
export const FILE_READ_RESPONSE_MAX_RATIO = 0.5;

/**
 * 大文本分块压缩的单块比例。
 *
 * 分块阶段单块不超过模型上下文 50%，避免单次压缩请求过大。
 * 用于 compressLargeContent 的 splitIntoChunks 分块预算。
 */
export const CHUNK_SIZE_RATIO = 0.5;

/**
 * 知识库检索结果相关性筛选触发比例。
 *
 * 检索片段总 token 超过模型上下文 20% 时，调用 LLM 选择最相关片段。
 * 用于 dispatchAgentDatasetSearch 的 chunk selection 触发阈值。
 */
export const DATASET_SEARCH_SELECTION_RATIO = 0.2;

/**
 * 计算压缩场景中的比例 token 阈值。
 *
 * 压缩阈值按比例计算后至少保留 4096 token，避免小上下文模型过早压缩或 output_budget 过小；
 * 但阈值不会超过模型 maxContext，避免压缩目标反向大于模型可承载上下文。
 */
export const getCompressionTokenLimit = (maxContext: number, ratio: number) =>
  Math.min(maxContext, Math.max(COMPRESSION_MIN_TOKEN_LIMIT, Math.floor(maxContext * ratio)));

/**
 * 计算各场景的压缩阈值
 * @param maxContext - 模型的最大上下文长度
 * @returns 各场景的具体 token 数阈值
 */
export const calculateCompressionThresholds = (maxContext: number) => {
  return {
    // Depends on 压缩阈值
    dependsOn: {
      threshold: Math.floor(maxContext * DEPENDS_ON_THRESHOLD_RATIO)
    },
    // 对话历史压缩阈值
    messages: {
      threshold: getCompressionTokenLimit(maxContext, MESSAGE_THRESHOLD_RATIO)
    },

    // 单个 tool response 兼容阈值；新链路直接使用 0.2/0.5 分层常量。
    singleTool: {
      threshold: getCompressionTokenLimit(maxContext, TOOL_RESPONSE_LIGHT_PROCESS_CONTEXT_RATIO)
    },

    // 文件读取结果压缩阈值
    fileReadResponse: {
      threshold: Math.floor(maxContext * FILE_READ_RESPONSE_MAX_RATIO)
    },

    // 分块压缩中每个分块的分割大小，用来划分原始大块的内容。
    chunkSize: Math.floor(maxContext * CHUNK_SIZE_RATIO),

    // 知识库检索工具阈值，到达阈值会触发选择最相关的一半分块内容（筛选）
    datasetSearchSelection: Math.floor(maxContext * DATASET_SEARCH_SELECTION_RATIO)
  };
};
