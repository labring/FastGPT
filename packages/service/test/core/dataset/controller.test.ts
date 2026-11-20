import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import {
  MongoDatasetSynonym,
  MongoDatasetSynonymMapping
} from '@fastgpt/service/core/dataset/synonym/schema';
import {
  getDatasetSynonymConfig,
  getDatasetSynonymMatcher
} from '@fastgpt/service/core/dataset/synonym/entity';
import { normalizeSynonymTerm } from '@fastgpt/service/core/dataset/synonym/utils';
import { serviceEnv } from '@fastgpt/service/env';

const originalDatasetSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;

// 全局 S3 mock 的 dataset source 只覆盖上传链路，删除链路的重分块前缀清理需要显式补上。
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    deleteDatasetFilesByPrefix: vi.fn()
  })
}));

/**
 * 构造「冬瓜 ← 枕瓜」词条的两个版本：version-1 是历史残留，version 是当前生效版本。
 */
const seedSynonymConfig = async ({
  teamId,
  datasetId,
  version = 2
}: {
  teamId: string;
  datasetId: string;
  version?: number;
}) => {
  const config = await MongoDatasetSynonym.create({ teamId, datasetId, version, enabled: true });
  await MongoDatasetSynonymMapping.create(
    [version - 1, version].map((fileVersion) => ({
      teamId,
      datasetId,
      synonymFileId: config._id,
      fileVersion,
      logicalMappingId: new Types.ObjectId(),
      standardizedTerm: '冬瓜',
      normalizedStandardizedTerm: normalizeSynonymTerm('冬瓜'),
      synonymTerms: ['枕瓜'],
      normalizedSynonymTerms: [normalizeSynonymTerm('枕瓜')],
      allTerms: '冬瓜 枕瓜',
      fingerprint: `v${fileVersion}`
    }))
  );
  return config;
};

describe('delDatasetRelevantData synonym retention', () => {
  beforeEach(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
  });

  afterAll(() => {
    serviceEnv.DATASET_SYNONYM_ENABLED = originalDatasetSynonymEnabled;
  });

  // 网站知识库改分块设置是「数据重建」而不是删除知识库：清理完旧分块后，
  // 重建出的分块仍要按同一份词表做 embedding/重排/引用注入，所以词表必须可用。
  it('keeps the active vocabulary readable and matchable after a web re-chunk cleanup', async () => {
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    const config = await seedSynonymConfig({ teamId, datasetId, version: 2 });

    await mongoSessionRun((session) =>
      delDatasetRelevantData(
        { datasets: [{ _id: datasetId, teamId }], session },
        { keepSynonyms: true }
      )
    );

    // 配置仍可读取，且版本未变化（重建后的分块写入仍以该版本为准）。
    const keptConfig = await getDatasetSynonymConfig({ teamId, datasetId });
    expect(keptConfig?._id.toString()).toBe(config._id.toString());
    expect(keptConfig?.version).toBe(2);

    // 当前版本的映射原地保留，历史版本残留被顺手回收。
    const remainingVersions = await MongoDatasetSynonymMapping.distinct('fileVersion', {
      teamId,
      datasetId
    });
    expect(remainingVersions).toEqual([2]);

    // 真实检索能力：matcher 仍能命中「枕瓜 → 冬瓜」。
    const matcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(matcher.hasMappings).toBe(true);
    expect(matcher.transform('问一下枕瓜排骨汤').usedMappings).toMatchObject([
      { matchedTerm: '枕瓜', standardizedTerm: '冬瓜' }
    ]);
  });

  it('still cascades the vocabulary when the dataset itself is deleted', async () => {
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    await seedSynonymConfig({ teamId, datasetId, version: 2 });

    // 先预热 matcher 缓存：删除路径必须同时失效缓存，否则同一 key 会继续命中旧词表。
    const warmMatcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(warmMatcher.hasMappings).toBe(true);

    await mongoSessionRun((session) =>
      delDatasetRelevantData({ datasets: [{ _id: datasetId, teamId }], session })
    );

    expect(await getDatasetSynonymConfig({ teamId, datasetId })).toBeNull();
    expect(await MongoDatasetSynonymMapping.countDocuments({ teamId, datasetId })).toBe(0);

    const matcher = await getDatasetSynonymMatcher({ teamId, datasetId, fileVersion: 2 });
    expect(matcher.hasMappings).toBe(false);
    expect(matcher.transform('问一下枕瓜排骨汤').usedMappings).toEqual([]);
  });
});
