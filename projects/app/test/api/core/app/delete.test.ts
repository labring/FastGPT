import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import type { AppDeleteJobData } from '@fastgpt/service/core/app/delete';
import { addAppDeleteJob, initAppDeleteWorker } from '@fastgpt/service/core/app/delete';
import handler from '@/pages/api/core/app/del';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

// Mock dependencies for queue functionality
vi.mock('@fastgpt/service/common/bullmq', () => ({
  getQueue: vi.fn(),
  getWorker: vi.fn(),
  QueueNames: {
    appDelete: 'app-delete'
  }
}));

// Import mocked modules for type access
import { getQueue, getWorker, QueueNames } from '@fastgpt/service/common/bullmq';

const mockGetQueue = vi.mocked(getQueue);
const mockGetWorker = vi.mocked(getWorker);

describe('App Delete Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addAppDeleteJob', () => {
    it('should add job to queue with correct parameters', async () => {
      const mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-123' })
      };
      mockGetQueue.mockReturnValue(mockQueue as any);

      const jobData: AppDeleteJobData = {
        teamId: 'team-123',
        appId: 'app-123'
      };

      const result = await addAppDeleteJob(jobData);

      expect(mockGetQueue).toHaveBeenCalledWith(QueueNames.appDelete, {
        defaultJobOptions: {
          attempts: 10,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: true,
          removeOnFail: { age: 30 * 24 * 60 * 60 }
        }
      });

      expect(mockQueue.add).toHaveBeenCalledWith('team-123:app-123', jobData, {
        deduplication: { id: 'team-123:app-123' },
        delay: 1000
      });

      expect(result).toEqual({ id: 'job-123' });
    });

    it('should use correct jobId format for deduplication', async () => {
      const mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-456' })
      };
      mockGetQueue.mockReturnValue(mockQueue as any);

      const jobData: AppDeleteJobData = {
        teamId: 'team-xyz',
        appId: 'app-abc'
      };

      await addAppDeleteJob(jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'team-xyz:app-abc',
        jobData,
        expect.objectContaining({
          deduplication: { id: 'team-xyz:app-abc' }
        })
      );
    });
  });

  describe('initAppDeleteWorker', () => {
    it('should create worker with correct configuration', () => {
      const mockWorker = {} as any;
      mockGetWorker.mockReturnValue(mockWorker);

      const result = initAppDeleteWorker();

      expect(mockGetWorker).toHaveBeenCalledWith(QueueNames.appDelete, expect.any(Function), {
        concurrency: 1,
        removeOnFail: {
          age: 30 * 24 * 60 * 60
        }
      });

      expect(result).toBe(mockWorker);
    });
  });
});

describe('App Delete API Integration', () => {
  let rootUser: any;

  beforeEach(async () => {
    // Get root user for testing
    rootUser = await getRootUser();
  });

  it('should successfully delete an app and mark it for deletion', async () => {
    // Create a test app first
    const testApp = await MongoApp.create({
      name: 'Test App for Deletion',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.simple,
      modules: []
    });

    // Mock the queue to avoid actual background deletion
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-123' })
    };
    mockGetQueue.mockReturnValue(mockQueue as any);

    // Call the delete API
    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: String(testApp._id) }
    });

    expect(result.code).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);

    // Verify the app is marked for deletion
    const deletedApp = await MongoApp.findOne({ _id: testApp._id });
    expect(deletedApp?.deleteTime).not.toBeNull();

    // Verify queue job was added
    expect(mockQueue.add).toHaveBeenCalledWith(
      `${rootUser.teamId}:${testApp._id}`,
      {
        teamId: rootUser.teamId,
        appId: String(testApp._id)
      },
      {
        deduplication: { id: `${rootUser.teamId}:${testApp._id}` },
        delay: 1000
      }
    );

    // Cleanup
    await MongoApp.deleteOne({ _id: testApp._id });
  });

  it('should handle folder deletion correctly', async () => {
    // Create a folder
    const testFolder = await MongoApp.create({
      name: 'Test Folder',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.folder,
      parentId: null
    });

    // Create a child app in the folder
    const childApp = await MongoApp.create({
      name: 'Child App',
      teamId: rootUser.teamId,
      tmbId: rootUser.tmbId,
      type: AppTypeEnum.simple,
      parentId: testFolder._id,
      modules: []
    });

    // Mock the queue
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-folder' })
    };
    mockGetQueue.mockReturnValue(mockQueue as any);

    // Call the delete API
    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: String(testFolder._id) }
    });

    expect(result.code).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);

    // Folders should not be included in the response
    const deletedAppIds = result.data as string[];
    expect(deletedAppIds).not.toContain(String(testFolder._id));
    expect(deletedAppIds).toContain(String(childApp._id));

    // Cleanup
    await mongoSessionRun(async (session) => {
      await MongoApp.deleteOne({ _id: testFolder._id }, { session });
      await MongoApp.deleteOne({ _id: childApp._id }, { session });
    });
  });

  it('should handle non-existent app gracefully', async () => {
    const nonExistentId = '507f1f77bcf86cd799439011';

    const result = await Call(handler, {
      auth: rootUser,
      query: { appId: nonExistentId }
    });

    expect(result.code).toBe(500);
    expect(result.error).toBe('appUnExist');
  });
});
