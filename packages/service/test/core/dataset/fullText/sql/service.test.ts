import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { buildSqlFullTextRows } from '@fastgpt/service/core/dataset/fullText/sql/service';

const synonyms = vi.hoisted(() => ({ config: vi.fn(), matcher: vi.fn() }));
vi.mock('@fastgpt/service/core/dataset/synonym/entity', () => ({
  getDatasetSynonymConfig: synonyms.config,
  getDatasetSynonymMatcher: synonyms.matcher
}));
beforeEach(() => {
  synonyms.config.mockReset().mockResolvedValue(null);
  synonyms.matcher.mockReset().mockResolvedValue({
    hasMappings: true,
    transform: (text: string) => ({ transformedText: text.replace('旧别名', '历史标准词') })
  });
});
const seed = async (version: number | undefined) => {
  const doc = await MongoDatasetData.create({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    datasetId: new Types.ObjectId(),
    collectionId: new Types.ObjectId(),
    synonymVersion: version,
    indexes: [
      { dataId: '1', type: DatasetDataIndexTypeEnum.custom, text: '旧别名的说明' },
      { dataId: '2', type: DatasetDataIndexTypeEnum.imageEmbedding, text: 'private/image.png' }
    ]
  });
  return (await MongoDatasetData.findById(doc._id).lean())!;
};
describe('SQL full-text historical input', () => {
  it('preserves untransformed history and makes image full text empty', async () => {
    for (const version of [0, undefined]) {
      const rows = await buildSqlFullTextRows(await seed(version));
      expect(rows.map(({ text }) => text)).toEqual(['旧别名的说明', '']);
      expect(rows.map(({ vectorId }) => vectorId)).toEqual(['1', '2']);
    }
    expect(synonyms.matcher).not.toHaveBeenCalled();
  });
  it('uses the recorded immutable version rather than the latest configured version', async () => {
    synonyms.config.mockResolvedValue({ version: 9, enabled: true });
    const data = await seed(3);
    expect((await buildSqlFullTextRows(data)).map(({ text }) => text)).toEqual([
      '历史标准词的说明',
      ''
    ]);
    expect(synonyms.matcher).toHaveBeenCalledWith({
      teamId: String(data.teamId),
      datasetId: String(data.datasetId),
      fileVersion: 3
    });
  });

  it('does not require historical synonym snapshots for image-only indexes', async () => {
    const data = await seed(3);
    data.indexes = data.indexes.filter(
      (index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding
    );
    synonyms.matcher.mockResolvedValue({ hasMappings: false });
    expect((await buildSqlFullTextRows(data)).map(({ text }) => text)).toEqual(['']);
    expect(synonyms.config).not.toHaveBeenCalled();
    expect(synonyms.matcher).not.toHaveBeenCalled();
  });
  it('preserves a known disabled version but rejects missing history instead of guessing', async () => {
    synonyms.config.mockResolvedValue({ version: 3, enabled: false });
    expect((await buildSqlFullTextRows(await seed(3)))[0].text).toBe('旧别名的说明');
    expect(synonyms.matcher).not.toHaveBeenCalled();
    await expect(buildSqlFullTextRows(await seed(undefined))).rejects.toThrow('version is missing');
    synonyms.config.mockResolvedValue({ version: 9, enabled: true });
    synonyms.matcher.mockResolvedValue({ hasMappings: false });
    await expect(buildSqlFullTextRows(await seed(3))).rejects.toThrow('snapshot is unavailable');
  });
});
