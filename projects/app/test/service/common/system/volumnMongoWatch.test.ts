import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import { createFakeChangeStream, type FakeChangeStream } from '@test/utils/changeStream';

const mocks = vi.hoisted(() => {
  const configStreams: unknown[] = [];
  const templateStreams: unknown[] = [];
  return {
    configStreams,
    templateStreams,
    configWatch: vi.fn(() => {
      const stream = mocks.createStream();
      mocks.configStreams.push(stream);
      return stream;
    }),
    templateWatch: vi.fn(() => {
      const stream = mocks.createStream();
      mocks.templateStreams.push(stream);
      return stream;
    }),
    createStream: () => ({ on: vi.fn().mockReturnThis(), close: vi.fn() }),
    datasetWatch: vi.fn(),
    initSystemConfig: vi.fn(),
    loadAppTemplates: vi.fn()
  };
});

vi.mock('@fastgpt/service/common/system/config/schema', () => ({
  MongoSystemConfigs: { watch: mocks.configWatch }
}));
vi.mock('@/service/core/dataset/training/utils', () => ({
  createDatasetTrainingMongoWatch: mocks.datasetWatch
}));
vi.mock('@fastgpt/service/core/app/templates/templateSchema', () => ({
  MongoAppTemplate: { watch: mocks.templateWatch }
}));
vi.mock('@/service/common/system', () => ({
  initSystemConfig: mocks.initSystemConfig
}));
vi.mock('@fastgpt/service/core/app/templates/register', () => ({
  getAppTemplatesAndLoadThem: mocks.loadAppTemplates
}));

import { startMongoWatch } from '@/service/common/system/volumnMongoWatch';

const fakeStreamAt = (streams: unknown[], index: number) => streams[index] as FakeChangeStream;

afterEach(() => {
  vi.useRealTimers();
});

describe('startMongoWatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configStreams.length = 0;
    mocks.templateStreams.length = 0;
    mocks.configWatch.mockImplementation(() => {
      const stream = createFakeChangeStream();
      mocks.configStreams.push(stream);
      return stream;
    });
    mocks.templateWatch.mockImplementation(() => {
      const stream = createFakeChangeStream();
      mocks.templateStreams.push(stream);
      return stream;
    });
    mocks.datasetWatch.mockReturnValue({ close: vi.fn() });
  });

  it('只监听配置、训练和模板，重启时关闭旧 watch，不打开模型目录 watch', async () => {
    const modelWatch = vi.spyOn(MongoAIModel, 'watch');
    const defaultsWatch = vi.spyOn(MongoAIDefaultModel, 'watch');

    await startMongoWatch();
    await startMongoWatch();

    expect(mocks.configWatch).toHaveBeenCalledTimes(2);
    expect(mocks.datasetWatch).toHaveBeenCalledTimes(2);
    expect(mocks.templateWatch).toHaveBeenCalledTimes(2);
    expect(fakeStreamAt(mocks.configStreams, 0).close).toHaveBeenCalledOnce();
    expect(fakeStreamAt(mocks.templateStreams, 0).close).toHaveBeenCalledOnce();
    expect(mocks.datasetWatch.mock.results[0].value.close).toHaveBeenCalledOnce();
    expect(modelWatch).not.toHaveBeenCalled();
    expect(defaultsWatch).not.toHaveBeenCalled();
  });

  it('配置变更事件触发配置重载，无关事件不触发', async () => {
    await startMongoWatch();
    const configStream = fakeStreamAt(mocks.configStreams, 0);

    configStream.emit('change', { operationType: 'update', updateDescription: {} });
    await vi.waitFor(() => expect(mocks.initSystemConfig).toHaveBeenCalledTimes(1));

    configStream.emit('change', {
      operationType: 'insert',
      fullDocument: { type: 'fastgptPro' }
    });
    configStream.emit('change', { operationType: 'insert', fullDocument: { type: 'license' } });
    configStream.emit('change', {
      operationType: 'insert',
      fullDocument: { type: 'systemMsgModal' }
    });
    await vi.waitFor(() => expect(mocks.initSystemConfig).toHaveBeenCalledTimes(3));

    // 非 fastgptPro/license 的 insert 不触发重载。
    configStream.emit('change', { operationType: 'delete' });
    await Promise.resolve();
    expect(mocks.initSystemConfig).toHaveBeenCalledTimes(3);
  });

  it('流终止后自动重建游标，并补偿重连期间丢失的配置变更', async () => {
    vi.useFakeTimers();
    await startMongoWatch();
    const firstStream = fakeStreamAt(mocks.configStreams, 0);

    // 终止性错误不会自愈，必须由 watch 层重建。
    firstStream.emit('error', new Error('Operation interrupted because client was closed'));
    expect(mocks.configWatch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.configWatch).toHaveBeenCalledTimes(2);
    // 断线期间写入的配置不会重放，只能重新读一次最新值。
    expect(mocks.initSystemConfig).toHaveBeenCalledTimes(1);

    const secondStream = fakeStreamAt(mocks.configStreams, 1);
    secondStream.emit('change', { operationType: 'update', updateDescription: {} });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.initSystemConfig).toHaveBeenCalledTimes(2);
  });

  it('集合被 drop 触发 invalidate 时重建游标，且不把它当作配置变更事件', async () => {
    vi.useFakeTimers();
    await startMongoWatch();
    const configStream = fakeStreamAt(mocks.configStreams, 0);

    configStream.emit('change', { operationType: 'invalidate' });
    await vi.advanceTimersByTimeAsync(1000);

    expect(mocks.configWatch).toHaveBeenCalledTimes(2);
    // 只允许重连补偿读一次：若 invalidate 也被当成变更事件派发，这里会是 2 次。
    expect(mocks.initSystemConfig).toHaveBeenCalledTimes(1);
  });

  it('模板变更防抖后延迟重拉，重连时同样触发重拉', async () => {
    vi.useFakeTimers();
    await startMongoWatch();
    const templateStream = fakeStreamAt(mocks.templateStreams, 0);

    templateStream.emit('change', { operationType: 'insert' });
    // 防抖 500ms + 延迟 5s 读库，避免读到写一半的中间状态。
    await vi.advanceTimersByTimeAsync(5000 + 500);
    expect(mocks.loadAppTemplates).toHaveBeenCalledTimes(1);
    expect(mocks.loadAppTemplates).toHaveBeenCalledWith(true);

    templateStream.emit('close');
    await vi.advanceTimersByTimeAsync(1000 + 5000);
    expect(mocks.templateWatch).toHaveBeenCalledTimes(2);
    expect(mocks.loadAppTemplates).toHaveBeenCalledTimes(2);
  });
});
