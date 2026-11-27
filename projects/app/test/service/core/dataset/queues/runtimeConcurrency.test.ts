import { describe, it, vi } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createTrainingQueueConcurrencyFixture } from '@test/utils/trainingQueueConcurrency';

const model = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
  deleteOne: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/training/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/training/schema')>()),
  MongoDatasetTraining: model
}));
vi.mock('@fastgpt/service/common/mongo/sessionRun', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/mongo/sessionRun')>()),
  mongoSessionRun: async (run: (session: object) => Promise<unknown>) => run({})
}));
vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: async () => true
}));

import { datasetParseQueue } from '@/service/core/dataset/queues/datasetParse';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';

describe('dataset queue live concurrency limits', () => {
  it.each([
    {
      field: 'parseMaxProcess' as const,
      counter: 'datasetParseQueueLen' as const,
      mode: TrainingModeEnum.parse,
      consume: datasetParseQueue
    },
    {
      field: 'vectorMaxProcess' as const,
      counter: 'preCreatedQueueLen' as const,
      mode: TrainingModeEnum.index,
      consume: generatePreCreatedData
    }
  ])('applies $field changes without cancelling an in-flight lease', async (params) => {
    const fixture = createTrainingQueueConcurrencyFixture();
    model.findOneAndUpdate.mockImplementation(fixture.model.findOneAndUpdate);
    model.updateOne.mockImplementation(fixture.model.updateOne);
    model.deleteOne.mockImplementation(fixture.model.deleteOne);

    await fixture.verify(params);
  });
});
