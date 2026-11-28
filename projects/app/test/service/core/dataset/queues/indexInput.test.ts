import { getIndexTrainingBaseIndexes } from '@/service/core/dataset/queues/indexInput';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import * as modelApi from '@fastgpt/service/core/ai/model/catalog/service';
import { addModelTestModel, getModelTestDefaults } from '@test/modelCache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamId = '68ad85a7463006c963799a06';
const vlmModelId = '507f1f77bcf86cd799439022';
beforeEach(() => {
  const llm = getModelTestDefaults().llm!;
  addModelTestModel({
    ...llm,
    modelId: vlmModelId,
    model: 'vlm-model',
    name: 'vlm-model',
    config: { ...llm.config, vision: true }
  });
});

describe('index training image embedding helpers', () => {
  it('propagates unexpected VLM lookup failures', async () => {
    const modelHandle = await modelApi.getTeamModelHandle({ teamId });
    const lookup = vi.spyOn(modelApi, 'getTeamModelHandle').mockResolvedValue({
      ...modelHandle,
      getModelData: () => {
        throw new Error('unexpected catalog failure');
      }
    });
    try {
      await expect(
        getIndexTrainingBaseIndexes({
          teamId,
          indexes: [{ type: DatasetDataIndexTypeEnum.image, text: 'description' }],
          dataset: { vlmModelId: vlmModelId },
          collection: { imageIndex: true }
        })
      ).rejects.toThrow('unexpected catalog failure');
    } finally {
      lookup.mockRestore();
    }
  });

  it.each([false, true])(
    'keeps text indexes with an unavailable VLM and imageIndex=%s',
    async (imageIndex) => {
      const result = await getIndexTrainingBaseIndexes({
        teamId,
        indexes: [
          { type: DatasetDataIndexTypeEnum.default, text: 'system' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual' }
        ],
        dataset: { vlmModelId: 'missing-vlm' },
        collection: { imageIndex }
      });

      expect(result).toEqual([{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }]);
    }
  );

  it.each([false, true])(
    'drops old image descriptions with an unavailable VLM and imageIndex=%s',
    async (imageIndex) => {
      const result = await getIndexTrainingBaseIndexes({
        teamId,
        indexes: [
          { type: DatasetDataIndexTypeEnum.image, text: 'old description' },
          { type: DatasetDataIndexTypeEnum.custom, text: 'manual' }
        ],
        dataset: { vlmModelId: 'missing-vlm' },
        collection: { imageIndex }
      });

      expect(result).toEqual([{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }]);
    }
  );

  it('drops system indexes and keeps the supported image description draft', async () => {
    const result = await getIndexTrainingBaseIndexes({
      teamId,
      indexes: [
        { type: DatasetDataIndexTypeEnum.default, text: 'old default' },
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual' },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/stale.png'
        },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description'
        }
      ],
      dataset: {
        vlmModelId: vlmModelId
      },
      collection: {
        imageIndex: true
      }
    });

    expect(result).toEqual([
      { type: DatasetDataIndexTypeEnum.custom, text: 'manual' },
      {
        type: DatasetDataIndexTypeEnum.image,
        text: 'image description'
      }
    ]);
  });

  it('should drop VLM image description indexes when collection image index is disabled', async () => {
    const result = await getIndexTrainingBaseIndexes({
      teamId,
      indexes: [
        { type: DatasetDataIndexTypeEnum.custom, text: 'manual' },
        {
          type: DatasetDataIndexTypeEnum.image,
          text: 'image description'
        },
        {
          type: DatasetDataIndexTypeEnum.imageEmbedding,
          text: 'dataset/team/main.png'
        }
      ],
      dataset: {
        vlmModelId: vlmModelId
      },
      collection: {
        imageIndex: false
      }
    });

    expect(result).toEqual([{ type: DatasetDataIndexTypeEnum.custom, text: 'manual' }]);
  });
});
