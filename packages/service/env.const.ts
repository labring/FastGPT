import z from 'zod';
import { StorageVendorSchema } from '@fastgpt/global/common/system/config/schemas/storage';

// 系统最大字符串处理长度
export const SYSTEM_STRING_LENGTH_UNIT = 1_000_000;

// Log 枚举
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

// S3
export { StorageVendorSchema };
export const StorageCosProtocolSchema = z.enum(['https:', 'http:']);
