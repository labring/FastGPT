import { beforeEach, describe, expect, it, vi } from 'vitest';

const modelIds = ['68ad85a7463006c963799a05', '68ad85a7463006c963799a06'];
const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  updateModels: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'session-1' }
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));
vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/core/ai/config/schema', () => ({
  MongoAIModel: { updateMany: mocks.updateModels }
}));
vi.mock('@fastgpt/service/core/ai/config/utils', () => ({
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));
vi.mock('@fastgpt/service/core/ai/config/entity', () => ({
  runSystemModelTransaction: vi.fn(async (callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import handler from '@/pages/api/admin/settings/model/updateStatus';

describe('PUT /api/admin/settings/model/updateStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateModels.mockResolvedValue({ matchedCount: modelIds.length });
  });

  it('updates selected model statuses and reloads the model cache once', async () => {
    await handler({ body: { modelIds, isActive: false } } as any);

    expect(mocks.updateModels).toHaveBeenCalledWith(
      { _id: { $in: modelIds }, scope: 'system' },
      { $set: { isActive: false } },
      { session: mocks.session }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('rejects the whole operation when any selected model no longer exists', async () => {
    mocks.updateModels.mockResolvedValueOnce({ matchedCount: 1 });

    await expect(handler({ body: { modelIds, isActive: true } } as any)).rejects.toBe(
      'modelUnExist'
    );
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
