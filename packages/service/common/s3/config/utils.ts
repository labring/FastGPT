import { serviceEnv } from '../../../env';
import { getStorageVendorCapabilities } from '@fastgpt/global/common/system/config/schemas/storage';

/**
 * 校验存储域下载策略的跨字段约束。入参必须是默认值与库中 overrides、提交补丁合成后的完整配置，
 * 本函数不负责域内合并，不能直接传入请求补丁。
 *
 * MinIO 自建部署使用 short-redirect 时，预签名 URL 的 Host 必须是客户端可直连的地址；
 * external endpoint 只以实例配置为准，不回落环境变量——否则界面留空也能靠环境变量通过校验，
 * 反而掩盖了“该项未配置”的事实，因此这里必须直接拒绝缺少 external endpoint 的保存。
 * 写入期传入 submittedOverrides 时额外拒绝不支持 externalEndpoint 的托管厂商提交新值，
 * 同时允许历史升级残留值在快照刷新阶段被运行时忽略而不阻塞启动。
 * 该约束依赖部署侧 vendor，在保存前及发布运行时快照前共同校验，不读取已退役的策略 ENV。
 */
export const assertStorageDownloadConfig = (
  config: Record<string, unknown>,
  submittedOverrides?: Record<string, unknown>
) => {
  const capabilities = getStorageVendorCapabilities(serviceEnv.STORAGE_VENDOR);
  const { downloadMode, externalEndpoint, cdnEndpoint } = config;
  const hasExternalEndpoint = typeof externalEndpoint === 'string' && !!externalEndpoint.trim();
  const hasCdnEndpoint = typeof cdnEndpoint === 'string' && !!cdnEndpoint.trim();
  const submittedExternalEndpoint = submittedOverrides?.externalEndpoint;
  const hasSubmittedExternalEndpoint =
    typeof submittedExternalEndpoint === 'string' && !!submittedExternalEndpoint.trim();

  if (hasSubmittedExternalEndpoint && !capabilities.supportsExternalEndpoint) {
    throw new Error(`${capabilities.vendor} 存储不支持配置 external endpoint`);
  }
  if (hasCdnEndpoint) {
    if (!capabilities.supportsCdnEndpoint) {
      throw new Error('R2 存储不支持配置 CDN 重写地址');
    }
    if (capabilities.vendor === 'minio' && !hasExternalEndpoint) {
      throw new Error('配置 CDN 地址时必须同时配置 external endpoint');
    }
  }
  if (downloadMode !== 'short-redirect') return;

  if (capabilities.vendor !== 'minio') return;

  if (!hasExternalEndpoint) {
    throw new Error(
      'MinIO 部署使用 short-redirect 下载模式时必须配置 external endpoint（客户端可直连的存储地址）'
    );
  }
};
