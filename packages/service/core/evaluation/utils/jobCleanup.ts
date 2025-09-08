import type { Queue, Job } from 'bullmq';
import { addLog } from '../../../common/system/log';

export interface JobCleanupResult {
  queue: string;
  totalJobs: number;
  removedJobs: number;
  failedRemovals: number;
  errors: Array<{
    jobId: string;
    error: string;
  }>;
}

export interface JobCleanupOptions {
  forceCleanActiveJobs?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
}

const DEFAULT_OPTIONS: JobCleanupOptions = {
  forceCleanActiveJobs: false,
  retryAttempts: 3,
  retryDelay: 1000
};

export class RobustJobCleaner {
  private options: JobCleanupOptions;

  constructor(options: JobCleanupOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async cleanAllJobsByFilter<T>(
    queue: Queue<T>,
    filterFn: (job: Job<T>) => boolean,
    queueName: string
  ): Promise<JobCleanupResult> {
    const result: JobCleanupResult = {
      queue: queueName,
      totalJobs: 0,
      removedJobs: 0,
      failedRemovals: 0,
      errors: []
    };

    try {
      // Get all possible job states
      const jobStates = ['waiting', 'active', 'completed', 'failed', 'delayed', 'prioritized'];
      const jobsByState: Record<string, Job<T>[]> = {};
      let totalMatchingJobs = 0;

      // Fetch jobs from all states and group them
      for (const state of jobStates) {
        try {
          const jobs = await queue.getJobs([state as any]);
          const filteredJobs = jobs.filter(filterFn);

          if (filteredJobs.length > 0) {
            jobsByState[state] = filteredJobs;
            totalMatchingJobs += filteredJobs.length;
          }
        } catch (error) {
          addLog.warn(`Failed to get jobs from state ${state} in queue ${queueName}`, { error });
        }
      }

      result.totalJobs = totalMatchingJobs;

      if (totalMatchingJobs === 0) {
        addLog.info(`No jobs found to clean in queue ${queueName}`);
        return result;
      }

      // Clean non-active jobs first
      await this.cleanJobsByStates(
        jobsByState,
        ['waiting', 'delayed', 'prioritized', 'completed', 'failed'],
        result
      );

      // Handle active jobs if force cleanup is enabled
      if (this.options.forceCleanActiveJobs && jobsByState.active?.length > 0) {
        await this.cleanActiveJobs(jobsByState.active, result);
      } else if (jobsByState.active?.length > 0) {
        addLog.warn(
          `${jobsByState.active.length} active jobs found but force cleanup is disabled`,
          { queue: queueName }
        );
      }

      addLog.info('Job cleanup completed', {
        queue: queueName,
        totalJobs: result.totalJobs,
        removedJobs: result.removedJobs,
        failedRemovals: result.failedRemovals
      });

      return result;
    } catch (error) {
      addLog.error('Fatal error during job cleanup', { queue: queueName, error });
      result.errors.push({
        jobId: 'FATAL',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return result;
    }
  }

  private async cleanJobsByStates<T>(
    jobsByState: Record<string, Job<T>[]>,
    states: string[],
    result: JobCleanupResult
  ): Promise<void> {
    for (const state of states) {
      const jobs = jobsByState[state];
      if (!jobs || jobs.length === 0) continue;

      addLog.info(`Cleaning ${jobs.length} jobs in state: ${state}`, { queue: result.queue });

      // Use Promise.allSettled to handle individual failures gracefully
      const removePromises = jobs.map((job) => this.removeJobWithRetry(job));
      const removeResults = await Promise.allSettled(removePromises);

      removeResults.forEach((removeResult, index) => {
        if (removeResult.status === 'fulfilled') {
          if (removeResult.value.success) {
            result.removedJobs++;
          } else {
            result.failedRemovals++;
            if (removeResult.value.error) {
              result.errors.push(removeResult.value.error);
            }
          }
        } else {
          result.failedRemovals++;
          result.errors.push({
            jobId: jobs[index].id || 'unknown',
            error: removeResult.reason?.message || 'Promise rejected'
          });
        }
      });
    }
  }

  private async cleanActiveJobs<T>(activeJobs: Job<T>[], result: JobCleanupResult): Promise<void> {
    addLog.warn(
      `Force cleaning ${activeJobs.length} active jobs - this may interrupt running processes`,
      { queue: result.queue }
    );

    // For active jobs, we need a more aggressive approach
    const removePromises = activeJobs.map((job) => this.forceRemoveActiveJob(job));
    const removeResults = await Promise.allSettled(removePromises);

    removeResults.forEach((removeResult, index) => {
      if (removeResult.status === 'fulfilled') {
        if (removeResult.value.success) {
          result.removedJobs++;
        } else {
          result.failedRemovals++;
          if (removeResult.value.error) {
            result.errors.push(removeResult.value.error);
          }
        }
      } else {
        result.failedRemovals++;
        result.errors.push({
          jobId: activeJobs[index].id || 'unknown',
          error: removeResult.reason?.message || 'Promise rejected'
        });
      }
    });
  }

  private async removeJobWithRetry<T>(job: Job<T>): Promise<{
    success: boolean;
    error?: { jobId: string; error: string };
  }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.options.retryAttempts!; attempt++) {
      try {
        await job.remove();
        return { success: true };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.options.retryAttempts!) {
          addLog.warn(`Job removal attempt ${attempt} failed, retrying...`, {
            jobId: job.id,
            error: lastError.message
          });
          await this.sleep(this.options.retryDelay!);
        }
      }
    }

    return {
      success: false,
      error: {
        jobId: job.id || 'unknown',
        error: lastError?.message || 'Failed to remove job after retries'
      }
    };
  }

  private async forceRemoveActiveJob<T>(job: Job<T>): Promise<{
    success: boolean;
    error?: { jobId: string; error: string };
  }> {
    try {
      // First try normal removal
      try {
        await job.remove();
        return { success: true };
      } catch (normalError) {
        // If normal removal fails for active job, try more aggressive methods
        addLog.warn(`Normal removal failed for active job, trying force removal`, {
          jobId: job.id,
          error: normalError
        });

        // Try to move the job to failed state first, then remove
        try {
          await job.moveToFailed(new Error('Force cleanup'), 'cleanup');
          await job.remove();
          return { success: true };
        } catch (forceError) {
          // Last resort: just mark it as completed and remove
          try {
            await job.moveToCompleted('force-cleaned', 'cleanup');
            await job.remove();
            return { success: true };
          } catch (lastResortError) {
            return {
              success: false,
              error: {
                jobId: job.id || 'unknown',
                error: `All removal methods failed: ${lastResortError}`
              }
            };
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        error: {
          jobId: job.id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const createJobCleaner = (options?: JobCleanupOptions): RobustJobCleaner => {
  return new RobustJobCleaner(options);
};
