import { checkCreateResourceParent } from '../../../../common/parentFolder/depth';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  RuntimeSkillMetadataType,
  SkillPackageType
} from '@fastgpt/global/core/ai/skill/type';
import { Types } from '../../../../common/mongo';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import { removeSkillPackageTTL, uploadSkillPackageStream } from '../package/storage';
import { MongoAgentSkills } from '../model/schema';
import { createVersion } from '../version';
import { updateCurrentVersion } from './update';
import type { Readable } from 'node:stream';
import { createResourcePermissions } from '../../../../support/permission/resourcePermissionService';

type ImportSkillParams = {
  skill: SkillPackageType['skill'];
  teamId: string;
  tmbId: string;
  packageStream: Readable;
  contentLength?: number;
  parentId?: string | null;
};

/**
 * 校验父级文件夹链后，将上传的不透明 `.zip` 包流直接存入 S3 并导入为 Skill 初始版本。
 *
 * 与 upstream/main 保持一致：导入阶段不拆包或校验 ZIP 内部结构（在后续沙盒加载解压时校验），
 * 仅在流式上传 S3（写入临时 TTL）后开启 Mongo 事务创建权限、绑定版本并移除 TTL；
 * 事务或上传失败时未入库对象保留 TTL，由 S3 清理任务自动回收。
 */
export async function importSkill({
  skill,
  teamId,
  tmbId,
  packageStream,
  contentLength,
  parentId
}: ImportSkillParams): Promise<string> {
  await checkCreateResourceParent({
    parentId,
    findResource: (id) => MongoAgentSkills.findOne({ _id: id, teamId }, '_id parentId type').lean(),
    isFolder: false,
    isFolderType: (type) => type === AgentSkillTypeEnum.folder
  });

  const runtimeSkills: RuntimeSkillMetadataType[] = [];

  // 预先生成 _id 供 S3 对象 key 使用；文档实例放入事务回调内构造，避免事务重试时因 $isNew=false 触发 DocumentNotFoundError
  const newSkillIdObj = new Types.ObjectId();
  const newSkillId = newSkillIdObj.toString();
  const versionId = new Types.ObjectId().toString();

  const storageInfo = await uploadSkillPackageStream({
    teamId,
    skillId: newSkillId,
    packageObjectId: versionId,
    packageStream,
    contentLength,
    extension: 'zip'
  });

  return mongoSessionRun(async (session) => {
    const newSkill = new MongoAgentSkills({
      _id: newSkillIdObj,
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
