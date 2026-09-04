import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'model-update-session' }
}));

vi.mock('../../../../core/ai/config/schema', () => ({
  MongoAIModel: { updateMany: mocks.updateMany }
}));
vi.mock('../../../../core/ai/config/utils', () => ({
  updatedReloadSystemModel: mocks.updatedReloadSystemModel
}));
vi.mock('../../../../common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn((callback: (session: unknown) => Promise<unknown>) =>
    callback(mocks.session)
  )
}));

import {
  updateSystemModelConfig,
  updateSystemModelStatus
} from '../../../../core/ai/config/service';

const modelData = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  name: 'GPT test',
  scope: ModelScopeEnum.system,
  isActive: false,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

describe('system model update service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ matchedCount: 1 });
  });

  it('updates one existing model configuration and reloads the runtime snapshot', async () => {
    await updateSystemModelConfig({ modelId: 'model-1', modelData });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['model-1'] }, scope: ModelScopeEnum.system },
      { $set: modelData },
      { session: undefined }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('rejects a missing configuration target without reloading the runtime snapshot', async () => {
    mocks.updateMany.mockResolvedValueOnce({ matchedCount: 0 });

    await expect(updateSystemModelConfig({ modelId: 'missing-model', modelData })).rejects.toBe(
      'modelUnExist'
    );
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('updates every requested status inside one transaction and reloads once', async () => {
    mocks.updateMany.mockResolvedValueOnce({ matchedCount: 2 });

    await updateSystemModelStatus({ modelIds: ['model-1', 'model-2'], isActive: true });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['model-1', 'model-2'] }, scope: ModelScopeEnum.system },
      { $set: { isActive: true } },
      { session: mocks.session }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('rejects a partially matched status update without reloading the runtime snapshot', async () => {
    mocks.updateMany.mockResolvedValueOnce({ matchedCount: 1 });

    await expect(
      updateSystemModelStatus({ modelIds: ['model-1', 'missing-model'], isActive: false })
    ).rejects.toBe('modelUnExist');
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });
});
