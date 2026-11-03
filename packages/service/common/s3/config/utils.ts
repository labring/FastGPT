import { serviceEnv } from '@fastgpt/service/env';

/**
 * 校验存储域下载策略的跨字段约束。
 *
 * MinIO 自建部署使用 short-redirect 时，预签名 URL 的 Host 必须是客户端可直连的地址；
 * external endpoint 只以实例配置为准，不回落环境变量——否则界面留空也能靠环境变量通过校验，
 * 反而掩盖了“该项未配置”的事实，因此这里必须直接拒绝缺少 external endpoint 的保存。
 * 该约束依赖部署侧 vendor，在保存前及发布运行时快照前共同校验，不读取已退役的策略 ENV。
 */
export const assertStorageDownloadConfig = (overrides: Record<string, unknown>) => {
  const { downloadMode, externalEndpoint, cdnEndpoint } = overrides;
  const hasExternalEndpoint = typeof externalEndpoint === 'string' && !!externalEndpoint.trim();
  const hasCdnEndpoint = typeof cdnEndpoint === 'string' && !!cdnEndpoint.trim();
  if (hasCdnEndpoint) {
    if (serviceEnv.STORAGE_VENDOR === 'r2') {
      throw new Error('R2 存储不支持配置 CDN 重写地址');
    }
    if (!hasExternalEndpoint) {
      throw new Error('配置 CDN 地址时必须同时配置 external endpoint');
    }
  }
  if (downloadMode !== 'short-redirect') return;

  if (serviceEnv.STORAGE_VENDOR !== 'minio') return;

  if (!hasExternalEndpoint) {
    throw new Error(
      'MinIO 部署使用 short-redirect 下载模式时必须配置 external endpoint（客户端可直连的存储地址）'
    );
  }
};
