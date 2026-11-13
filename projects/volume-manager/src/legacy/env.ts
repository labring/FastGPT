/**
 * 隔离式旧版无标签存储卷配置与契约（legacy 专用模块，不修改主 env.ts 与 IVolumeDriver）。
 */
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';

const DEFAULT_LEGACY_VOLUME_PREFIXES = ['fastgpt-session-'] as const;

/** 旧卷名称不匹配允许的前缀白名单时抛出，由路由层映射为 HTTP 403。 */
export class LegacyVolumeForbiddenPrefixError extends Error {
  constructor(claimName: string) {
    super(`Volume "${claimName}" does not match allowed legacy volume prefixes`);
    this.name = 'LegacyVolumeForbiddenPrefixError';
  }
}

export type ILegacyVolumeCleaner = {
  exists(claimName: string): Promise<boolean>;
  remove(claimName: string): Promise<void>;
};

/**
 * 解析旧卷前缀白名单（环境变量 `VM_LEGACY_VOLUME_PREFIXES`，逗号分隔）。
 *
 * 每个前缀统一补齐末尾 `-`，防止配置如 `fastgpt-session` 意外匹配非沙箱前缀卷。
 */
export function getLegacyAllowedVolumePrefixes(
  rawValue: string | undefined = process.env.VM_LEGACY_VOLUME_PREFIXES
): string[] {
  const rawItems =
    typeof rawValue === 'string' && rawValue.trim().length > 0
      ? rawValue.split(',')
      : [...DEFAULT_LEGACY_VOLUME_PREFIXES];

  const normalized = rawItems
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .map((item) => (item.endsWith('-') ? item : `${item}-`));

  return normalized.length > 0 ? normalized : [...DEFAULT_LEGACY_VOLUME_PREFIXES];
}

/**
 * 校验目标卷名符合 DNS label 规范且命中旧版沙箱卷前缀白名单，
 * 严禁操作 `fastgpt-mongo`、`fastgpt-pg`、`fastgpt-minio` 等基础设施持久卷。
 */
export function assertLegacyVolumePrefixAllowed(
  claimName: string,
  allowedPrefixes: string[] = getLegacyAllowedVolumePrefixes()
): string {
  const parsedName = SandboxVolumeNameSchema.parse(claimName);
  const matched = allowedPrefixes.some((prefix) => parsedName.startsWith(prefix));
  if (!matched) {
    throw new LegacyVolumeForbiddenPrefixError(parsedName);
  }
  return parsedName;
}
