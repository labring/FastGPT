import { type Job, type Worker } from '@fastgpt/dal/redis/bullmq';
import { skillCreateMQService, type AgentSkillCreateJobData } from '@fastgpt/dal/redis/bullmq';

export type { AgentSkillCreateJobData } from '@fastgpt/dal/redis/bullmq';
import { Types } from '../../../../../common/mongo';
import { mongoSessionRun } from '../../../../../common/mongo/sessionRun';
import { MongoAgentSkills } from '../../model/schema';
import { updateCurrentVersion, updateSkillCreationFailed } from '../update';
import {
  createBlankSkillWorkspacePackage,
  deleteSkillPackage,
  extractRuntimeSkillsFromPackage,
  removeSkillPackageTTL,
  type SkillStorageInfo,
  uploadSkillPackage
} from '../../package';
import { createVersion } from '../../version';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/ai/skill/constants';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

let hookedWorker: Worker<AgentSkillCreateJobData> | null = null;

/**
 * 为一个可见的 pending skill 添加幂等的异步创建任务。
 *
 * 使用 skillId 作为 BullMQ jobId，使 API 重试、worker 启动恢复、前端重复提交都收敛到
 * 同一个创建任务。已完成/失败的历史 job 会先删除再重建，因为是否仍需重试以 skill
 * 数据行为准，而不是以队列里的旧任务状态为准。
 */
export const addAgentSkillCreateJob = (data: AgentSkillCreateJobData) =>
  skillCreateMQService.addJob(data);

/**
 * worker 启动时恢复仍处于 creating 的可见 skill。
 *
 * 创建 API 会先持久化生成输入，再写入 BullMQ。如果进程刚好在这两步之间退出，
 * 启动扫描会把 pending 数据重新转成幂等 job，避免详情页永久停留在创建中。
 */
async function resumePendingSkillCreationJobs(): Promise<void> {
  const pendingSkills = await MongoAgentSkills.find(
    {
      creationStatus: AgentSkillCreationStatusEnum.creating,
      deleteTime: null
    },
    {
      _id: 1,
      teamId: 1,
      tmbId: 1
    }
  ).lean();

  const results = await Promise.allSettled(
    pendingSkills.flatMap((skill) => {
      if (!skill.teamId || !skill.tmbId) {
        // 老数据或异常数据缺少归属信息时不能安全计费/生成，跳过并留下日志即可。
        logger.warn('Pending skill missing owner info, skip resume', {
          skillId: skill._id.toString()
        });
        return [];
      }

      return addAgentSkillCreateJob({
        skillId: skill._id.toString(),
        teamId: skill.teamId.toString(),
        tmbId: skill.tmbId.toString()
      });
    })
  );

  const failedCount = results.filter((result) => result.status === 'rejected').length;
  if (pendingSkills.length > 0) {
    logger.info('Pending skill creation jobs resumed', {
      total: pendingSkills.length,
      failed: failedCount
    });
  }
}

/**
 * 完成一个 pending skill 的空白初始工作区上传和 v0 版本绑定。
 *
 * API 先创建可见 skill 行，保证详情页拥有稳定 skillId；worker 再执行较慢的
 * workspace zip 打包、对象存储上传和版本初始化。真正的 `skills/<name>/SKILL.md`
 * 由用户或内置辅助生成 Skill 在编辑沙盒里生成，避免新建时制造一个无需求来源的同名 Skill。
 */
export async function completePendingSkillCreation(data: AgentSkillCreateJobData): Promise<void> {
  const { skillId, teamId, tmbId } = data;
  let uploadedStorageInfo: SkillStorageInfo | undefined;

  const skill = await MongoAgentSkills.findOne({
    _id: skillId,
    teamId,
    deleteTime: null
  });

  if (!skill) {
    logger.warn('Pending skill not found, skip creation job', { skillId, teamId });
    return;
  }

  if (skill.creationStatus === AgentSkillCreationStatusEnum.ready && skill.currentVersionId) {
    // BullMQ 可能重复投递，或 worker 启动恢复时扫到刚完成的数据；已绑定包则直接幂等退出。
    logger.info('Pending skill already completed, skip duplicate creation job', { skillId });
    return;
  }

  try {
    const zipBuffer = await createBlankSkillWorkspacePackage();
    const runtimeSkills = await extractRuntimeSkillsFromPackage(zipBuffer, { allowEmpty: true });
    const versionId = new Types.ObjectId().toString();

    const storageInfo = await uploadSkillPackage({
      teamId,
      skillId,
      packageObjectId: versionId,
      zipBuffer
    });
    uploadedStorageInfo = storageInfo;

    // versionId 必须在同一个事务里绑定；否则可能出现版本列表有记录但当前指针缺失。
    const isStorageLinked = await mongoSessionRun(async (session) => {
      const isUpdated = await updateCurrentVersion({
        skillId,
        currentVersionId: versionId,
        runtimeSkills,
        session
      });
      if (!isUpdated) {
        return false;
      }
      await createVersion(
        {
          versionId,
          skillId,
          tmbId,
          versionName: 'Initial blank workspace',
          storageKey: storageInfo.key,
          runtimeSkills
        },
        session
      );
      await removeSkillPackageTTL(storageInfo.key, session);

      return true;
    });

    if (!isStorageLinked) {
      uploadedStorageInfo = undefined;
      // skill 可能在 worker 生成期间被删除。数据库未绑定成功时，刚上传的包不应残留。
      await deleteSkillPackage(storageInfo.key).catch((cleanupError) => {
        logger.error('Failed to clean uploaded package for deleted pending skill', {
          skillId,
          cleanupError
        });
      });
      return;
    }

    uploadedStorageInfo = undefined;
  } catch (error) {
    if (uploadedStorageInfo) {
      // 打包上传已经完成但后续步骤失败时，需要主动清理对象存储，避免形成孤儿包。
      await deleteSkillPackage(uploadedStorageInfo.key).catch((cleanupError) => {
        logger.error('Failed to clean uploaded skill package after creation error', {
          skillId,
          cleanupError
        });
      });
    }

    const errorText = getErrText(error, 'Skill creation failed');
    await updateSkillCreationFailed({
      skillId,
      error: errorText
    });
    logger.error('Pending skill creation failed', {
      skillId,
      teamId,
      error
    });
    throw error;
  }
}

export const initAgentSkillCreateWorker = () => {
  const worker = skillCreateMQService.getWorker(async (job: Job<AgentSkillCreateJobData>) => {
    await completePendingSkillCreation(job.data);
  });

  if (hookedWorker !== worker) {
    // binding 可能返回同一个单例 worker；只挂一次 failed 监听，避免重复写失败态和重复日志。
    worker.on('failed', async (job, error) => {
      try {
        const skillId = job?.data.skillId;
        if (!skillId) return;

        const skill = await MongoAgentSkills.findOne(
          {
            _id: skillId,
            creationStatus: AgentSkillCreationStatusEnum.creating,
            deleteTime: null
          },
          { _id: 1 }
        ).lean();
        if (!skill) return;

        // completePendingSkillCreation 内部会优先写失败态；这里兜底处理 worker 级异常。
        await updateSkillCreationFailed({
          skillId,
          error: getErrText(error, 'Skill creation failed')
        });
      } catch (failedEventError) {
        logger.error('Failed to persist skill creation failed event', {
          skillId: job?.data.skillId,
          error: failedEventError
        });
      }
    });

    hookedWorker = worker;
  }

  resumePendingSkillCreationJobs().catch((error) => {
    logger.error('Failed to resume pending skill creation jobs', { error });
  });

  return worker;
};
