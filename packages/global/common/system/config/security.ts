/**
 * 将宽容读取的来源策略投影为 CORS 名单。
 * undefined 表示明确关闭或合法空名单；异常配置返回空数组，拒绝跨域来源而不阻断配置读取。
 */
export const resolveAllowedOrigins = ({
  enabled,
  origins
}: {
  enabled: unknown;
  origins: unknown;
}): string[] | undefined => {
  if (enabled === false) return undefined;
  if (enabled !== undefined && enabled !== true) return [];
  if (!Array.isArray(origins)) return [];
  if (origins.length === 0) return undefined;
  return origins.filter((origin): origin is string => typeof origin === 'string' && origin !== '');
};
