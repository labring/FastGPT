import { getQueue, getWorker, QueueNames, type Job, type Worker } from '../../common/bullmq';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { MongoAgentSkills } from './schema';
import { updateCurrentStorage, updateSkillCreationFailed } from './controller';
import { buildSkillMd, generateSkillMd } from './skillMdBuilder';
import { extractSkillFromMarkdown } from './utils';
import { createSkillPackage } from './zipBuilder';
import { deleteSkillPackage, type SkillStorageInfo, uploadSkillPackage } from './storage';
import { createVersion } from './version/controller';
import { getLogger, LogCategories } from '../../common/logger';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/agentSkill';
import { AgentSkillCreationStatusEnum } from '@fastgpt/global/core/agentSkills/constants';
import { createUsage } from '../../support/wallet/usage/controller';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { formatModelChars2Points } from '../../support/wallet/usage/utils';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS.CREATION);

export type AgentSkillCreateJobData = {
  skillId: string;
  teamId: string;
  tmbId: string;
  name: string;
  description: string;
  requirements?: string;
  model?: string;
};

const agentSkillCreateQueue = getQueue<AgentSkillCreateJobData>(QueueNames.agentSkillCreate, {
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: {
      age: 30 * 24 * 60 * 60,
      count: 1000
    }
  }
});
let hookedWorker: Worker<AgentSkillCreateJobData> | null = null;

export const addAgentSkillCreateJob = async (data: AgentSkillCreateJobData) => {
  const skillId = String(data.skillId);
  const existingJob = await agentSkillCreateQueue.getJob(skillId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (state !== 'completed' && state !== 'failed') {
      return existingJob;
    }
    await existingJob.remove();
  }

  return agentSkillCreateQueue.add(skillId, data, {
    jobId: skillId
  });
};

/**
 * Re-enqueue visible pending skills on worker startup.
 *
 * The create API persists the generation input before adding a BullMQ job. If
 * the process stops between those two steps, this startup scan turns the
 * pending row back into an idempotent job and prevents an endless creating
 * state on the detail page.
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
      tmbId: 1,
      name: 1,
      description: 1,
      creationPayload: 1
    }
  ).lean();

  const results = await Promise.allSettled(
    pendingSkills.flatMap((skill) => {
      if (!skill.teamId || !skill.tmbId) {
        logger.warn('Pending skill missing owner info, skip resume', {
          skillId: skill._id.toString()
        });
        return [];
      }

      return addAgentSkillCreateJob({
        skillId: skill._id.toString(),
        teamId: skill.teamId.toString(),
        tmbId: skill.tmbId.toString(),
        name: skill.name,
        description: skill.description,
        requirements: skill.creationPayload?.requirements,
        model: skill.creationPayload?.model
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
 * Finish a pending skill creation job.
 *
 * The API creates the visible skill row first so the detail page has a stable
 * skillId. This worker performs the slow package generation and version setup,
 * then marks the skill as ready. Failure is persisted on the skill row so
 * refreshes and later visits can show the terminal state.
 */
export async function completePendingSkillCreation(data: AgentSkillCreateJobData): Promise<void> {
  const { skillId, teamId, tmbId, name, description } = data;
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

  if (
    (!skill.creationStatus || skill.creationStatus === AgentSkillCreationStatusEnum.ready) &&
    skill.currentStorage
  ) {
    logger.info('Pending skill already completed, skip duplicate creation job', { skillId });
    return;
  }

  try {
    const requirements = data.requirements ?? skill.creationPayload?.requirements;
    const model = data.model ?? skill.creationPayload?.model;
    let skillMd: string;
    let packageRootName = name;

    if (requirements && model) {
      const [generatedSkillMd, usage] = await generateSkillMd({
        name,
        description,
        requirements: requirements.trim(),
        model
      });

      skillMd = generatedSkillMd;

      const { skill: generatedSkill, error: parseError } = extractSkillFromMarkdown(skillMd);
      if (parseError || !generatedSkill?.name) {
        logger.warn('AI generated invalid SKILL.md', {
          skillId,
          name,
          parseError
        });
        throw SkillErrEnum.invalidSkillPackage;
      }
      packageRootName = generatedSkill.name;

      const { totalPoints, modelName } = formatModelChars2Points({
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      });

      createUsage({
        teamId,
        tmbId,
        appName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
        totalPoints,
        source: UsageSourceEnum.assist_generate_skill,
        list: [
          {
            moduleName: i18nT('common:support.wallet.usage.Assist Generate Skill'),
            amount: totalPoints,
            model: modelName,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          }
        ]
      });
    } else {
      skillMd = buildSkillMd({
        name: packageRootName,
        description
      });
    }

    const zipBuffer = await createSkillPackage({ name: packageRootName, skillMd });

    const storageInfo = await uploadSkillPackage({
      teamId,
      skillId,
      version: 0,
      zipBuffer
    });
    uploadedStorageInfo = storageInfo;

    const isStorageLinked = await mongoSessionRun(async (session) => {
      const isUpdated = await updateCurrentStorage(skillId, storageInfo, session);
      if (!isUpdated) {
        return false;
      }

      await createVersion(
        {
          skillId,
          tmbId,
          version: 0,
          versionName: 'Initial creation',
          storage: storageInfo
        },
        session
      );

      return true;
    });

    if (!isStorageLinked) {
      uploadedStorageInfo = undefined;
      await deleteSkillPackage(storageInfo).catch((cleanupError) => {
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
      await deleteSkillPackage(uploadedStorageInfo).catch((cleanupError) => {
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
  const worker = getWorker<AgentSkillCreateJobData>(
    QueueNames.agentSkillCreate,
    async (job: Job<AgentSkillCreateJobData>) => {
      await completePendingSkillCreation(job.data);
    },
    {
      concurrency: 2
    }
  );

  if (hookedWorker !== worker) {
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
