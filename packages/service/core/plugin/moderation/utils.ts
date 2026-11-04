import { ModerationSecretMaskedValue } from '@fastgpt/global/core/plugin/moderation/constants';
import type { ModerationPluginConfigType } from '@fastgpt/global/core/plugin/moderation/type';


/**
 * 从插件声明的 JSON Schema `secretSchema` 中提取密钥字段名。
 *
 * 审查插件的配置是扁平一层（不嵌套），因此只看顶层 `properties`。
 * 带 `isSecret: true` 的字段需要加密存储和脱敏展示，其余字段（如策略 ID）按普通配置处理。
 */
export const getModerationSecretKeys = (secretSchema?: unknown): Set<string> => {
  if (!secretSchema || typeof secretSchema !== 'object') return new Set();

  const properties = (secretSchema as { properties?: unknown }).properties;
  if (!properties || typeof properties !== 'object') return new Set();

  return new Set(
    Object.entries(properties as Record<string, unknown>).flatMap(([key, field]) => {
      if (!field || typeof field !== 'object') return [];
      return (field as { isSecret?: unknown }).isSecret === true ? [key] : [];
    })
  );
};

/** 字段是否已有配置值。空字符串与 undefined/null 均视为未配置 */
const hasValue = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return false;

  // 加密存储结构：{ secret: '<cipher>' }
  if (typeof value === 'object' && 'secret' in (value as object)) {
    const secret = (value as { secret?: unknown }).secret;
    return typeof secret === 'string' && secret.length > 0;
  }

  return true;
};

/**
 * 将前端提交的配置值与已保存的配置合并。
 *
 * 密钥字段的特殊处理：
 * - 传入脱敏占位值：保留已保存的密文，不拿掩码覆盖真实密钥
 * - 传入空值：删除该字段（用户主动清空）
 * - 传入真实值：交给调用方用 `encryptModerationSecrets` 加密
 */
export const mergeModerationSecretsForUpdate = ({
  incoming,
  existing,
  secretKeys
}: {
  incoming?: Record<string, unknown> | null;
  existing?: Record<string, unknown> | null;
  secretKeys: Set<string>;
}): Record<string, unknown> => {
  if (incoming === null || incoming === undefined) return { ...(existing ?? {}) };

  const result: Record<string, unknown> = { ...(existing ?? {}) };

  Object.entries(incoming).forEach(([key, value]) => {
    if (secretKeys.has(key) && value === ModerationSecretMaskedValue) {
      // 掩码表示未编辑：保留已有密文；已有值为空则直接不写该字段
      const existingValue = existing?.[key];
      if (hasValue(existingValue)) {
        result[key] = existingValue;
      } else {
        delete result[key];
      }
      return;
    }

    if (value === undefined || value === null || value === '') {
      delete result[key];
      return;
    }

    result[key] = value;
  });

  return result;
};

/**
 * 将密钥字段加密，非密钥字段保留原值。
 *
 * 已经加密过的值（`{ secret }` 结构且 secret 非空）不再重复加密，避免二次加密。
 */
export const encryptModerationSecrets = ({
  secretsVal,
  secretKeys,
  encrypt
}: {
  secretsVal?: Record<string, unknown> | null;
  secretKeys: Set<string>;
  encrypt: (plain: string) => string;
}): Record<string, unknown> | undefined => {
  if (!secretsVal) return undefined;

  return Object.fromEntries(
    Object.entries(secretsVal).flatMap(([key, value]) => {
      if (!secretKeys.has(key)) return [[key, value]];

      if (value === undefined || value === null || value === '') return [];

      // 已加密（含掩码被解析后的已有密文）直接透传
      if (typeof value === 'object' && 'secret' in (value as object)) {
        const secret = (value as { secret?: unknown }).secret;
        if (typeof secret === 'string' && secret.length > 0) return [[key, value]];
        return [];
      }

      return [[key, { secret: encrypt(String(value)) }]];
    })
  );
};

/**
 * 管理接口的读取视图：密钥字段替换为脱敏占位值，绝不返回明文或密文。
 *
 * 非密钥字段（如策略 ID、接入点）原样返回，因为它们是用户需要看到并编辑的配置。
 */
export const maskModerationSecrets = ({
  secretsVal,
  secretKeys
}: {
  secretsVal?: Record<string, unknown> | null;
  secretKeys: Set<string>;
}): Record<string, unknown> | undefined => {
  if (!secretsVal) return undefined;

  return Object.fromEntries(
    Object.entries(secretsVal).map(([key, value]) => [
      key,
      secretKeys.has(key) && hasValue(value) ? ModerationSecretMaskedValue : value
    ])
  );
};

/** 是否已保存过任意字段配置。用于区分「未配置」与「配置为空」 */
export const hasConfiguredModerationSecrets = ({
  secretsVal,
  secretKeys = new Set()
}: {
  secretsVal?: Record<string, unknown> | null;
  secretKeys?: Set<string>;
}): boolean => {
  if (!secretsVal) return false;
  // 若插件声明了密钥字段，则至少包含一个有效的密钥字段
  if (secretKeys.size > 0) {
    return [...secretKeys].some((key) => hasValue(secretsVal[key]));
  }
  // 若插件未声明任何密钥字段（例如纯关键词等通用参数），只要任意字段有值即视为已配置
  return Object.values(secretsVal).some((val) => hasValue(val));
};

/**
 * 运行时使用的配置值：解开密钥字段的密文。
 *
 * 只在服务端内部调用（实际发起审查前），结果不得写入日志或返回给前端。
 * 解密失败时回退为空字符串，避免一个坏字段让整个插件不可用。
 */
export const decryptModerationSecrets = ({
  secretsVal,
  secretKeys,
  decrypt
}: {
  secretsVal?: Record<string, unknown> | null;
  secretKeys: Set<string>;
  decrypt: (cipher: string) => string;
}): Record<string, unknown> | undefined => {
  if (!secretsVal) return undefined;

  return Object.fromEntries(
    Object.entries(secretsVal).flatMap(([key, value]) => {
      if (!secretKeys.has(key)) return [[key, value]];

      if (value === ModerationSecretMaskedValue) return [];
      if (typeof value !== 'object' || value === null || !('secret' in value)) return [];

      const secret = (value as { secret?: unknown }).secret;
      if (typeof secret !== 'string' || secret.length === 0) return [];

      try {
        return [[key, decrypt(secret)]];
      } catch {
        return [];
      }
    })
  );
};
