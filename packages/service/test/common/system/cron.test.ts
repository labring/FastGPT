import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  validate: vi.fn(),
  tasks: new Map<string, { stop: () => void }>()
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.schedule,
    validate: mocks.validate,
    getTasks: () => mocks.tasks
  }
}));

import { registerCronJobs, setCron } from '@fastgpt/service/common/system/cron';

describe('setCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tasks.clear();
    mocks.validate.mockReturnValue(true);
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

  it('validates all cron expressions before scheduling any task', () => {
    mocks.validate.mockImplementation((expr: string) => expr !== 'invalid');

    expect(() =>
      registerCronJobs({
        jobs: [
          { name: 'first', time: '* * * * *', cb: vi.fn() },
          { name: 'broken', time: 'invalid', cb: vi.fn() }
        ]
      })
    ).toThrow('Invalid cron expression for "broken"');

    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.tasks.size).toBe(0);
  });

  it('rolls back previously registered tasks when a later registration throws', () => {
    const firstTask = { stop: vi.fn() };
    mocks.schedule
      .mockImplementationOnce((_expr, _cb, opts?: { name?: string }) => {
        mocks.tasks.set(opts?.name ?? 'auto-1', firstTask);
        return firstTask;
      })
      .mockImplementationOnce(() => {
        throw new Error('scheduler failure');
      });

    expect(() =>
      registerCronJobs({
        jobs: [
          { name: 'first', time: '* * * * *', cb: vi.fn() },
          { name: 'second', time: '0 * * * *', cb: vi.fn() }
        ]
      })
    ).toThrow('scheduler failure');

    expect(firstTask.stop).toHaveBeenCalledOnce();
    expect(mocks.tasks.size).toBe(0);
  });

  it('replaces previously named tasks without leaking duplicates and supports cleanup', () => {
    const oldTask = { stop: vi.fn() };
    const newTask = { stop: vi.fn() };
    mocks.schedule.mockImplementation((_expr, _cb, opts?: { name?: string }) => {
      const task = mocks.schedule.mock.calls.length === 1 ? oldTask : newTask;
      mocks.tasks.set(opts?.name ?? 'job', task);
      return task;
    });

    registerCronJobs({ jobs: [{ name: 'job', time: '* * * * *', cb: vi.fn() }] });
    const stop = registerCronJobs({ jobs: [{ name: 'job', time: '* * * * *', cb: vi.fn() }] });

    expect(oldTask.stop).toHaveBeenCalledOnce();
    expect(mocks.tasks.get('job')).toBe(newTask);

    stop();
    expect(newTask.stop).toHaveBeenCalledOnce();
    expect(mocks.tasks.size).toBe(0);
  });
});
