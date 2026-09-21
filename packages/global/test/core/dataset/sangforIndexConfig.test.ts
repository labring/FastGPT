import { describe, expect, it } from 'vitest';
import {
  ChunkSettingsSchema,
  sangforChunkSettingsSchema,
  sangforIndexConfigSchema
} from '@fastgpt/global/core/dataset/type';
import {
  ApiCreateCollectionBaseSchema,
  CreateApiCollectionV2BodySchema,
  CreateCollectionByFileIdBodySchema,
  CreateLinkCollectionBodySchema,
  CreateTextCollectionBodySchema
} from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import { GetPreviewChunksBodySchema } from '@fastgpt/global/openapi/core/dataset/file/api';

// sangfor 索引增强字段只属于 sangfor 导入链路：整体收敛为一个嵌套对象，且只挂在 sangfor
// 实际会打到的 leaf 上，通用 ChunkSettingsSchema 与其它开源 leaf 都不认识它。
const sangforFields = {
  hypeIndexes: true,
  small2bigIndexes: true,
  autoIndexesConfig: { questionIndex: true, summaryIndex: false },
  hypeIndexPrompt: 'hype prompt',
  small2bigConfig: { chunkSize: 256, customReg: ['\\n'] },
  autoIndexesPrompt: 'auto prompt',
  imageIndexPrompt: 'image prompt'
};

const apiFile = {
  id: 'file-1',
  rawId: 'file-1',
  parentId: 'folder-1',
  name: 'File 1',
  type: 'file' as const,
  hasChild: false,
  updateTime: new Date(),
  createTime: new Date()
};

describe('sangfor index config 的放行边界', () => {
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

  it('通用 ApiCreateCollectionBaseSchema 既不认平铺字段，也不认嵌套对象', () => {
    const parsed = ApiCreateCollectionBaseSchema.parse({
      datasetId: 'dataset-id',
      ...sangforFields,
      sangforIndexConfig: sangforFields
    });

    expect(parsed).toEqual({ datasetId: 'dataset-id' });
  });

  it('sangforChunkSettingsSchema 只认嵌套的 sangforIndexConfig', () => {
    const nested = sangforChunkSettingsSchema.parse({
      chunkSize: 512,
      sangforIndexConfig: sangforFields
    });
    expect(nested).toEqual({ chunkSize: 512, sangforIndexConfig: sangforFields });

    // 平铺的增强字段不被识别，直接 strip，不会静默落进顶层
    const flat = sangforChunkSettingsSchema.parse({ ...sangforFields, chunkSize: 512 });
    expect(flat).toEqual({ chunkSize: 512 });
  });

  it('sangfor 导入链路打到的 leaf 保留嵌套对象', () => {
    const byFileId = CreateCollectionByFileIdBodySchema.parse({
      datasetId: 'dataset-id',
      fileId: 'dataset/a.pdf',
      chunkSize: 512,
      sangforIndexConfig: sangforFields
    });
    expect(byFileId.chunkSize).toBe(512);
    expect(byFileId.sangforIndexConfig).toEqual(sangforFields);

    const byLink = CreateLinkCollectionBodySchema.parse({
      datasetId: 'dataset-id',
      link: 'https://example.com',
      sangforIndexConfig: sangforFields
    });
    expect(byLink.sangforIndexConfig).toEqual(sangforFields);

    const byApiCollectionV2 = CreateApiCollectionV2BodySchema.parse({
      datasetId: 'dataset-id',
      sangforIndexConfig: sangforFields,
      apiFiles: [{ ...apiFile, chunkConfig: { chunkSize: 999, sangforIndexConfig: sangforFields } }]
    });
    expect(byApiCollectionV2.sangforIndexConfig).toEqual(sangforFields);
    expect(byApiCollectionV2.apiFiles[0].chunkConfig?.chunkSize).toBe(999);
    expect(byApiCollectionV2.apiFiles[0].chunkConfig?.sangforIndexConfig).toEqual(sangforFields);
  });

  it('未放行的开源 leaf 与预览接口仍 strip 掉嵌套对象', () => {
    const byText = CreateTextCollectionBodySchema.parse({
      datasetId: 'dataset-id',
      name: 'name',
      text: 'text',
      sangforIndexConfig: sangforFields
    });
    expect(byText).not.toHaveProperty('sangforIndexConfig');

    const preview = GetPreviewChunksBodySchema.parse({
      datasetId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      type: 'fileLocal',
      sourceId: 'dataset/a.pdf',
      overlapRatio: 0.2,
      sangforIndexConfig: sangforFields
    });
    expect(preview).not.toHaveProperty('sangforIndexConfig');
  });
});
