import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import { createFakeChangeStream, type FakeChangeStream } from '@test/utils/changeStream';
const mocks = vi.hoisted(() => ({ watch: vi.fn(), training: vi.fn(), loadTemplates: vi.fn() }));
vi.mock('@/service/core/dataset/training/utils', () => ({
  createDatasetTrainingMongoWatch: mocks.training
}));
vi.mock('@fastgpt/service/core/app/templates/templateSchema', () => ({
  MongoAppTemplate: { watch: mocks.watch }
}));
vi.mock('@fastgpt/service/core/app/templates/register', () => ({
  getAppTemplatesAndLoadThem: mocks.loadTemplates
}));
import { startMongoWatch } from '@/service/common/system/volumnMongoWatch';

describe('startMongoWatch', () => {
  let stream: FakeChangeStream;
  let stop: (() => Promise<void>) | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    stream = createFakeChangeStream();
    mocks.watch.mockReturnValue(stream);
    mocks.training.mockReturnValue({ close: vi.fn() });
  });
  afterEach(async () => {
    await stop?.();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers only training and template streams and closes the previous registration', async () => {
    const configWatch = vi.spyOn(MongoSystemInstanceConfig, 'watch');
    await startMongoWatch();
    stop = await startMongoWatch();
    expect(configWatch).not.toHaveBeenCalled();
    expect(mocks.watch).toHaveBeenCalledTimes(2);
    expect(mocks.training.mock.results[0].value.close).toHaveBeenCalledOnce();
    expect(stream.close).toHaveBeenCalledOnce();
  });

  it('debounces template changes and reloads after the existing five-second grace period', async () => {
    vi.useFakeTimers();
    stop = await startMongoWatch();
    stream.emit('change', { operationType: 'insert' });
    stream.emit('change', { operationType: 'update' });
    await vi.advanceTimersByTimeAsync(5499);
    expect(mocks.loadTemplates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.loadTemplates).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reconnects a failed template stream and reloads to compensate for missed changes', async () => {
    vi.useFakeTimers();
    stop = await startMongoWatch();
    mocks.watch.mockReturnValueOnce(createFakeChangeStream());
    stream.emit('error', new Error('connection closed'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.watch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5500);
    expect(mocks.loadTemplates).toHaveBeenCalledExactlyOnceWith(true);
  });
});
