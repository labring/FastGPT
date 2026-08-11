import z from 'zod';

// 系统最大字符串处理长度
export const SYSTEM_STRING_LENGTH_UNIT = 1_000_000;

// Log 枚举
export const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

// S3
export const StorageVendorSchema = z.enum(['minio', 'aws-s3', 'r2', 'cos', 'oss']);
export const StorageCosProtocolSchema = z.enum(['https:', 'http:']);

// DAL 数据库类型（决定业务侧 Repository 使用哪个数据库 adapter）
export const DalDbTypeSchema = z.enum(['mongo', 'mysql', 'oceanbase', 'postgres']);
