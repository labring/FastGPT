import { ModelTypeEnum, ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createModel: vi.fn(),
  updateModel: vi.fn(),
  deleteModels: vi.fn(),
  appendModelToChannels: vi.fn(),
  syncModelNameInChannels: vi.fn(),
  removeModelsFromChannels: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../../../core/ai/model/mutation', () => ({
  createModel: mocks.createModel,
  updateModel: mocks.updateModel,
  deleteModels: mocks.deleteModels
}));

vi.mock('../../../../core/ai/channel/service', () => ({
  appendModelToChannels: mocks.appendModelToChannels,
  syncModelNameInChannels: mocks.syncModelNameInChannels,
  removeModelsFromChannels: mocks.removeModelsFromChannels
}));

vi.mock('../../../../common/logger', () => ({
  LogCategories: { MODULE: { AI: { MODEL: 'ai_model' } } },
  getLogger: vi.fn(() => ({
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }))
}));

import {
  createModelWithLifecycle,
  updateModelWithLifecycle,
  deleteModelsWithLifecycle
} from '../../../../core/ai/model/lifecycle';

describe('model lifecycle domain service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createModelWithLifecycle', () => {
    const dummyModelData = {
      model: 'gpt-test',
      name: 'GPT Test',
      provider: 'OpenAI',
      type: ModelTypeEnum.llm,
      scope: ModelScopeEnum.team,
      config: { maxContext: 16000, maxResponse: 8000 }
    } as any;

    it('creates model and appends to channels when channelIds are provided', async () => {
      mocks.createModel.mockResolvedValue({ modelId: 'mock-model-id-123' });
      mocks.appendModelToChannels.mockResolvedValue(undefined);

      const result = await createModelWithLifecycle({
        modelData: dummyModelData,
        channelType: 'team',
        channelIds: [1, 2],
        tmbId: 'mock-tmb-id',
        teamId: 'mock-team-id'
      });

      expect(mocks.createModel).toHaveBeenCalledWith({
        modelData: dummyModelData,
        channelType: 'team',
        tmbId: 'mock-tmb-id',
        teamId: 'mock-team-id'
      });

      expect(mocks.appendModelToChannels).toHaveBeenCalledWith({
        channelIds: [1, 2],
        model: 'gpt-test',
        channelType: 'team',
        tmbId: 'mock-tmb-id'
      });

      expect(result).toEqual({ modelId: 'mock-model-id-123' });
    });

    it('creates model and skips appendModelToChannels when channelIds are empty or omitted', async () => {
      mocks.createModel.mockResolvedValue({ modelId: 'mock-model-id-456' });

      const result = await createModelWithLifecycle({
        modelData: dummyModelData,
        channelType: 'system',
        channelIds: []
      });

      expect(mocks.createModel).toHaveBeenCalledWith({
        modelData: dummyModelData,
        channelType: 'system',
        tmbId: undefined,
        teamId: undefined
      });

      expect(mocks.appendModelToChannels).not.toHaveBeenCalled();
      expect(result).toEqual({ modelId: 'mock-model-id-456' });
    });
  });

  describe('updateModelWithLifecycle', () => {
    it('delegates to updateModel injecting syncModelNameInChannels', async () => {
      mocks.updateModel.mockResolvedValue(undefined);

      await updateModelWithLifecycle({
        modelId: 'mock-model-id',
        channelType: 'team',
        tmbId: 'mock-tmb-id',
        modelData: {
          type: ModelTypeEnum.llm,
          name: 'Renamed Model',
          model: 'gpt-new'
        } as any
      });

      expect(mocks.updateModel).toHaveBeenCalledWith({
        modelId: 'mock-model-id',
        channelType: 'team',
        tmbId: 'mock-tmb-id',
        modelData: {
          type: ModelTypeEnum.llm,
          name: 'Renamed Model',
          model: 'gpt-new'
        },
        syncModelName: mocks.syncModelNameInChannels
      });
    });
  });

  describe('deleteModelsWithLifecycle', () => {
    it('deletes models and cleans up channel mappings', async () => {
      mocks.deleteModels.mockResolvedValue(['gpt-1', 'gpt-2']);
      mocks.removeModelsFromChannels.mockResolvedValue(undefined);

      const deleted = await deleteModelsWithLifecycle({
        modelIds: ['id-1', 'id-2'],
        channelType: 'team',
        tmbId: 'mock-tmb-id'
      });

      expect(mocks.deleteModels).toHaveBeenCalledWith({
        modelIds: ['id-1', 'id-2'],
        channelType: 'team',
        tmbId: 'mock-tmb-id'
      });

      expect(mocks.removeModelsFromChannels).toHaveBeenCalledWith({
        models: ['gpt-1', 'gpt-2'],
        channelType: 'team',
        tmbId: 'mock-tmb-id'
      });

      expect(deleted).toEqual(['gpt-1', 'gpt-2']);
      expect(mocks.loggerError).not.toHaveBeenCalled();
    });

    it('gracefully tolerates channel mapping cleanup failure without throwing', async () => {
      mocks.deleteModels.mockResolvedValue(['gpt-1']);
      const error = new Error('AIProxy network error');
      mocks.removeModelsFromChannels.mockRejectedValue(error);

      const deleted = await deleteModelsWithLifecycle({
        modelIds: ['id-1'],
        channelType: 'system'
      });

      expect(mocks.deleteModels).toHaveBeenCalledWith({
        modelIds: ['id-1'],
        channelType: 'system',
        tmbId: undefined
      });

      expect(mocks.removeModelsFromChannels).toHaveBeenCalledWith({
        models: ['gpt-1'],
        channelType: 'system',
        tmbId: ''
      });

      expect(deleted).toEqual(['gpt-1']);
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Clean up channel mappings after model deletion failed',
        expect.objectContaining({
          channelType: 'system',
          models: ['gpt-1'],
          error
        })
      );
    });
  });
});
