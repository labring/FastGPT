import type { S3AvatarSource } from '.';

declare global {
  var avatarBucket: S3AvatarSource;
}

export {};
