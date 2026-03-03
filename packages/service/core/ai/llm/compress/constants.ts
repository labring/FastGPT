/**
 * Agent 上下文压缩配置常量
 *
 * ## 设计原则
 *
 * 1. **空间分配**
 *    - 输出预留：30%（模型生成答案 + 缓冲）
 *    - 系统提示词（Depends on）：15%
 *    - Agent 对话历史：55%
 *
 * 2. **压缩策略**
 *    - 触发阈值：接近空间上限时触发
 *    - 压缩目标：激进压缩，预留增长空间
 *    - 约束机制：单个 tool 有绝对大小限制
 *
 * 3. **协调关系**
 *    - Depends on 使用完整 response，需要较大空间（15%）
 *    - Agent 历史包含所有 tool responses，是动态主体（55%）
 *    - 单个 tool 不能过大，避免挤占其他空间（10%）
 */

export const COMPRESSION_CONFIG = {
  /**
   * === Depends on（系统提示词中的步骤历史）===
   *
   * 触发场景：拼接依赖步骤的完整 response 后，token 数超过阈值
   * 内容特点：包含多个步骤的完整执行结果（使用 response 而非 summary）
   *
   * 示例（maxContext=100k）：
   * - 依赖 3 个步骤，每个 4k → 12k (12%) ✅ 不触发
   * - 依赖 5 个步骤，每个 4k → 20k (20%) ⚠️ 触发压缩 → 12k
   */
  DEPENDS_ON_THRESHOLD: 0.15, // 15% 触发压缩
  DEPENDS_ON_TARGET: 0.12, // 压缩到 12%（预留 3% 缓冲）

  /**
   * === 对话历史 ===
   *
   * 触发场景：对话历史（含所有 user/assistant/tool 消息）超过阈值
   * 内容特点：动态累积，包含所有 tool responses
   *
   * 示例（maxContext=100k）：
   * - 初始 20k + 6 轮对话(34k) = 54k (54%) ✅ 不触发
   * - 再 1 轮 = 60k (60%) ⚠️ 触发压缩 → 30k
   * - 预留：55k - 30k = 25k（还能跑 4 轮）
   */
  MESSAGE_THRESHOLD: 0.8, // 55% 触发压缩
  MESSAGE_TARGET_RATIO: 0.5, // 压缩到 50%（即原 55% → 27.5%）

  /**
   * === 单个 tool response ===
   *
   * 触发场景：单个 tool 返回的内容超过绝对大小限制
   * 内容特点：单次 tool 调用的响应（如搜索结果、文件内容等）
   *
   * 示例（maxContext=100k）：
   * - tool response = 8k (8%) ✅ 不触发
   * - tool response = 15k (15%) ⚠️ 触发压缩 → 7k
   */
  SINGLE_TOOL_MAX: 0.5,
  SINGLE_TOOL_TARGET: 0.25,

  /**
   * === 分块压缩 ===
   *
   * 触发场景：当内容需要分块处理时（超过 LLM 单次处理能力）
   * 用途：将超大内容切分成多个块，分别压缩后合并
   *
   * 示例（maxContext=100k）：
   * - 单块最大：40k tokens
   * - 50k 内容 → 切分成 2 块，每块约 25k
   */
  CHUNK_SIZE_RATIO: 0.5 // 40%（单块不超过此比例）
} as const;

/**
 * 计算各场景的压缩阈值
 * @param maxContext - 模型的最大上下文长度
 * @returns 各场景的具体 token 数阈值
 */
export const calculateCompressionThresholds = (maxContext: number) => {
  return {
    // Depends on 压缩阈值
    dependsOn: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.DEPENDS_ON_THRESHOLD),
      target: Math.floor(maxContext * COMPRESSION_CONFIG.DEPENDS_ON_TARGET)
    },
    // 对话历史压缩阈值
    messages: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.MESSAGE_THRESHOLD),
      targetRatio: COMPRESSION_CONFIG.MESSAGE_TARGET_RATIO
    },

    // 单个 tool response 压缩阈值
    singleTool: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.SINGLE_TOOL_MAX),
      target: Math.floor(maxContext * COMPRESSION_CONFIG.SINGLE_TOOL_TARGET)
    },

    // 分块大小
    chunkSize: Math.floor(maxContext * COMPRESSION_CONFIG.CHUNK_SIZE_RATIO)
  };
};
