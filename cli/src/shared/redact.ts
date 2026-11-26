const SENSITIVE_KEY_PATTERN =
  /^(authorization|token|apikey|api_key|password|passwd|secret|cookie|set-cookie|x-api-key|rootkey)$/i;

/**
 * 将密钥脱敏为仅保留末 4 位的展示字符串；过短密钥全部遮蔽。
 */
export function maskSecret(secret: string): string {
  if (!secret) {
    return '';
  }
  if (secret.length <= 6) {
    return '******';
  }
  if (secret.startsWith('fastgpt-') && secret.length >= 14) {
    return `fastgpt-******${secret.slice(-4)}`;
  }
  return `******${secret.slice(-4)}`;
}

/**
 * 脱敏日志或错误文本中的 Bearer Token、Cookie、Query apiKey 与长格式 API Key。
 * 仅匹配 >= 24 位的 fastgpt-* 密钥形态，避免误伤 `/tmp/fastgpt-cli-*` 等路径或包名。
 */
export function redactText(input: string): string {
  if (!input) {
    return input;
  }

  return input
    .replace(/(Bearer\s+)[^\s"',;]+/gi, '$1[REDACTED]')
    .replace(/(fastgpt_token=)[^\s"',;]+/gi, '$1[REDACTED]')
    .replace(/([?&]apiKey=)[^&\s"']+/gi, '$1REDACTED')
    .replace(/\bfastgpt-[A-Za-z0-9_-]{24,}\b/g, (matched) => maskSecret(matched))
    .replace(
      /("(?:token|apiKey|api_key|password|secret|authorization|cookie)"\s*:\s*")[^"]*(")/gi,
      '$1[REDACTED]$2'
    );
}

/**
 * 递归脱敏对象、数组和 HTTP 请求头中的敏感字段，返回新副本而不修改原对象。
 */
export function redactValue<T>(value: T): T {
  if (typeof value === 'string') {
    return redactText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item)) as T;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        if (typeof item === 'string') {
          return [key, item.length > 0 ? maskSecret(item) : ''];
        }
        // whoami 的 data.apiKey 等摘要对象包含非敏感元数据，继续递归仅遮蔽其中的敏感叶子字段。
        if (item !== null && typeof item === 'object') {
          return [key, redactValue(item)];
        }
        return [key, '[REDACTED]'];
      }
      return [key, redactValue(item)];
    });
    return Object.fromEntries(entries) as T;
  }

  return value;
}
