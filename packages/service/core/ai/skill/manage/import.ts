import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  RuntimeSkillMetadataType,
  SkillPackageType
} from '@fastgpt/global/core/ai/skill/type';
import { Types } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { readStreamToBuffer } from '../../../../common/s3/utils';
import {
  normalizeImportedSkillPackageLayout,
  removeSkillPackageTTL,
  uploadSkillPackage
} from '../package';
import { MongoAgentSkills } from '../model/schema';
import { createVersion } from '../version';
import { updateCurrentVersion } from './update';
import type { Readable } from 'node:stream';
import { createResourcePermissions } from '../../../../support/permission/resourcePermissionService';
import { getAgentSandboxSkillMaxBytes } from '../../sandbox/config';

type ImportSkillParams = {
  skill: SkillPackageType['skill'];
  teamId: string;
  tmbId: string;
  packageStream: Readable;
  parentId?: string | null;
};

/**
 * Import an opaque package stream as the initial Skill version.
 *
 * Import intentionally does not parse or validate package contents. Only the ZIP entry layout is
 * normalized: external packages (Claude style `<name>/SKILL.md` or a root-level `SKILL.md`) are
 * transcribed into the runtime layout `skills/<name>/...`, because the edit sandbox materializes
 * the stored package verbatim and publish then requires that layout. Content bytes are never
 * validated or rewritten, and anything that cannot be classified is stored byte-identical.
 * This function uploads the package before opening the Mongo transaction, then creates the default
 * ACL, binds currentVersionId, and removes the temporary S3 TTL inside the transaction. If Mongo
 * fails, the uploaded package keeps its TTL and is cleaned by the shared S3 cleanup flow.
 * Runtime metadata remains empty until the workspace is saved and deployed from the edit sandbox.
 */
export async function importSkill({
  skill,
  teamId,
  tmbId,
  packageStream,
  parentId
}: ImportSkillParams): Promise<string> {
  const runtimeSkills: RuntimeSkillMetadataType[] = [];

  const maxBytes = getAgentSandboxSkillMaxBytes();
  const packageBuffer = await readStreamToBuffer({
    stream: packageStream,
    maxBytes,
    exceededMessage: `Skill package exceeds maximum allowed size (${maxBytes / 1024 / 1024}MB)`
  });
  const normalizedPackage = await normalizeImportedSkillPackageLayout(packageBuffer, {
    fallbackName: skill.name
  });

  const newSkill = new MongoAgentSkills({
    parentId: parentId ?? null,
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
    zipBuffer: normalizedPackage.buffer
  });

  return mongoSessionRun(async (session) => {
    await newSkill.save({ session });

    await createResourcePermissions({
      resource: {
        _id: newSkillId,
        type: AgentSkillTypeEnum.skill,
        teamId,
        ...(parentId ? { parentId } : {})
      },
      tmbId,
      resourceType: PerResourceTypeEnum.agentSkill,
      session
    });

    await updateCurrentVersion({
      skillId: newSkillId,
      currentVersionId: versionId,
      runtimeSkills,
      session
    });

    await createVersion(
      {
        versionId,
        skillId: newSkillId,
        tmbId,
        versionName: 'Initial import',
        storageKey: storageInfo.key,
        runtimeSkills
      },
      session
    );
    await removeSkillPackageTTL(storageInfo.key, session);

    return newSkillId;
  });
}
