import type { ClientSession } from 'mongoose';
import { S3PrivateBucket } from '../../buckets/private';
import { removeS3TTL } from '../../utils';

const SKILL_PACKAGE_ROOT_PREFIX = 'agent-skills';

/**
 * 生成某个 Skill 在私有对象存储中的包前缀。
 *
 * 删除 Skill 时按这个前缀异步清理所有版本包；具体版本包使用 Mongo versionId 作为对象名，
 * 避免版本号重排或事务回滚导致 key 复用。
 */
export function getSkillPackagePrefix(params: { teamId: string; skillId: string }): string {
  const { teamId, skillId } = params;
  return `${[SKILL_PACKAGE_ROOT_PREFIX, teamId, skillId].join('/')}/`;
}

/**
 * 生成 Skill 版本包的私有对象存储 key。
 */
export function getSkillPackageKey(params: {
  teamId: string;
  skillId: string;
  packageObjectId: string;
}): string {
  const { teamId, skillId, packageObjectId } = params;
  return `${getSkillPackagePrefix({ teamId, skillId })}${packageObjectId}.zip`;
}

export class S3SkillSource extends S3PrivateBucket {
  constructor() {
    super();
  }

  /**
   * 上传 Skill package，并沿用通用 S3 上传封装写入临时 TTL。
   *
   * 调用方在 Mongo 事务提交 version/currentVersionId 时移除 TTL；事务失败时保留 TTL，
   * 由已有 S3 TTL cron 清理孤儿包。
   */
  uploadPackage(params: {
    teamId: string;
    skillId: string;
    packageObjectId: string;
    body: Buffer;
    expiredTime?: Date;
  }) {
    const { teamId, skillId, packageObjectId, body, expiredTime } = params;
    const key = getSkillPackageKey({ teamId, skillId, packageObjectId });

    return this.uploadFileByBody({
      key,
      body,
      contentType: 'application/zip',
      filename: 'package.zip',
      ...(expiredTime && { expiredTime })
    });
  }

  deleteSkillPackagesByPrefix(params: { teamId: string; skillId: string }) {
    return this.addDeleteJob({
      prefix: getSkillPackagePrefix(params)
    });
  }

  removePackageTTL(key: string, session?: ClientSession) {
    return removeS3TTL({
      key,
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
