import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addJob: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  teamDeleteMQService: {
    addJob: mocks.addJob,
    getWorker: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/user/team/delete/processor', () => ({
  teamDeleteProcessor: vi.fn()
}));

import { addTeamDeleteJob } from '@fastgpt/service/support/user/team/delete';

describe('addTeamDeleteJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates retryable Team deletion to the DAL queue service', async () => {
    await addTeamDeleteJob({ teamId: 'team-1' });

    expect(mocks.addJob).toHaveBeenCalledWith({ teamId: 'team-1' });
  });
});
