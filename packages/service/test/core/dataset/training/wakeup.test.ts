import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbTransactionConflictError } from '@fastgpt/dal/db/errors';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbDialect } from '@fastgpt/dal/db/types';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { configureMongoDalRuntime } from '@fastgpt/service/common/mongo/dalRuntime';
import {
  bridgeClientSessionToDbSession,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createTrainingTaskLease } from '@fastgpt/service/core/dataset/training/service';
import {
  publishTrainingWakeup,
  subscribeTrainingWakeup,
  trainingWakeupChannel
} from '@fastgpt/service/core/dataset/training/wakeup';

describe('dataset training wakeup signal', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDbRuntime();
    configureMongoDalRuntime();
  });
  it('deduplicates modes and delivers Pub/Sub wakeup signal to subscribers', async () => {
    const receivedModes: TrainingModeEnum[][] = [];
    const sub = subscribeTrainingWakeup({
      onModes: (modes) => {
        receivedModes.push(modes);
      }
    });
    await sub.ready;

    await publishTrainingWakeup({
      modes: [TrainingModeEnum.qa, TrainingModeEnum.index, TrainingModeEnum.qa]
    });

    await vi.waitFor(() =>
      expect(receivedModes).toContainEqual([TrainingModeEnum.qa, TrainingModeEnum.index])
    );

    await sub.close();
  });

  it('swallows Redis publish errors so cron fallback keeps training resilient', async () => {
    const spy = vi
      .spyOn(trainingWakeupChannel, 'publish')
      .mockRejectedValueOnce(new Error('redis down'));

    await expect(
      publishTrainingWakeup({ modes: [TrainingModeEnum.parse] })
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });

  it('publishes target mode wakeup when lease.transition advances stage across processes', async () => {
    const receivedModes: TrainingModeEnum[][] = [];
    const sub = subscribeTrainingWakeup({
      onModes: (modes) => {
        receivedModes.push(modes);
      }
    });
    await sub.ready;

    const lockTime = new Date();
    const [task] = await MongoDatasetTraining.create([
      {
        teamId: createEntityId(),
        tmbId: createEntityId(),
        datasetId: createEntityId(),
        collectionId: createEntityId(),
        billId: 'bill-1',
        mode: TrainingModeEnum.auto,
        lockTime,
        retryCount: 3,
        q: 'hello'
      }
    ]);

    const lease = createTrainingTaskLease({
      _id: String(task._id),
      mode: TrainingModeEnum.auto,
      lockTime,
      retryCount: 3,
      teamId: String(task.teamId),
      datasetId: String(task.datasetId),
      collectionId: String(task.collectionId)
    });

    await lease.transition({ mode: TrainingModeEnum.index });
    await lease.stop();

    await vi.waitFor(() => expect(receivedModes).toContainEqual([TrainingModeEnum.index]));
    await sub.close();
  });

  it.each<DbDialect>(['mongo', 'oceanbase'])(
    'defers wakeup broadcast until %s runInTransaction commits and discards on rollback or retry',
    async (dialect) => {
      const published: TrainingModeEnum[][] = [];
      vi.spyOn(trainingWakeupChannel, 'publish').mockImplementation(async ({ modes }) => {
        published.push([...modes]);
      });

      await closeDbRuntime();
      configureDbRuntime({
        dialect,
        mainWriteUrl:
          dialect === 'mongo'
            ? 'mongodb://127.0.0.1:27017/test'
            : 'mysql://root@127.0.0.1:2881/test',
        transactionRunner: async ({ execute }) => execute({ fakeNativeTx: dialect })
      });

      // 1. 回滚时绝不广播唤醒信号。
      await expect(
        runInTransaction(async (tx) => {
          await publishTrainingWakeup({
            modes: [TrainingModeEnum.parse, TrainingModeEnum.index],
            tx
          });
          expect(published).toEqual([]);
          throw new Error('abort-tx');
        })
      ).rejects.toThrow('abort-tx');
      expect(published).toEqual([]);

      // 2. 冲突重试丢弃失败尝试的唤醒，提交后仅广播最终成功尝试的去重模式。
      let attempt = 0;
      await runInTransaction(async (tx) => {
        attempt += 1;
        await publishTrainingWakeup({
          modes:
            attempt === 1
              ? [TrainingModeEnum.qa]
              : [TrainingModeEnum.index, TrainingModeEnum.index, TrainingModeEnum.parse],
          tx
        });
        expect(published).toEqual([]);
        if (attempt === 1) {
          throw new DbTransactionConflictError(new Error('retry'));
        }
      });

      expect(attempt).toBe(2);
      expect(published).toEqual([[TrainingModeEnum.index, TrainingModeEnum.parse]]);
    }
  );

  it('defers wakeup broadcast on real mongoSessionRun when bridged via bridgeClientSessionToDbSession', async () => {
    const published: TrainingModeEnum[][] = [];
    vi.spyOn(trainingWakeupChannel, 'publish').mockImplementation(async ({ modes }) => {
      published.push([...modes]);
    });

    const actualSessionRun = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');

    await vi
      .mocked(mongoSessionRun)
      .withImplementation(actualSessionRun.mongoSessionRun, async () => {
        await expect(
          mongoSessionRun(async (session) => {
            await publishTrainingWakeup({
              modes: [TrainingModeEnum.qa],
              tx: bridgeClientSessionToDbSession(session)
            });
            expect(published).toEqual([]);
            throw new Error('rollback-mongo-session');
          })
        ).rejects.toThrow('rollback-mongo-session');
        expect(published).toEqual([]);

        await mongoSessionRun(async (session) => {
          await publishTrainingWakeup({
            modes: [TrainingModeEnum.auto, TrainingModeEnum.auto],
            tx: bridgeClientSessionToDbSession(session)
          });
          expect(published).toEqual([]);
        });
        expect(published).toEqual([[TrainingModeEnum.auto]]);
      });
  });
});
