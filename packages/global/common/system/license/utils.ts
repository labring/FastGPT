import type { LicenseDataType } from '../types';

/**
 * License 有效期判定：startTime <= now < expiredTime。
 *
 * 这是"当前是否被授权"的唯一权威判断。仅检查 License 是否存在会把已过期的授权
 * 当成有效：商业版缓存、app 的 isPlus、管理员界面状态都依赖本函数，避免各处
 * 各写一份时间比较而漏判。
 *
 * - 未激活（无 license）不属于"已过期"，由调用方按 undefined 处理
 * - 时间无法解析时按已失效处理，避免脏数据被当作长期有效
 */
export const isLicenseExpired = (
  data: Pick<LicenseDataType, 'startTime' | 'expiredTime'> | undefined,
  now: Date = new Date()
) => {
  if (!data) return true;

  const start = new Date(data.startTime).getTime();
  const end = new Date(data.expiredTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return true;

  const current = now.getTime();
  return current < start || current >= end;
};

/** License 是否处于可授权状态：存在且未过期。 */
export const isLicenseActive = (
  data: Pick<LicenseDataType, 'startTime' | 'expiredTime'> | undefined,
  now: Date = new Date()
) => !isLicenseExpired(data, now);
