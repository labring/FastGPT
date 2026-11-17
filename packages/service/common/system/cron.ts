import nodeCron, { type ScheduleOptions, type ScheduledTask } from 'node-cron';

export type CronJobDefinition = {
  name?: string;
  time: string;
  cb: () => void;
  options?: ScheduleOptions;
};

export const setCron = (time: string, cb: () => void, options?: ScheduleOptions) => {
  // second minute hour day month week
  return nodeCron.schedule(time, cb, options);
};

export const getCronTasks = () => nodeCron.getTasks() as Map<string, ScheduledTask>;

/** 停止并从 node-cron 注册表清除任务句柄，防止失败重试后定时器与全局表项累积。 */
const removeCronTask = (task: ScheduledTask) => {
  task.stop();
  const tasks = nodeCron.getTasks() as Map<string, ScheduledTask>;
  for (const [key, registered] of tasks.entries()) {
    if (registered === task) {
      tasks.delete(key);
    }
  }
};

/**
 * 原子且幂等地注册一组 Cron 任务。
 * 先校验全部表达式，任一无效在创建任何定时器前直接抛出；
 * 注册过程中若仍有异常，回滚本次已创建的全部任务并清除注册表残留后再抛出。
 */
export const registerCronJobs = ({
  jobs,
  options
}: {
  jobs: CronJobDefinition[];
  options?: ScheduleOptions;
}) => {
  for (const job of jobs) {
    if (!nodeCron.validate(job.time)) {
      throw new Error(`Invalid cron expression${job.name ? ` for "${job.name}"` : ''}`);
    }
  }

  const registry = nodeCron.getTasks() as Map<string, ScheduledTask>;
  const registered: ScheduledTask[] = [];
  try {
    for (const job of jobs) {
      if (job.name) {
        const previous = registry.get(job.name);
        if (previous) removeCronTask(previous);
      }
      const mergedOptions: ScheduleOptions | undefined =
        options || job.options || job.name
          ? {
              ...options,
              ...job.options,
              ...(job.name ? { name: job.name } : {})
            }
          : undefined;
      registered.push(setCron(job.time, job.cb, mergedOptions));
    }
  } catch (error) {
    for (const task of registered) {
      removeCronTask(task);
    }
    throw error;
  }

  return () => {
    for (const task of registered) {
      removeCronTask(task);
    }
  };
};
