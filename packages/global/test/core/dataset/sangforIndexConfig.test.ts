import { describe, expect, it } from 'vitest';
import { ChunkSettingsSchema, sangforIndexConfigSchema } from '@fastgpt/global/core/dataset/type';
import {
  ApiCreateCollectionBaseSchema,
  CreateCollectionByFileIdBodySchema
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';

// sangfor 索引增强字段只属于 sangfor 导入链路，不能回到通用 ChunkSettingsSchema 里。
const sangforFields = {
  hypeIndexes: true,
  small2bigIndexes: true,
  autoIndexesConfig: { questionIndex: true, summaryIndex: false },
  hypeIndexPrompt: 'hype prompt',
  small2bigConfig: { chunkSize: 256, customReg: ['\\n'] },
  autoIndexesPrompt: 'auto prompt',
  imageIndexPrompt: 'image prompt'
};

describe('sangfor index config 与通用 ChunkSettingsSchema 的边界', () => {
  it('sangforIndexConfigSchema 保留全部 7 个字段', () => {
    expect(sangforIndexConfigSchema.parse(sangforFields)).toEqual(sangforFields);
  });

  it('通用 ChunkSettingsSchema 不再认识这 7 个字段（被 strip，且不报错）', () => {
    const parsed = ChunkSettingsSchema.parse({ ...sangforFields, chunkSize: 512 });

    expect(parsed).toEqual({ chunkSize: 512 });
    for (const key of Object.keys(sangforFields)) {
      expect(parsed).not.toHaveProperty(key);
    }
  });

  it('通用 ApiCreateCollectionBaseSchema 同样 strip 掉这 7 个字段', () => {
    const parsed = ApiCreateCollectionBaseSchema.parse({
      datasetId: 'dataset-id',
      ...sangforFields
    });

    for (const key of Object.keys(sangforFields)) {
      expect(parsed).not.toHaveProperty(key);
    }
  });

  it('sangfor 放行的 leaf schema（fileId）保留这 7 个字段', () => {
    const parsed = CreateCollectionByFileIdBodySchema.parse({
      datasetId: 'dataset-id',
      fileId: 'dataset/a.pdf',
      ...sangforFields
    });

    for (const [key, value] of Object.entries(sangforFields)) {
      expect(parsed[key as keyof typeof parsed]).toEqual(value);
    }
  });
});
