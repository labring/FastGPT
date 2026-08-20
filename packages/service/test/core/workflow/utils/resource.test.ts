import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mongoDatasetFind: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>();
  return {
    ...actual,
    MongoDataset: {
      ...actual.MongoDataset,
      find: mocks.mongoDatasetFind
    }
  };
});

import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import {
  createWorkflowChildResourceContext,
  loadWorkflowResourceContext
} from '@fastgpt/service/core/workflow/utils/resource';

const createFindResult = (documents: unknown[] = []) => ({
  lean: vi.fn().mockResolvedValue(documents)
});

describe('workflow resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mongoDatasetFind.mockReturnValue(
      createFindResult([{ _id: 'dataset-1' }, { _id: 'dataset-2' }])
    );
  });

  it('inherits root cross-team permission when creating a child context', async () => {
    const rootContext = await loadWorkflowResourceContext({
      resources: [{ type: 'dataset', id: 'dataset-1' }],
      teamId: 'root-team',
      isRoot: true
    });

    const childContext = await runWithContext(
      { mcpClientMemory: {}, resourceContext: rootContext },
      () => createWorkflowChildResourceContext([{ type: 'dataset', id: 'dataset-2' }], 'child-team')
    );

    expect(childContext.isRoot).toBe(true);
    expect(mocks.mongoDatasetFind).toHaveBeenNthCalledWith(2, {
      _id: { $in: ['dataset-2'] },
      deleteTime: null
    });
  });
});
