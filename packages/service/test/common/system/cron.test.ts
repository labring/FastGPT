import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn()
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.schedule
  }
}));

import { setCron } from '@fastgpt/service/common/system/cron';

describe('setCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards scheduler options to node-cron', () => {
    const callback = vi.fn();
    const task = { stop: vi.fn() };
    mocks.schedule.mockReturnValue(task);

    expect(setCron('0 10 * * *', callback, { timezone: 'Asia/Shanghai' })).toBe(task);
    expect(mocks.schedule).toHaveBeenCalledWith('0 10 * * *', callback, {
      timezone: 'Asia/Shanghai'
    });
  });
});
