import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { SkillPackageType } from '@fastgpt/global/core/ai/skill/type';
import { Types } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { removeSkillPackageTTL, uploadSkillPackage } from '../package';
import { MongoAgentSkills } from '../model/schema';
import { createVersion } from '../version';
import { updateCurrentVersion } from './update';

/**
 * Import skill from a validated package.
 *
 * Caller owns archive parsing. This function uploads the package before opening the Mongo
 * transaction, then binds currentVersionId and removes the temporary S3 TTL inside the
 * transaction. If Mongo fails, the uploaded package keeps its TTL and is cleaned by the shared S3
 * cleanup flow.
 * The package is stored as the initial version and linked as currentVersionId.
 */
export async function importSkill(
  packageData: SkillPackageType,
  teamId: string,
  tmbId: string,
  zipBuffer: Buffer,
  parentId?: string | null
): Promise<string> {
  const { skill } = packageData;

  const newSkill = new MongoAgentSkills({
    parentId: parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    avatar: skill.avatar,
    teamId,
    tmbId,
    createTime: new Date(),
    updateTime: new Date()
  });

  const newSkillId = newSkill._id.toString();
  const versionId = new Types.ObjectId().toString();

  const storageInfo = await uploadSkillPackage({
    teamId,
    skillId: newSkillId,
    packageObjectId: versionId,
    zipBuffer
  });

  return mongoSessionRun(async (session) => {
    await newSkill.save({ session });

    await updateCurrentVersion(newSkillId, versionId, session);

    await createVersion(
      {
        versionId,
        skillId: newSkillId,
        tmbId,
        versionName: 'Initial import',
        storageKey: storageInfo.key
      },
      session
    );
    await removeSkillPackageTTL(storageInfo.key, session);

    return newSkillId;
  });
}
