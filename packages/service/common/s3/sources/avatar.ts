import { S3Sources } from '../type';
import { MongoS3TTL } from '../schema';
import { S3PublicBucket } from '../buckets/public';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import type { ClientSession } from 'mongoose';
import { getFileS3Key } from '../utils';

class S3AvatarSource extends S3PublicBucket {
  constructor() {
    super();
  }

  get prefix(): string {
    return imageBaseUrl;
  }

  async createUploadAvatarURL({
    filename,
    teamId,
    autoExpired = true
  }: {
    filename: string;
    teamId: string;
    autoExpired?: boolean;
  }) {
    const { fileKey } = getFileS3Key.avatar({ teamId, filename });

    return this.createPostPresignedUrl(
      { filename, rawKey: fileKey },
      {
        expiredHours: autoExpired ? 1 : undefined, // 1 Hours
        maxFileSize: 5 // 5MB
      }
    );
  }

  async removeAvatarTTL(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName }, session);
  }

  async deleteAvatar(avatar: string, session?: ClientSession): Promise<void> {
    const key = avatar.slice(this.prefix.length);
    await MongoS3TTL.deleteOne({ minioKey: key, bucketName: this.bucketName }, session);
    await this.removeObject(key);
  }

  async refreshAvatar(newAvatar?: string, oldAvatar?: string, session?: ClientSession) {
    if (!newAvatar || newAvatar === oldAvatar) return;

    // remove the TTL for the new avatar
    await this.removeAvatarTTL(newAvatar, session);

    if (oldAvatar) {
      // delete the old avatar
      // 1. delete the TTL record if it exists
      // 2. delete the avatar in S3
      await this.deleteAvatar(oldAvatar, session);
    }
  }

  async copyAvatar({
    key,
    teamId,
    filename,
    temporary = false
  }: {
    key: string;
    teamId: string;
    filename: string;
    temporary: boolean;
  }) {
    const from = key.slice(this.prefix.length);
    const to = `${S3Sources.avatar}/${teamId}/${filename}`;
    await this.copy({ from, to, options: { temporary } });
    return this.prefix.concat(to);
  }
}

export function getS3AvatarSource() {
  if (global.avatarBucket) {
    return global.avatarBucket;
  }
  global.avatarBucket = new S3AvatarSource();
  return global.avatarBucket;
}

declare global {
  var avatarBucket: S3AvatarSource;
}
