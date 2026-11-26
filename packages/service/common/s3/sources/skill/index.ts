import type { ClientSession } from 'mongoose';
import type { Readable } from 'node:stream';
import { addHours } from 'date-fns';
import type { MongoDeleteResult } from '../../../mongo';
import { S3PrivateBucket } from '../../buckets/private';
import { encodeS3ObjectKey } from '../../keySanitizer';
import { removeS3TTL } from '../../utils';

const SKILL_PACKAGE_TAR_ZST_EXT = 'tar.zst';

export const isSkillTarZstKey = (key: string): boolean => key.endsWith('.tar.zst');

const SKILL_PACKAGE_ROOT_PREFIX = 'agent-skills';

/**
 * 生成某个 Skill 在私有对象存储中的包前缀。
 *
 * 删除 Skill 时按这个前缀异步清理所有版本包；具体版本包使用 Mongo versionId 作为对象名，
 * 避免版本号重排或事务回滚导致 key 复用。
 */
export function getSkillPackagePrefix(params: { teamId: string; skillId: string }): string {
  const { teamId, skillId } = params;
  return `${encodeS3ObjectKey([SKILL_PACKAGE_ROOT_PREFIX, teamId, skillId].join('/'))}/`;
}

/**
 * 生成 Skill 版本包的私有对象存储 key。
 */
export function getSkillPackageKey(params: {
  teamId: string;
  skillId: string;
  packageObjectId: string;
  extension?: 'tar.zst' | 'zip';
}): string {
  const { teamId, skillId, packageObjectId, extension = SKILL_PACKAGE_TAR_ZST_EXT } = params;
  return encodeS3ObjectKey(
    [SKILL_PACKAGE_ROOT_PREFIX, teamId, skillId, `${packageObjectId}.${extension}`].join('/')
  );
}

const resolveSkillPackageTarget = (params: {
  teamId: string;
  skillId: string;
  packageObjectId: string;
  extension?: 'tar.zst' | 'zip';
}) => {
  const extension = params.extension ?? SKILL_PACKAGE_TAR_ZST_EXT;
  const isZip = extension === 'zip';
  return {
    key: getSkillPackageKey({
      teamId: params.teamId,
      skillId: params.skillId,
      packageObjectId: params.packageObjectId,
      extension
    }),
    contentType: isZip ? 'application/zip' : 'application/zstd',
    filename: isZip ? 'package.zip' : 'package.tar.zst'
  };
};

export class S3SkillSource extends S3PrivateBucket {
  /**
   * 上传定长 Skill 包（默认 `.tar.zst`），并写入临时 TTL；Mongo 事务提交后移除 TTL，否则由 TTL cron 回收。
   */
  async uploadPackage(params: {
    teamId: string;
    skillId: string;
    packageObjectId: string;
    body: Buffer | Readable;
    contentLength?: number;
    expiredTime?: Date;
    signal?: AbortSignal;
    extension?: 'tar.zst' | 'zip';
  }): Promise<{ key: string }> {
    const { body, contentLength, expiredTime = addHours(new Date(), 1), signal } = params;
    const { key, contentType, filename } = resolveSkillPackageTarget(params);

    await this.uploadObjectWithTTL({
      key,
      body,
      filename,
      contentType,
      contentLength,
      expiredTime,
      signal
    });

    return { key };
  }

  /**
   * 未知总长流式上传 Skill 包（如编辑区 `/archive/pack` `.tar.zst` 或未知长度的 `.zip`），
   * 大于 5 MiB 自动切换 S3 Multipart 并写入 1 小时兜底 TTL，避免整包落 `/tmp` 或常驻堆内存。
   */
  async uploadPackageStream(params: {
    teamId: string;
    skillId: string;
    packageObjectId: string;
    body: Readable;
    expiredTime?: Date;
    signal?: AbortSignal;
    extension?: 'tar.zst' | 'zip';
  }): Promise<{ key: string; sizeBytes: number }> {
    const { body, expiredTime = addHours(new Date(), 1), signal } = params;
    const { key, contentType, filename } = resolveSkillPackageTarget(params);

    const { sizeBytes } = await this.uploadStreamWithMultipart({
      key,
      body,
      contentType,
      filename,
      expiredTime,
      signal
    });
    return { key, sizeBytes };
  }

  deleteSkillPackagesByPrefix(params: { teamId: string; skillId: string }) {
    return this.addDeleteJob({
      prefix: getSkillPackagePrefix(params)
    });
  }

  removePackageTTL(key: string, session?: ClientSession): Promise<MongoDeleteResult> | undefined {
    // 使用数组键走 deleteMany，确保重试写入的多条同 key TTL 记录一并清除。
    return removeS3TTL({
      key: [key],
      bucketName: 'private',
      session
    });
  }
}

export function getS3SkillSource() {
  if (global.skillBucket) {
    return global.skillBucket;
  }
  global.skillBucket = new S3SkillSource();
  return global.skillBucket;
}
