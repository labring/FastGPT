import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Queue} from 'bullmq';
import { Job } from 'bullmq';
import {
  RobustJobCleaner,
  createJobCleaner,
  type JobCleanupOptions
} from '@fastgpt/service/core/evaluation/dataset/jobCleanup';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock BullMQ
const mockJob = (id: string, state: string, data: any = {}) => ({
  id,
  data,
  opts: state === 'delayed' ? { delay: 1000 } : undefined,
  getState: vi.fn().mockResolvedValue(state),
  remove: vi.fn().mockResolvedValue(undefined),
  moveToFailed: vi.fn().mockResolvedValue(undefined),
  moveToCompleted: vi.fn().mockResolvedValue(undefined)
});

const mockQueue = {
  getJobs: vi.fn()
} as unknown as Queue<any>;

describe('RobustJobCleaner', () => {
  let cleaner: RobustJobCleaner;
  let options: JobCleanupOptions;

  beforeEach(() => {
    options = {
      forceCleanActiveJobs: false,
      retryAttempts: 2,
      retryDelay: 100
    };
    cleaner = new RobustJobCleaner(options);

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('cleanAllJobsByFilter', () => {
    it('should clean jobs in waiting state successfully', async () => {
      // Arrange
      const waitingJobs = [
        mockJob('job1', 'waiting', { dataId: 'test1' }),
        mockJob('job2', 'waiting', { dataId: 'test2' })
      ];

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('waiting')) return Promise.resolve(waitingJobs);
        return Promise.resolve([]);
      });

      const filterFn = (job: any) => job.data.dataId === 'test1' || job.data.dataId === 'test2';

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(2);
      expect(result.removedJobs).toBe(2);
      expect(result.failedRemovals).toBe(0);
      expect(result.queue).toBe('testQueue');
      expect(waitingJobs[0].remove).toHaveBeenCalled();
      expect(waitingJobs[1].remove).toHaveBeenCalled();
    });

    it('should handle job removal failures gracefully', async () => {
      // Arrange
      const jobs = [
        mockJob('job1', 'waiting', { dataId: 'test1' }),
        mockJob('job2', 'waiting', { dataId: 'test2' })
      ];

      // Make second job removal fail
      jobs[1].remove = vi.fn().mockRejectedValue(new Error('Removal failed'));

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('waiting')) return Promise.resolve(jobs);
        return Promise.resolve([]);
      });

      const filterFn = () => true;

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(2);
      expect(result.removedJobs).toBe(1);
      expect(result.failedRemovals).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('Removal failed');
    });

    it('should skip active jobs when forceCleanActiveJobs is false', async () => {
      // Arrange
      const activeJobs = [mockJob('active1', 'active', { dataId: 'test1' })];
      const waitingJobs = [mockJob('waiting1', 'waiting', { dataId: 'test2' })];

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('active')) return Promise.resolve(activeJobs);
        if (states.includes('waiting')) return Promise.resolve(waitingJobs);
        return Promise.resolve([]);
      });

      const filterFn = () => true;
      cleaner = new RobustJobCleaner({ ...options, forceCleanActiveJobs: false });

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(2); // Both jobs are counted
      expect(result.removedJobs).toBe(1); // Only waiting job is removed
      expect(result.failedRemovals).toBe(0);
      expect(activeJobs[0].remove).not.toHaveBeenCalled();
      expect(waitingJobs[0].remove).toHaveBeenCalled();
    });

    it('should force clean active jobs when forceCleanActiveJobs is true', async () => {
      // Arrange
      const activeJobs = [mockJob('active1', 'active', { dataId: 'test1' })];

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('active')) return Promise.resolve(activeJobs);
        return Promise.resolve([]);
      });

      const filterFn = () => true;
      cleaner = new RobustJobCleaner({ ...options, forceCleanActiveJobs: true });

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(1);
      expect(result.removedJobs).toBe(1);
      expect(result.failedRemovals).toBe(0);
      expect(activeJobs[0].remove).toHaveBeenCalled();
    });

    it('should handle active job force removal with fallback methods', async () => {
      // Arrange
      const activeJob = mockJob('active1', 'active', { dataId: 'test1' });
      activeJob.remove = vi
        .fn()
        .mockRejectedValueOnce(new Error('Cannot remove active job'))
        .mockRejectedValueOnce(new Error('Still cannot remove'))
        .mockResolvedValueOnce(undefined);

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('active')) return Promise.resolve([activeJob]);
        return Promise.resolve([]);
      });

      const filterFn = () => true;
      cleaner = new RobustJobCleaner({ ...options, forceCleanActiveJobs: true });

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(1);
      expect(result.removedJobs).toBe(1);
      expect(result.failedRemovals).toBe(0);
      expect(activeJob.moveToFailed).toHaveBeenCalled();
      expect(activeJob.remove).toHaveBeenCalledTimes(3); // Initial + after moveToFailed + after moveToCompleted
    });

    it('should handle queue access errors gracefully', async () => {
      // Arrange
      mockQueue.getJobs = vi.fn().mockRejectedValue(new Error('Queue access error'));
      const filterFn = () => true;

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(0);
      expect(result.removedJobs).toBe(0);
      expect(result.failedRemovals).toBe(0);
    });

    it('should filter jobs correctly', async () => {
      // Arrange
      const jobs = [
        mockJob('job1', 'waiting', { dataId: 'keep' }),
        mockJob('job2', 'waiting', { dataId: 'remove' }),
        mockJob('job3', 'waiting', { dataId: 'keep' })
      ];

      mockQueue.getJobs = vi.fn().mockImplementation((states) => {
        if (states.includes('waiting')) return Promise.resolve(jobs);
        return Promise.resolve([]);
      });

      const filterFn = (job: any) => job.data.dataId === 'remove';

      // Act
      const result = await cleaner.cleanAllJobsByFilter(mockQueue, filterFn, 'testQueue');

      // Assert
      expect(result.totalJobs).toBe(1);
      expect(result.removedJobs).toBe(1);
      expect(result.failedRemovals).toBe(0);
      expect(jobs[0].remove).not.toHaveBeenCalled(); // 'keep'
      expect(jobs[1].remove).toHaveBeenCalled(); // 'remove'
      expect(jobs[2].remove).not.toHaveBeenCalled(); // 'keep'
    });
  });

  describe('createJobCleaner', () => {
    it('should create cleaner with default options', () => {
      const cleaner = createJobCleaner();
      expect(cleaner).toBeInstanceOf(RobustJobCleaner);
    });

    it('should create cleaner with custom options', () => {
      const customOptions: JobCleanupOptions = {
        forceCleanActiveJobs: true,
        retryAttempts: 5,
        retryDelay: 2000
      };

      const cleaner = createJobCleaner(customOptions);
      expect(cleaner).toBeInstanceOf(RobustJobCleaner);
    });
  });
});
