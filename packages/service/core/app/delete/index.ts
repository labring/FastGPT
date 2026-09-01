import { appDeleteProcessor } from './processor';
import {
  appDeleteMQService,
  QueueNames,
  type AppDeleteJobData,
  type FlowJob,
  type Job
} from '@fastgpt/dal/redis/bullmq';
import { findAppAndAllChildren } from '../controller';
import { MongoApp } from '../schema';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { setCron } from '../../../common/system/cron';

export type { AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';

type AppDeleteTaskInput = {
  teamId: string;
  appId: string;
};

type MarkedApp = {
  _id: unknown;
  teamId: unknown;
  parentId?: unknown;
};

const APP_DELETE_RESUME_BATCH_SIZE = 200;
const APP_DELETE_RESUME_CONCURRENCY = 5;
const APP_DELETE_FLOW_BULK_SIZE = 50;
const APP_DELETE_RESUME_CRON = '*/5 * * * *';
const logger = getLogger(LogCategories.MODULE.APP.FOLDER);

let recoveryCronRegistered = false;
let recoveryPromise: Promise<void> | undefined;

const getTaskId = ({ teamId, appId }: AppDeleteTaskInput) =>
  `app-delete-task-${String(teamId)}-${String(appId)}`;

/**
 * Build one task Flow as a linked list. BullMQ processes children before parents, so reversing
 * the resource list makes descendants complete before their parents and keeps the task root last.
 */
export const buildAppDeleteFlow = ({
  teamId,
  appId,
  apps
}: AppDeleteTaskInput & { apps: Array<{ _id: unknown }> }): FlowJob => {
  const taskId = getTaskId({ teamId, appId });
  const stepChain = apps
    .slice()
    .reverse()
    .reduce<FlowJob | undefined>((nextStep, app) => {
      const resourceId = String(app._id);
      const step: FlowJob = {
        name: 'delete_app_step',
        queueName: QueueNames.appDelete,
        data: {
          teamId,
          appId: resourceId,
          taskId,
          jobType: 'step'
        },
        opts: {
          jobId: `${taskId}:step:${resourceId}`,
          failParentOnFailure: true,
          ...(nextStep ? {} : { delay: 1000 })
        }
      };

      if (nextStep) step.children = [nextStep];
      return step;
    }, undefined);

  return {
    name: 'delete_app_task',
    queueName: QueueNames.appDelete,
    data: {
      teamId,
      appId,
      taskId,
      jobType: 'task'
    },
    opts: {
      jobId: taskId
    },
    ...(stepChain ? { children: [stepChain] } : {})
  };
};

/** Load the marked app subtree and construct its ordered deletion Flow. */
const loadDeleteTaskFlow = async (data: AppDeleteTaskInput) => {
  const apps = await findAppAndAllChildren({
    teamId: data.teamId,
    appId: data.appId,
    fields: '_id teamId parentId deleteTime'
  });

  const unmarkedApps = apps.filter((app) => !app.deleteTime);
  if (unmarkedApps.length > 0) {
    logger.warn('App delete safety check mismatch', {
      markedCount: apps.length - unmarkedApps.length,
      totalCount: apps.length,
      unmarkedCount: unmarkedApps.length
    });
    throw new Error('App delete safety check mismatch');
  }

  return {
    flow: buildAppDeleteFlow({ ...data, apps })
  };
};

/**
 * Remove only a terminal task Flow before rebuilding it. Active and waiting tasks are left alone,
 * allowing multiple recovery callers to converge on the same stable task ID.
 */
const prepareTaskFlow = async (data: AppDeleteTaskInput) => {
  const taskId = getTaskId(data);
  const queue = appDeleteMQService.getQueue();
  const getExistingJob = async () => {
    const job = await queue.getJob(taskId);
    if (!job) return;

    const state = await job.getState();
    if (state !== 'unknown') return { job, state };

    const latestJob = await queue.getJob(taskId);
    if (!latestJob) return;

    const latestState = await latestJob.getState();
    if (latestState === 'unknown') {
      throw new Error(`BullMQ app delete task is in an unknown state: ${taskId}`);
    }
    return { job: latestJob, state: latestState };
  };

  const existing = await getExistingJob();
  if (existing) {
    if (
      ['waiting-children', 'waiting', 'active', 'delayed', 'prioritized', 'paused'].includes(
        existing.state
      )
    ) {
      return { job: existing.job };
    }
    await existing.job.remove({ removeChildren: true });
  }

  return loadDeleteTaskFlow(data);
};

/** Submit task Flows in bounded atomic batches so recovery cannot create one resource job at a time. */
const addAppDeleteTasks = async (tasks: AppDeleteTaskInput[]) => {
  const flows: FlowJob[] = [];
  const jobs: Job[] = [];
  for (const task of tasks) {
    const prepared = await prepareTaskFlow(task);
    if ('job' in prepared) {
      jobs.push(prepared.job);
    } else {
      flows.push(prepared.flow);
    }
  }

  for (let index = 0; index < flows.length; index += APP_DELETE_FLOW_BULK_SIZE) {
    const nodes = await appDeleteMQService.addFlows(
      flows.slice(index, index + APP_DELETE_FLOW_BULK_SIZE)
    );
    jobs.push(...nodes.map((node) => node.job));
  }
  return jobs;
};

/** Add one deletion task Flow. The public contract remains root App based, not resource based. */
export const addAppDeleteJob = async (data: AppDeleteTaskInput) => {
  const [job] = await addAppDeleteTasks([data]);
  return job;
};

/** Add multiple root deletion tasks through BullMQ FlowProducer.addBulk. */
export const addAppDeleteJobs = (data: AppDeleteTaskInput[]) => addAppDeleteTasks(data);

/**
 * Initialize the App deletion worker and asynchronously resume soft-deleted task roots whose Flow
 * was not created or reached a terminal failure. Recovery does not block worker creation.
 */
export const initAppDeleteWorker = () => {
  const worker = appDeleteMQService.getWorker(appDeleteProcessor);

  registerAppDeleteRecoveryCron();

  resumeMarkedAppDeleteJobs().catch((error) => {
    logger.error('Failed to resume marked app delete jobs', { error });
  });

  return worker;
};

/** Keep recovery alive after transient Redis or Mongo failures during startup. */
const registerAppDeleteRecoveryCron = () => {
  if (recoveryCronRegistered) return;

  recoveryCronRegistered = true;
  setCron(APP_DELETE_RESUME_CRON, () => {
    resumeMarkedAppDeleteJobs().catch((error) => {
      logger.error('Failed to resume marked app delete jobs', { error });
    });
  });
};

/** Select marked apps whose parent is not also marked, producing one task root per subtree. */
const getMarkedTaskRoots = (apps: MarkedApp[]) => {
  const markedIds = new Set(apps.map((app) => `${String(app.teamId)}:${String(app._id)}`));
  return apps.filter((app) => {
    if (!app.parentId) return true;
    return !markedIds.has(`${String(app.teamId)}:${String(app.parentId)}`);
  });
};

/** Scan only marked tree roots and rebuild missing or failed task Flows with bounded concurrency. */
async function resumeMarkedAppDeleteJobsInternal(): Promise<void> {
  const cursor = MongoApp.find(
    {
      deleteTime: {
        $exists: true,
        $ne: null
      }
    },
    {
      _id: 1,
      teamId: 1,
      parentId: 1
    }
  )
    .lean<MarkedApp>()
    .cursor({ batchSize: APP_DELETE_RESUME_BATCH_SIZE });

  let totalMarked = 0;
  let rootCount = 0;
  let resumedCount = 0;
  let failedCount = 0;
  const markedApps: MarkedApp[] = [];

  for await (const app of cursor) {
    totalMarked += 1;
    markedApps.push(app);
  }

  const roots = getMarkedTaskRoots(markedApps);
  rootCount = roots.length;
  const tasks = roots.map((root) => ({
    teamId: String(root.teamId),
    appId: String(root._id)
  }));

  const taskBatches = [];
  for (let index = 0; index < tasks.length; index += APP_DELETE_FLOW_BULK_SIZE) {
    taskBatches.push(tasks.slice(index, index + APP_DELETE_FLOW_BULK_SIZE));
  }

  const results = await batchRunSettled(
    taskBatches,
    (batch) => addAppDeleteJobs(batch),
    APP_DELETE_RESUME_CONCURRENCY
  );

  for (const [index, result] of results.entries()) {
    if (result.success) {
      resumedCount += taskBatches[index].length;
    } else {
      failedCount += taskBatches[index].length;
    }
  }

  logger.info('Marked app delete tasks resumed', {
    totalMarked,
    rootCount,
    resumedCount,
    failedCount
  });
}

/** Process-local overlap protection; distributed callers converge on stable Flow task IDs. */
export function resumeMarkedAppDeleteJobs(): Promise<void> {
  if (recoveryPromise) return recoveryPromise;

  recoveryPromise = resumeMarkedAppDeleteJobsInternal().finally(() => {
    recoveryPromise = undefined;
  });
  return recoveryPromise;
}
