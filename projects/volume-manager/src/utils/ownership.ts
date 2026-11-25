export const FASTGPT_VOLUME_LABELS = {
  app: 'fastgpt',
  'managed-by': 'fastgpt-volume-manager'
} as const;

const FOREIGN_PREFIXES = ['app.kubernetes.io/', 'com.docker.compose.'] as const;
const FOREIGN_EXACT_KEYS = ['k8s-app', 'helm.sh/chart'] as const;

/** 判断卷标签是否完全匹配 FastGPT volume-manager 的托管所有权标记。 */
export const isManagedLabels = (labels?: Record<string, string> | null): boolean =>
  labels?.app === FASTGPT_VOLUME_LABELS.app &&
  labels?.['managed-by'] === FASTGPT_VOLUME_LABELS['managed-by'];

/**
 * 判断存量无标签（或仅部分 FastGPT 标签）持久卷是否可由只读检查/清理流程安全识别。
 *
 * 显式拦截携带其他平台、Helm 或 Compose 所有权标记的卷，避免在 `allowLegacyUnlabeled` 模式下误操作外部资源。
 *
 * 移除窗口（>= 4.19.0）：待 4.18.0 存量无标签持久卷全部完成迁移清理后整体移除本函数。
 */
export const canAdoptLegacyLabels = (labels?: Record<string, string> | null): boolean => {
  if (!labels) return true;
  if (labels.app && labels.app !== FASTGPT_VOLUME_LABELS.app) return false;
  if (labels['managed-by'] && labels['managed-by'] !== FASTGPT_VOLUME_LABELS['managed-by']) {
    return false;
  }
  if (FOREIGN_EXACT_KEYS.some((key) => Boolean(labels[key]))) return false;
  return !Object.keys(labels).some((key) =>
    FOREIGN_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
};
