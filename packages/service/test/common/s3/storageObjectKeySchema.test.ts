import { describe, expect, it } from 'vitest';
import {
  CreateGetPresignedUrlParamsSchema,
  CreatePostPresignedUrlParamsSchema,
  StorageObjectKeySchema,
  UploadFileByBodySchema,
  UploadImage2S3BucketParamsSchema
} from '@fastgpt/service/common/s3/contracts/type';
import { S3AccessObjectKeySchema } from '@fastgpt/service/common/s3/accessLink/type';

type KeyParseResult =
  | { success: true }
  | { success: false; error: { issues: Array<{ message: string }> } };

const keySchemas: ReadonlyArray<readonly [string, (key: string) => KeyParseResult]> = [
  ['shared key', (key) => StorageObjectKeySchema.safeParse(key)],
  [
    'presigned PUT',
    (key) => CreatePostPresignedUrlParamsSchema.safeParse({ filename: 'file.txt', rawKey: key })
  ],
  ['presigned GET', (key) => CreateGetPresignedUrlParamsSchema.safeParse({ key })],
  [
    'image upload',
    (key) =>
      UploadImage2S3BucketParamsSchema.safeParse({
        uploadKey: key,
        mimetype: 'image/png',
        filename: 'file.png',
        buffer: Buffer.from('image')
      })
  ],
  [
    'body upload',
    (key) => UploadFileByBodySchema.safeParse({ key, body: 'body', filename: 'file.txt' })
  ],
  ['access link', (key) => S3AccessObjectKeySchema.safeParse(key)]
];

describe('FastGPT storage object key schemas', () => {
  it.each(keySchemas)('%s accepts portable URL-sensitive characters', (_name, parseKey) => {
    expect(parseKey('team/folder # & + % ?/\u6587\u4ef6-\ud83d\ude00.txt').success).toBe(true);
  });

  it.each(keySchemas)('%s rejects a path the storage SDK would reject', (_name, parseKey) => {
    const result = parseKey('team//file.txt');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('consecutive slashes');
    }
  });

  it.each(keySchemas)('%s rejects a key beyond 850 UTF-8 bytes', (_name, parseKey) => {
    expect(parseKey('a'.repeat(851)).success).toBe(false);
  });
});
