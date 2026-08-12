import type { S3AuditSource } from './index';

declare global {
  var auditBucket: S3AuditSource;
}

export {};
