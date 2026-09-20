import type { LicenseDataType } from '../types';

/**
 * License 状态（四态）。
 *
 * - `inactive`：尚未激活。本地没有 License，或 License 已签发但 startTime 未到。
 *   两种情况下都没有可用的授权，界面统一按「尚未激活」引导激活。
 * - `active`：生效中，且距离到期还有充足时间。
 * - `expiring`：生效中，但已进入到期预警窗口，需要提示续期。
 * - `expired`：已到期（now >= expiredTime），不再具备授权能力。
 */
export enum LicenseStatusEnum {
  inactive = 'inactive',
  active = 'active',
  expiring = 'expiring',
  expired = 'expired'
}

export type LicenseTimeFields = Pick<LicenseDataType, 'startTime' | 'expiredTime' | 'licenseType'>;

/** 试用版预警窗口（天）。 */
export const TRIAL_EXPIRING_WINDOW_DAYS = 10;

/**
 * 解析 License 时间字段。
 *
 * 时间缺失或无法解析时都返回 undefined，由调用方按「不可用」处理，
 * 避免脏数据被当成长期有效。
 */
const parseTimeFields = (data: LicenseTimeFields | undefined) => {
  if (!data) return undefined;

  const start = new Date(data.startTime).getTime();
  const end = new Date(data.expiredTime).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;

  return { start, end, licenseType: data.licenseType };
};

/**
 * 到期预警阈值：仅在 `expiredTime` 落入窗口内时判定为即将过期。
 *
 * 试用版按固定天数（10 天）计算；商业版按自然月计算，与续期策略保持一致。
 * 阈值本身是 License 属性，因此由本模块统一给出，避免前后端各写一份窗口规则。
 */
export const getLicenseExpiringThreshold = (
  licenseType: LicenseDataType['licenseType'] | undefined,
  now: Date = new Date()
) => {
  const threshold = new Date(now);
  if (licenseType === 'trial') {
    threshold.setDate(threshold.getDate() + TRIAL_EXPIRING_WINDOW_DAYS);
  } else {
    threshold.setMonth(threshold.getMonth() + 1);
  }
  return threshold;
};

/**
 * 判定 License 状态。
 *
 * 这是授权状态的唯一权威判断：调用方不应自行比较时间字段。仅检查 License 是否存在
 * 会把已到期或尚未生效的授权当成有效；各处各写一份时间比较则容易漏判窗口规则。
 *
 * 时间缺失或无法解析一律按 `inactive` 处理（无可用授权），而不是按长期有效。
 */
export const getLicenseStatus = (
  data: LicenseTimeFields | undefined,
  now: Date = new Date()
): LicenseStatusEnum => {
  const times = parseTimeFields(data);
  if (!times) return LicenseStatusEnum.inactive;

  const current = now.getTime();
  // 尚未到 startTime：已签发但未生效，按「尚未激活」处理。
  if (current < times.start) return LicenseStatusEnum.inactive;
  if (current >= times.end) return LicenseStatusEnum.expired;

  const threshold = getLicenseExpiringThreshold(times.licenseType, now);
  // 进入预警窗口的判据是「到期时间落在窗口内」，而不是「当前时间越过阈值」。
  return times.end <= threshold.getTime() ? LicenseStatusEnum.expiring : LicenseStatusEnum.active;
};

/**
 * License 有效期判定：startTime <= now < expiredTime。
 *
 * 保留该函数以表达「是否有可用授权」这一二元语义（与状态四态互补）；
 * 尚未到 startTime 视为不可用。
 */
export const isLicenseExpired = (data: LicenseTimeFields | undefined, now: Date = new Date()) => {
  const status = getLicenseStatus(data, now);
  return status === LicenseStatusEnum.inactive || status === LicenseStatusEnum.expired;
};

/** License 是否处于可授权状态：存在、已生效且未到期。 */
export const isLicenseActive = (data: LicenseTimeFields | undefined, now: Date = new Date()) =>
  !isLicenseExpired(data, now);

/**
 * 判断某项授权能力是否可用。
 *
 * 功能开关必须同时满足「授权在有效期内」与「该能力被签发」，只读 `functions[key]`
 * 会让已过期的 License 继续开启对应功能。
 */
export const isLicenseFunctionEnabled = (
  data: (LicenseTimeFields & { functions?: Record<string, boolean | undefined> }) | undefined,
  key: string,
  now: Date = new Date()
) => isLicenseActive(data, now) && data?.functions?.[key] === true;
