/**
 * 实例配置快照测试 helper。
 *
 * 背景：commit 94ae033d7 起，大量运行时消费点从 `serviceEnv.X` 改为
 * `getSystemInstanceConfig().<domain>.<field> ?? serviceEnv.X`（或 `||` 形式）。
 * `getSystemInstanceConfig()` 首次调用时会：
 *   1. 优先采纳 `global.systemInstanceConfig` 作为快照并缓存到模块级变量；
 *   2. 否则用 `resolveSystemInstanceConfig({})` 生成"填满全部 schema 默认值"的快照。
 * 因此生产语义下快照叶子字段永远存在，`?? serviceEnv` 兜底分支不会触发；
 * 而存量单测是通过改写 `serviceEnv` 来驱动被测行为的，于是这些测试会失败。
 *
 * 解决办法：在测试文件顶部（所有 import 之前）把 `global.systemInstanceConfig`
 * 预置为一个"域对象存在、叶子字段全部缺省"的种子快照。这样：
 *   - 域对象存在 → `snapshot.security.maxLoginSession` 这类读取不会 TypeError；
 *   - 叶子缺省（undefined）→ `?? serviceEnv` / `|| serviceEnv` 兜底分支生效，
 *     测试继续由 serviceEnv 驱动，保持原有测试意图。
 *
 * 注意：本 helper 只提供"叶子缺省"的骨架，不填任何叶子值。若某个测试想验证
 * "实例配置优先于 env"的新语义，应直接写快照叶子值
 * （`(global as any).systemInstanceConfig.<domain>.<field> = value`），不要用种子快照。
 */

/**
 * 覆盖全部 11 个 domain 的叶子缺省快照骨架。
 *
 * 每次调用返回全新对象，避免多个测试文件（同一 worker 复用 global 时）互相污染。
 * 嵌套 domain（performance / providers / subservice）同样只保留"被消费的路径节点"，
 * 其余子对象留空由消费点的可选链/兜底处理。
 */
export const LEAF_ABSENT_SNAPSHOT = () => ({
  site: {},
  auth: {},
  security: {},
  feature: {},
  commercial: {},
  resource: {},
  performance: {
    workflow: {},
    parse: {},
    dataset: {},
    chat: {},
    streamResume: {},
    tracking: {},
    task: {},
    channel: {}
  },
  storage: {},
  vector: {},
  providers: {
    documentParse: { customPdf: {}, sangfor: {} },
    dataSource: {},
    externalProviderWorkflowVariables: []
  },
  subservice: {
    plugin: {},
    codeSandbox: {},
    aiProxy: {},
    mcp: {},
    agentSandbox: { provider: '', common: {}, sealosdevbox: {}, opensandbox: {}, proxy: {} }
  }
});
