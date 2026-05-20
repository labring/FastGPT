import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import type { SkillPackageType } from '@fastgpt/global/core/ai/skill/type';
import type { ClientSession } from '../../../../common/mongo';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { uploadSkillPackage } from '../package';
import { MongoAgentSkills } from '../model/schema';
import { createVersion } from '../version';
import { updateCurrentStorage } from './update';
import { checkSkillNameExists } from './query';

/**
 * Import skill from a validated package.
 *
 * Caller owns archive parsing and should call this inside mongoSessionRun.
 * The package is stored as v0 and linked as currentStorage.
 */
export async function importSkill(
  packageData: SkillPackageType,
  teamId: string,
  tmbId: string,
  userId: string,
  zipBuffer: Buffer,
  parentId?: string | null,
  session?: ClientSession
): Promise<string> {
  const { skill } = packageData;

  const nameExists = await checkSkillNameExists(skill.name, teamId, parentId || null);
  if (nameExists) {
    throw SkillErrEnum.skillNameExists;
  }

  const newSkill = new MongoAgentSkills({
    parentId: parentId || null,
    type: AgentSkillTypeEnum.skill,
    source: AgentSkillSourceEnum.personal,
    name: skill.name,
    description: skill.description,
    author: userId,
    category: skill.category,
    config: skill.config || {},
    avatar: skill.avatar,
    teamId,
    tmbId,
    currentVersion: 0,
    versionCount: 1,
    createTime: new Date(),
    updateTime: new Date()
  });
  await newSkill.save({ session });

  const newSkillId = newSkill._id.toString();

  const storageInfo = await uploadSkillPackage({
    teamId,
    skillId: newSkillId,
    version: 0,
    zipBuffer
  });

  await updateCurrentStorage(newSkillId, storageInfo, session);

  await createVersion(
    {
      skillId: newSkillId,
      tmbId,
      version: 0,
      versionName: 'Initial import',
      storage: storageInfo
    },
    session
  );

  return newSkillId;
}
