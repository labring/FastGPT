import type { Readable } from 'node:stream';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { S3PrivateBucket } from '../../buckets/private';

const getAuditArchiveKey = ({ teamId, archiveDate }: { teamId: string; archiveDate: string }) =>
  `audit-archive/${teamId}/${archiveDate}.jsonl.gz`;

export class S3AuditSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  /** 上传团队单次清理产生的 gzip JSONL 审计归档。 */
  async uploadAuditArchive({
    teamId,
    archiveDate,
    body
  }: {
    teamId: string;
    archiveDate: string;
    body: Readable;
  }) {
    const key = getAuditArchiveKey({ teamId, archiveDate });
    const filename = `${archiveDate}.jsonl.gz`;

    await this.client.uploadObject({
      key,
      body,
      contentType: 'application/gzip',
      contentDisposition: getContentDisposition({ filename, type: 'attachment' }),
      metadata: {
        originFilename: encodeURIComponent(filename),
        uploadTime: new Date().toISOString(),
        teamId,
        archiveDate
      }
    });

    return key;
  }

  /** 判断团队当天的审计归档是否已生成，防止定时任务重复执行时覆盖已上传对象。 */
  isAuditArchiveExists(params: { teamId: string; archiveDate: string }) {
    return this.isObjectExists(getAuditArchiveKey(params));
  }
}

/** 获取审计日志私有归档存储实例。 */
export function getS3AuditSource() {
  if (global.auditBucket) {
    return global.auditBucket;
  }
  global.auditBucket = new S3AuditSource();
  return global.auditBucket;
}
