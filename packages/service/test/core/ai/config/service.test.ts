import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
  updateMany: vi.fn(),
  updatedReloadSystemModel: vi.fn(),
  session: { id: 'model-update-session' }
}));

vi.mock('../../../../core/ai/config/schema', () => ({
  MongoAIModel: {
    findOne: mocks.findOne,
    updateOne: mocks.updateOne,
    updateMany: mocks.updateMany
  }
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
    vi.resetAllMocks();
    mocks.findOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ type: ModelTypeEnum.llm })
    });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.updateMany.mockResolvedValue({ matchedCount: 1 });
  });

  it('updates one existing model configuration and reloads the runtime snapshot', async () => {
    await updateSystemModelConfig({ modelId: 'model-1', modelData });

    expect(mocks.findOne).toHaveBeenCalledWith(
      { _id: 'model-1', scope: ModelScopeEnum.system },
      { type: 1 }
    );
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { _id: 'model-1', scope: ModelScopeEnum.system, type: ModelTypeEnum.llm },
      {
        $set: {
          provider: modelData.provider,
          name: modelData.name,
          isActive: modelData.isActive,
          config: modelData.config
        },
        $unset: {
          requestUrl: 1,
          requestAuth: 1,
          testMode: 1,
          charsPointsPrice: 1,
          priceTiers: 1,
          inputPrice: 1,
          outputPrice: 1
        }
      }
    );
    expect(mocks.updatedReloadSystemModel).toHaveBeenCalledOnce();
  });

  it('rejects a missing configuration target without reloading the runtime snapshot', async () => {
    mocks.findOne.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue(null) });

    await expect(updateSystemModelConfig({ modelId: 'missing-model', modelData })).rejects.toBe(
      'modelUnExist'
    );
    expect(mocks.updateOne).not.toHaveBeenCalled();
    expect(mocks.updatedReloadSystemModel).not.toHaveBeenCalled();
  });

  it('rejects attempts to change the persisted model type', async () => {
    mocks.findOne.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue({ type: ModelTypeEnum.embedding })
    });

    await expect(updateSystemModelConfig({ modelId: 'model-1', modelData })).rejects.toThrow(
      'System model type cannot be changed'
    );
    expect(mocks.updateOne).not.toHaveBeenCalled();
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
