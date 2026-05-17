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
 *    - 压缩目标：保留可续跑上下文，具体摘要粒度交给模型判断
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
   * - 依赖 5 个步骤，每个 4k → 20k (20%) ⚠️ 触发压缩
   */
  DEPENDS_ON_THRESHOLD: 0.15, // 15% 触发压缩

  /**
   * === 对话历史 ===
   *
   * 触发场景：对话历史（含所有 user/assistant/tool 消息）超过阈值
   * 内容特点：动态累积，触发后会整体压成 checkpoint string
   *
   * 示例（maxContext=100k）：
   * - 初始 20k + 6 轮对话(34k) = 54k (54%) ✅ 不触发
   * - 再 1 轮 = 60k (60%) ⚠️ 触发压缩 → checkpoint
   * - checkpoint 保存长程上下文、当前任务和未完成工具上下文
   */
  MESSAGE_THRESHOLD: 0.8,

  /**
   * === 单个 tool response ===
   *
   * 触发场景：单个 tool 返回的内容超过绝对大小限制
   * 内容特点：单次 tool 调用的响应（如搜索结果、文件内容等）
   *
   * 示例（maxContext=100k）：
   * - tool response = 8k (8%) ✅ 不触发
   * - tool response = 15k (15%) ⚠️ 触发压缩
   */
  SINGLE_TOOL_MAX: 0.5,

  /**
   * === 文件读取结果压缩 ===
   *
   * 触发场景：文件解析工具返回的文件内容超过限制
   * 内容特点：通常是大型文档、PDF 等文件的完整文本内容
   *
   * 示例（maxContext=100k）：
   * - 文件内容 = 40k (40%) ✅ 不触发
   * - 文件内容 = 60k (60%) ⚠️ 触发压缩
   */
  FILE_READ_RESPONSE_MAX: 0.5, // 50% 触发压缩

  /**
   * === 分块压缩 ===
   */
  CHUNK_SIZE_RATIO: 0.5, // 单块不超过 maxContext 的 50%

  /**
   * === 知识库检索工具的压缩阈值 ===
   * 策略：使用 LLM 根据查询相关性自动选择最相关的一半分块
   */
  DATASET_SEARCH_SELECTION_RATIO: 0.2
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
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.DEPENDS_ON_THRESHOLD)
    },
    // 对话历史压缩阈值
    messages: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.MESSAGE_THRESHOLD)
    },

    // 单个 tool response 压缩阈值
    singleTool: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.SINGLE_TOOL_MAX)
    },

    // 文件读取结果压缩阈值
    fileReadResponse: {
      threshold: Math.floor(maxContext * COMPRESSION_CONFIG.FILE_READ_RESPONSE_MAX)
    },

    // 分块压缩中每个分块的分割大小，用来划分原始大块的内容。
    chunkSize: Math.floor(maxContext * COMPRESSION_CONFIG.CHUNK_SIZE_RATIO),

    // 知识库检索工具阈值，到达阈值会触发选择最相关的一半分块内容（筛选）
    datasetSearchSelection: Math.floor(
      maxContext * COMPRESSION_CONFIG.DATASET_SEARCH_SELECTION_RATIO
    )
  };
};
