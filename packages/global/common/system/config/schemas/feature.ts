import z from 'zod';

export const FeatureConfigSchema = z.strictObject({
  hideChatCopyrightSetting: z.boolean().default(false),
  multipleDataToBase64: z.boolean().default(false),
  enableTeamPluginUpload: z.boolean().default(false),
  showOpenaiAccount: z.boolean().default(false).meta({
    deprecated: true,
    description: '已弃用；保留既有启用状态，仅允许关闭，关闭后不可重新开启'
  }),
  enableTeamModel: z.boolean().default(false),
  // 业务入口可见性开关（决定各接入渠道在前端是否可见）
  showDatasetFeishu: z.boolean().default(true),
  showDatasetYuque: z.boolean().default(true),
  showDatasetDingtalk: z.boolean().default(true),
  showPublishFeishu: z.boolean().default(true),
  showPublishDingtalk: z.boolean().default(true),
  showPublishWecom: z.boolean().default(false),
  showPublishOffiaccount: z.boolean().default(true),
  showPublishWechat: z.boolean().default(true),
  showComplianceCopywriting: z.boolean().default(false)
});

/**
 * Feature 域读取兼容 Schema（读宽写严）。
 *
 * 兼容原因：已部署环境的 `system_instance_configs`（`domain: 'feature'`）或历史快照在滚动升级窗口及
 * 4.18 废弃字段清理前，可能仍存有历史 `agentEngine: 'piAgent' | 'fastAgent'`。
 * `FeatureConfigSchema` 保持 `z.strictObject`（保留 `.shape` 供 `makeDomainOverrideSchema` 派生严格写入校验），
 * 新请求写入 `agentEngine` 仍被明确拒绝；全量快照反序列化（`SystemInstanceConfigSchema` / `parseSystemInstanceConfig`）
 * 通过 `z.preprocess` 剥离历史 `agentEngine` 字段后再交由 `FeatureConfigSchema` 校验，防止 `z.strictObject` 崩溃。
 * 兼容窗口：待存量部署完成 4.18 系统配置迁移清理且度过滚动升级窗口后可移除。
 */
export const FeatureConfigReadSchema = z.preprocess((value) => {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'agentEngine')
  ) {
    const { agentEngine: _legacyAgentEngine, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
}, FeatureConfigSchema);
