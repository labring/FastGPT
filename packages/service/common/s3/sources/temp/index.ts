import type { Readable } from 'node:stream';
import { MongoS3TTL } from '../../models/ttl';
import { getFileS3Key } from '../../utils';
import { S3PrivateBucket } from '../../buckets/private';
import { createS3FileSource } from '../../../file/read/source';
import { getLogger, LogCategories } from '../../../logger';

const logger = getLogger(LogCategories.INFRA.S3);

export class S3TempFileSource extends S3PrivateBucket {
  /**
   * 将已通过业务上传限制的临时文件流写入 S3，并返回可信、延迟物化的 FileSource。
   * TTL 在对象上传前创建；调用方应在消费结束后主动 cleanup，进程中断时由 TTL 兜底。
   */
  async upload({
    teamId,
    stream,
    sizeBytes,
    filename,
    contentType,
    encoding
  }: {
    teamId: string;
    stream: Readable;
    sizeBytes: number;
    filename: string;
    contentType?: string;
    encoding?: string;
  }) {
    const { fileKey } = getFileS3Key.temp({ teamId, filename });

    await this.uploadFileByBody({
      key: fileKey,
      body: stream,
      filename,
      contentType,
      contentLength: sizeBytes
    });

    return {
      key: fileKey,
      source: createS3FileSource({
        sizeBytes,
        metadata: { filename, contentType, encoding },
        getStream: async (signal) => {
          const fileStream = await this.getFileStream(fileKey, { abortSignal: signal });
          if (!fileStream) throw new Error('Temporary S3 file stream is empty');
          return fileStream;
        }
      })
    };
  }

  /** 先确认临时对象已删除，再移除 TTL；删除失败时保留 TTL 供生命周期任务重试。 */
  async cleanup(key: string) {
    try {
      await this.removeObject(key);
    } catch (error) {
      logger.warn('Temporary S3 file cleanup failed; keep TTL for retry', { key, error });
      throw error;
    }

    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName });
  }
}

let tempFileSource: S3TempFileSource | undefined;

export const getS3TempFileSource = () => {
  tempFileSource ??= new S3TempFileSource();
  return tempFileSource;
};
