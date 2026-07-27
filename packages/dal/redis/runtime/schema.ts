import { z } from 'zod';

/** Redis 参数和 Repository 配置共用的正安全整数 schema。 */
export const PositiveSafeIntegerSchema = z.int().positive();

/** Redis 返回值和计数器共用的非负安全整数 schema。 */
export const NonNegativeSafeIntegerSchema = z.int().nonnegative();

/** Redis cache 中允许正负小数，但拒绝 NaN 和 Infinity。 */
export const FiniteNumberSchema = z.number().finite();
