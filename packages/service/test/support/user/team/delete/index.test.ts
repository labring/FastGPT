import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queue: { name: 'teamDelete' },
  addOrRequeueFailedJob: vi.fn()
}));

vi.mock('@fastgpt/service/common/bullmq', () => ({
  QueueNames: { teamDelete: 'teamDelete' },
  getQueue: vi.fn(() => mocks.queue),
  getWorker: vi.fn(),
  addOrRequeueFailedJob: mocks.addOrRequeueFailedJob
}));

vi.mock('@fastgpt/service/support/user/team/delete/processor', () => ({
  teamDeleteProcessor: vi.fn()
}));

import { addTeamDeleteJob } from '@fastgpt/service/support/user/team/delete';

describe('addTeamDeleteJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the team ID as a retryable stable job ID', async () => {
    await addTeamDeleteJob({ teamId: 'team-1' });

    expect(mocks.addOrRequeueFailedJob).toHaveBeenCalledWith({
      queue: mocks.queue,
      name: 'delete_team',
      data: { teamId: 'team-1' },
      opts: { jobId: 'team-1', delay: 1000 }
    });
  });
});
