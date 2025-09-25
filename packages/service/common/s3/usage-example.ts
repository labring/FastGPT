/**
 * S3 Sources 使用示例
 * 展示如何使用改进后的 S3 架构
 */

import { getS3AvatarSource } from './sources/avatar';
import { getS3ChatSource } from './sources/chat';

// 使用示例
export const s3UsageExample = async () => {
  // 获取 avatar source（public bucket）
  const avatarSource = getS3AvatarSource();

  // 获取 chat source（private bucket）
  const chatSource = getS3ChatSource();

  // ✅ 现在可以直接调用 createPublicUrl 方法！
  const publicUrl = avatarSource.createPublicUrl('avatar/team123/2024_01_01/abc123_avatar.png');
  console.log('Avatar public URL:', publicUrl);

  // ✅ 也可以通过 getPublicBucket 获取 bucket 实例
  const publicBucket = avatarSource.getPublicBucket();
  const anotherPublicUrl = publicBucket.createPublicUrl(
    'avatar/team456/2024_01_01/def456_avatar.png'
  );
  console.log('Another avatar public URL:', anotherPublicUrl);

  // ✅ 创建预签名 URL
  const avatarPresignedUrl = await avatarSource.createPostPresignedUrl({
    filename: 'new-avatar.png',
    teamId: '1234567890123456'
  });
  console.log('Avatar presigned URL:', avatarPresignedUrl);

  // ✅ Private bucket 示例
  const chatPresignedUrl = await chatSource.createPostPresignedUrl({
    filename: 'chat-history.txt',
    teamId: '1234567890123456'
  });
  console.log('Chat presigned URL:', chatPresignedUrl);

  // ✅ 获取 private bucket 实例
  const privateBucket = chatSource.getPrivateBucket();
  console.log('Private bucket name:', privateBucket.name);
};

// 类型安全示例
export const typeSafetyExample = () => {
  const avatarSource = getS3AvatarSource();
  const chatSource = getS3ChatSource();

  // ✅ TypeScript 现在知道 avatarSource.bucket 是 S3PublicBucket 类型
  // 所以可以安全地调用 createPublicUrl
  const url1 = avatarSource.createPublicUrl('test.png');

  // ✅ 也可以直接访问 bucket 的方法
  const url2 = avatarSource.bucket.createPublicUrl('test2.png');

  // ❌ chatSource 没有 createPublicUrl 方法，因为它是 private bucket
  // chatSource.createPublicUrl('test.png'); // TypeScript 错误

  // ✅ 但 chatSource 可以访问基础的 bucket 方法
  console.log('Chat bucket name:', chatSource.bucketName);
};

// 单例验证示例
export const singletonExample = () => {
  const avatar1 = getS3AvatarSource();
  const avatar2 = getS3AvatarSource();

  // 验证单例模式
  console.log('Same instance:', avatar1 === avatar2); // true
  console.log('Same bucket:', avatar1.bucket === avatar2.bucket); // true

  const chat1 = getS3ChatSource();
  const chat2 = getS3ChatSource();

  // 验证单例模式
  console.log('Same chat instance:', chat1 === chat2); // true
  console.log('Same chat bucket:', chat1.bucket === chat2.bucket); // true

  // 不同类型的 source 使用不同的 bucket
  console.log('Different buckets:', avatar1.bucket !== chat1.bucket); // true
};
