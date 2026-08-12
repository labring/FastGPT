import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { S3AuditSource } from '@fastgpt/service/common/s3/sources/audit';

const createSourceWithoutConstructor = (exists: boolean) => {
  const source = Object.create(S3AuditSource.prototype);
  Object.defineProperty(source, 'client', {
    value: {
      uploadObject: vi.fn().mockImplementation(async ({ body }: { body: Readable }) => {
        for await (const _chunk of body) {
          // Consume stream
        }
      })
    }
  });
  source.isObjectExists = vi.fn().mockResolvedValue(exists);
  return source;
};

describe('S3AuditSource', () => {
  it('按团队和归档日期生成 gzip JSONL 对象路径', async () => {
    const source = createSourceWithoutConstructor(false);

    const key = await S3AuditSource.prototype.uploadAuditArchive.call(source, {
      teamId: 'team-1',
      archiveDate: '2026-08-11',
      body: Readable.from(Buffer.from('gzip'))
    });

    expect(key).toBe('audit-archive/team-1/2026-08-11.jsonl.gz');
    expect(source.client.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key,
        contentType: 'application/gzip'
      })
    );
  });

  it('检查同一天归档是否已经存在', async () => {
    const source = createSourceWithoutConstructor(true);

    await expect(
      S3AuditSource.prototype.isAuditArchiveExists.call(source, {
        teamId: 'team-2',
        archiveDate: '2026-08-11'
      })
    ).resolves.toBe(true);
    expect(source.isObjectExists).toHaveBeenCalledWith('audit-archive/team-2/2026-08-11.jsonl.gz');
  });
});
