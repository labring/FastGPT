import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findEvaluations: vi.fn(),
  deleteEvaluations: vi.fn(),
  deleteEvalItems: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/evaluation/evalSchema', () => ({
  MongoEvaluation: {
    find: mocks.findEvaluations,
    deleteMany: mocks.deleteEvaluations
  }
}));

vi.mock('@fastgpt/service/core/app/evaluation/evalItemSchema', () => ({
  MongoEvalItem: {
    deleteMany: mocks.deleteEvalItems
  }
}));

import { deleteEvaluationsByTeamId } from '@fastgpt/service/core/app/evaluation/delete';

describe('deleteEvaluationsByTeamId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteEvaluations.mockResolvedValue(undefined);
    mocks.deleteEvalItems.mockResolvedValue(undefined);
  });

  it('deletes evaluation items by evalId before deleting their parent evaluations', async () => {
    const lean = vi.fn().mockResolvedValue([{ _id: 'eval-1' }, { _id: 'eval-2' }]);
    mocks.findEvaluations.mockReturnValue({ lean });

    await deleteEvaluationsByTeamId('team-1');

    expect(mocks.findEvaluations).toHaveBeenCalledWith({ teamId: 'team-1' }, '_id');
    expect(mocks.deleteEvalItems).toHaveBeenCalledWith({
      evalId: { $in: ['eval-1', 'eval-2'] }
    });
    expect(mocks.deleteEvaluations).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(mocks.deleteEvalItems.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteEvaluations.mock.invocationCallOrder[0]
    );
  });

  it('skips the child deletion when the team has no evaluations', async () => {
    mocks.findEvaluations.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    await deleteEvaluationsByTeamId('team-1');

    expect(mocks.deleteEvalItems).not.toHaveBeenCalled();
    expect(mocks.deleteEvaluations).toHaveBeenCalledWith({ teamId: 'team-1' });
  });

  it('keeps parent evaluations available when deleting their items fails', async () => {
    mocks.findEvaluations.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'eval-1' }])
    });
    mocks.deleteEvalItems.mockRejectedValue(new Error('delete items failed'));

    await expect(deleteEvaluationsByTeamId('team-1')).rejects.toThrow('delete items failed');

    expect(mocks.deleteEvaluations).not.toHaveBeenCalled();
  });
});
