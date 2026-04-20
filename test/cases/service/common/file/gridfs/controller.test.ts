import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  getGFSCollection,
  getGridBucket,
  getDownloadStream
} from '@fastgpt/service/common/file/gridfs/controller';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';

describe('getGFSCollection', () => {
  it('should return a collection for dataset bucket', () => {
    const collection = getGFSCollection(BucketNameEnum.dataset);
    expect(collection).toBeDefined();
    expect(collection.collectionName).toBe('dataset.files');
  });

  it('should return a collection for chat bucket', () => {
    const collection = getGFSCollection(BucketNameEnum.chat);
    expect(collection).toBeDefined();
    expect(collection.collectionName).toBe('chat.files');
  });
});

describe('getGridBucket', () => {
  it('should return a GridFSBucket for dataset', () => {
    const bucket = getGridBucket(BucketNameEnum.dataset);
    expect(bucket).toBeDefined();
  });

  it('should return a GridFSBucket for chat', () => {
    const bucket = getGridBucket(BucketNameEnum.chat);
    expect(bucket).toBeDefined();
  });
});

describe('getDownloadStream', () => {
  it('should upload and then download a file from GridFS', async () => {
    const bucket = getGridBucket(BucketNameEnum.dataset);
    const testContent = 'Hello GridFS test content';

    // Upload a file first
    const fileId = await new Promise<Types.ObjectId>((resolve, reject) => {
      const uploadStream = bucket.openUploadStream('test-file.txt');
      const readable = Readable.from(Buffer.from(testContent));
      readable.pipe(uploadStream);
      uploadStream.on('finish', () => resolve(uploadStream.id as Types.ObjectId));
      uploadStream.on('error', reject);
    });

    // Download the file
    const downloadStream = await getDownloadStream({
      bucketName: BucketNameEnum.dataset,
      fileId: fileId.toString()
    });

    expect(downloadStream).toBeDefined();

    // Read the downloaded content
    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(chunk);
    }
    const downloadedContent = Buffer.concat(chunks).toString('utf-8');
    expect(downloadedContent).toBe(testContent);
  });

  it('should throw error for non-existent file', async () => {
    const fakeId = new Types.ObjectId().toString();

    // getDownloadStream itself doesn't throw, but reading from the stream will
    const stream = await getDownloadStream({
      bucketName: BucketNameEnum.dataset,
      fileId: fakeId
    });

    await expect(async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
    }).rejects.toThrow();
  });
});
