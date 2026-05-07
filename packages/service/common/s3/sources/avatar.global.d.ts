import type { S3AvatarSource } from './avatar';

declare global {
  var avatarBucket: S3AvatarSource;
}

export {};
