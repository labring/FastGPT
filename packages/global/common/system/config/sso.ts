import type { FastGPTFeConfigsType, SystemEnvType } from '../types';

/**
 * 在配置加载及保存边界分离 SSO 展示配置和服务端地址。
 * 旧 feConfigs.sso.url 仅在缺少 systemEnv.sso 时迁入；显式新配置（包括空地址）优先。
 * 返回新对象，移除旧地址并根据服务端配置派生 enabled，不信任存储中的能力标志。
 */
export const normalizeSsoConfig = ({
  publicConfig,
  serverConfig
}: {
  publicConfig?: NonNullable<FastGPTFeConfigsType['sso']> & { url?: unknown };
  serverConfig?: SystemEnvType['sso'];
}): {
  publicConfig: FastGPTFeConfigsType['sso'];
  serverConfig: SystemEnvType['sso'];
} => {
  const legacyUrl =
    publicConfig && 'url' in publicConfig && typeof publicConfig.url === 'string'
      ? publicConfig.url
      : undefined;
  const resolvedServerConfig =
    serverConfig ?? (legacyUrl !== undefined ? { url: legacyUrl } : undefined);

  const publicMetadata = (() => {
    if (!publicConfig) return undefined;
    if (!('url' in publicConfig)) return publicConfig;
    const { url: _url, ...metadata } = publicConfig;
    return metadata;
  })();

  return {
    serverConfig: resolvedServerConfig,
    publicConfig:
      publicMetadata || resolvedServerConfig?.url
        ? { ...publicMetadata, enabled: Boolean(resolvedServerConfig?.url) }
        : undefined
  };
};
