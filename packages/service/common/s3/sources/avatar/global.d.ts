import type { S3AvatarSource } from '.';

declare global {
  // 惰性构造 + 可失效重建，未初始化或被重置时为 undefined
  var avatarBucket: S3AvatarSource | undefined;
}

export {};
