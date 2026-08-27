import { GET, POST } from '@/web/admin/common/request';
import type { LicenseDataType } from '@fastgpt/global/common/system/types';

/**
 * 读取 license 状态。pro 服务未配置/不可达时返回 undefined（视为未激活），
 * 以便开源版 root 正确触发激活/购买提示弹窗。
 */
export const getLicenseData = async (): Promise<LicenseDataType | undefined> => {
  const res = await GET<LicenseDataType | { total?: number; list?: unknown[] }>(
    '/proApi/admin/common/license/auth'
  );
  // 降级返回的统一空结构视为未激活
  if (!res || typeof res !== 'object' || ('total' in res && 'list' in res)) {
    return undefined;
  }
  return res as LicenseDataType;
};

export const postActiveLicense = (data: { license: string }) =>
  POST('/proApi/admin/common/license/active', data);
