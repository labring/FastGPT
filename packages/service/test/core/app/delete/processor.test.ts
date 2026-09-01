import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@fastgpt/dal/redis/bullmq';
import type { AppDeleteJobData } from '@fastgpt/dal/redis/bullmq';

const mocks = vi.hoisted(() => ({
  findAppAndAllChildren: vi.fn(),
  deleteAppDataProcessor: vi.fn(),
  findOne: vi.fn(),
  find: vi.fn(),
  addAppJobs: vi.fn(),
  addAppJob: vi.fn(),
  getWorker: vi.fn(),
  setCron: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/controller', () => ({
  findAppAndAllChildren: mocks.findAppAndAllChildren,
  deleteAppDataProcessor: mocks.deleteAppDataProcessor
}));

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findOne: mocks.findOne,
    find: mocks.find
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { APP: { FOLDER: 'app.folder' } } }
}));

vi.mock('@fastgpt/service/common/system/cron', () => ({
  setCron: mocks.setCron
}));

vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  appDeleteMQService: {
    addAppJobs: mocks.addAppJobs,
    addAppJob: mocks.addAppJob,
    getWorker: mocks.getWorker
  }
}));

import { appDeleteProcessor } from '../../../../core/app/delete/processor';
import { initAppDeleteWorker, resumeMarkedAppDeleteJobs } from '../../../../core/app/delete';

const createJob = (id: string, data: AppDeleteJobData) =>
  ({ id, data }) as unknown as Job<AppDeleteJobData>;

describe('appDeleteProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAppAndAllChildren.mockResolvedValue([
      { _id: 'root', teamId: 'team-1', parentId: null, deleteTime: new Date() },
      { _id: 'child-1', teamId: 'team-1', parentId: 'root', deleteTime: new Date() },
      { _id: 'child-2', teamId: 'team-1', parentId: 'root', deleteTime: new Date() }
    ]);
    mocks.addAppJobs.mockResolvedValue([]);
    mocks.addAppJob.mockResolvedValue({ id: 'app-delete-job' });
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'app-1',
        teamId: 'team-1',
        type: 'simple',
        avatar: '',
        deleteTime: new Date()
      })
    });
    mocks.deleteAppDataProcessor.mockResolvedValue(undefined);
  });

  it('splits a root deletion job into single-app jobs without cleaning app data', async () => {
    await appDeleteProcessor(
      createJob('root-job', { teamId: 'team-1', appId: 'root', jobType: 'root' })
    );

    expect(mocks.findAppAndAllChildren).toHaveBeenCalledWith({
      teamId: 'team-1',
      appId: 'root',
      fields: '_id teamId parentId deleteTime'
    });
    expect(mocks.addAppJobs).toHaveBeenCalledWith([
      { teamId: 'team-1', appId: 'root' },
      { teamId: 'team-1', appId: 'child-1' },
      { teamId: 'team-1', appId: 'child-2' }
    ]);
    expect(mocks.findOne).not.toHaveBeenCalled();
    expect(mocks.deleteAppDataProcessor).not.toHaveBeenCalled();
  });

  it('treats a historical job without jobType as a root job', async () => {
    await appDeleteProcessor(createJob('legacy-root-job', { teamId: 'team-1', appId: 'root' }));

    expect(mocks.addAppJobs).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAppDataProcessor).not.toHaveBeenCalled();
  });

  it('does not log all subtree IDs when the root safety check fails', async () => {
    mocks.findAppAndAllChildren.mockResolvedValue([
      { _id: 'root', teamId: 'team-1', parentId: null, deleteTime: null },
      { _id: 'child-1', teamId: 'team-1', parentId: 'root', deleteTime: null }
    ]);

    await expect(
      appDeleteProcessor(
        createJob('unsafe-root-job', { teamId: 'team-1', appId: 'root', jobType: 'root' })
      )
    ).rejects.toThrow('App delete safety check mismatch');

    expect(mocks.logger.warn).toHaveBeenCalledWith('App delete safety check mismatch', {
      markedCount: 0,
      totalCount: 2,
      unmarkedCount: 2
    });
    expect(mocks.logger.warn.mock.calls[0][1]).not.toHaveProperty('unmarkedAppIds');
  });

  it('cleans exactly one marked app for a single-app job', async () => {
    await appDeleteProcessor(
      createJob('app-job', { teamId: 'team-1', appId: 'app-1', jobType: 'app' })
    );

    expect(mocks.findOne).toHaveBeenCalledWith(
      { _id: 'app-1', teamId: 'team-1' },
      '_id teamId type avatar deleteTime'
    );
    expect(mocks.deleteAppDataProcessor).toHaveBeenCalledWith({
      app: expect.objectContaining({ _id: 'app-1' }),
      teamId: 'team-1'
    });
    expect(mocks.findAppAndAllChildren).not.toHaveBeenCalled();
  });

  it('rejects an unmarked single-app job before deleting external data', async () => {
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'app-1',
        teamId: 'team-1',
        type: 'simple',
        avatar: '',
        deleteTime: null
      })
    });

    await expect(
      appDeleteProcessor(
        createJob('unmarked-app-job', { teamId: 'team-1', appId: 'app-1', jobType: 'app' })
      )
    ).rejects.toThrow('App delete safety check mismatch');
    expect(mocks.deleteAppDataProcessor).not.toHaveBeenCalled();
  });

  it('resumes marked apps through a cursor with bounded batch processing', async () => {
    const cursor = (async function* () {
      yield { _id: 'app-1', teamId: 'team-1' };
      yield { _id: 'app-2', teamId: 'team-2' };
    })();
    const lean = vi.fn().mockReturnValue({
      cursor: vi.fn().mockReturnValue(cursor)
    });
    mocks.find.mockReturnValue({ lean });

    await resumeMarkedAppDeleteJobs();

    expect(mocks.find).toHaveBeenCalledWith(
      { deleteTime: { $exists: true, $ne: null } },
      { _id: 1, teamId: 1 }
    );
    expect(mocks.addAppJob).toHaveBeenNthCalledWith(1, {
      teamId: 'team-1',
      appId: 'app-1'
    });
    expect(mocks.addAppJob).toHaveBeenNthCalledWith(2, {
      teamId: 'team-2',
      appId: 'app-2'
    });
    expect(mocks.logger.info).toHaveBeenCalledWith('Marked app delete jobs resumed', {
      totalMarked: 2,
      resumedCount: 2,
      failedCount: 0
    });
  });

  it('registers periodic recovery when the worker starts', async () => {
    const cursor = (async function* () {})();
    mocks.find.mockReturnValue({
      lean: vi.fn().mockReturnValue({ cursor: vi.fn().mockReturnValue(cursor) })
    });
    const worker = { name: 'app-delete-worker' };
    mocks.getWorker.mockReturnValue(worker);

    expect(initAppDeleteWorker()).toBe(worker);
    expect(mocks.setCron).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));

    await resumeMarkedAppDeleteJobs();
  });
});
