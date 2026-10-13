import { describe, expect, it } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getRootUser } from '@test/datas/users';

const COLLECTION_COUNT = 5_000;
const HIT_EVERY = 20;
const TAG_INDEX_KEY = { teamId: 1, datasetId: 1, 'tags.tagId': 1 } as const;
const TAG_INDEX_NAME = 'teamId_1_datasetId_1_tags.tagId_1';

const findIndexName = (stage: unknown): string | undefined => {
  if (!stage || typeof stage !== 'object') return;
  if (Reflect.get(stage, 'stage') === 'IXSCAN') return Reflect.get(stage, 'indexName');

  const inputStage = findIndexName(Reflect.get(stage, 'inputStage'));
  if (inputStage) return inputStage;

  const inputStages = Reflect.get(stage, 'inputStages');
  if (!Array.isArray(inputStages)) return;
  return inputStages.map(findIndexName).find(Boolean);
};

/** 验证新标签查询使用当前 Schema 声明的复合索引，不比较易受环境影响的墙钟时间。 */
describe('dataset collection tag index', () => {
  it('uses tags.tagId index and scans only matching collections', async () => {
    const root = await getRootUser();
    const datasetId = new Types.ObjectId();
    const targetTagId = String(new Types.ObjectId());
    const otherTagId = String(new Types.ObjectId());

    await MongoDatasetCollection.createIndexes({ background: true });
    for (let start = 0; start < COLLECTION_COUNT; start += 1_000) {
      await MongoDatasetCollection.insertMany(
        Array.from({ length: Math.min(1_000, COLLECTION_COUNT - start) }, (_, offset) => {
          const index = start + offset;
          return {
            teamId: root.teamId,
            tmbId: root.tmbId,
            datasetId,
            type: 'file',
            name: `collection-${index}`,
            tags: [{ tagId: index % HIT_EVERY === 0 ? targetTagId : otherTagId, value: index }]
          };
        })
      );
    }

    const explain = await MongoDatasetCollection.find(
      { teamId: root.teamId, datasetId, 'tags.tagId': targetTagId },
      '_id'
    )
      .hint(TAG_INDEX_KEY)
      .explain('executionStats')
      .then((result: any) => result[0] ?? result);

    expect(findIndexName(explain.queryPlanner?.winningPlan)).toBe(TAG_INDEX_NAME);
    expect(explain.executionStats?.nReturned).toBe(COLLECTION_COUNT / HIT_EVERY);
    expect(explain.executionStats?.totalDocsExamined).toBeLessThanOrEqual(
      COLLECTION_COUNT / HIT_EVERY
    );
  }, 300_000);
});
