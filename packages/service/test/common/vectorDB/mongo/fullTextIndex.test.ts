import { expect, it, vi } from 'vitest';
import { ensureMongoFullTextIndex } from '@fastgpt/service/common/vectorDB/mongo/fullTextIndex';
import { ensureMongoSearchIndex } from '@fastgpt/service/common/vectorDB/mongo/searchIndex';

vi.mock('@fastgpt/service/common/vectorDB/mongo/searchIndex', () => ({
  ensureMongoSearchIndex: vi.fn(),
  assertMongoSearchIndexReady: vi.fn()
}));

it('shares an in-flight build and checks the current catalog again after completion', async () => {
  const ensure = vi.mocked(ensureMongoSearchIndex);
  let complete!: () => void;
  ensure
    .mockReturnValueOnce(new Promise<void>((resolve) => (complete = resolve)))
    .mockRejectedValueOnce(new Error('index recreated with an incompatible definition'))
    .mockResolvedValueOnce(undefined);

  const first = ensureMongoFullTextIndex();
  expect(ensureMongoFullTextIndex()).toBe(first);
  expect(ensure).toHaveBeenCalledTimes(1);
  complete();
  await first;

  await expect(ensureMongoFullTextIndex()).rejects.toThrow('incompatible definition');
  await expect(ensureMongoFullTextIndex()).resolves.toBeUndefined();
  expect(ensure).toHaveBeenCalledTimes(3);
});
