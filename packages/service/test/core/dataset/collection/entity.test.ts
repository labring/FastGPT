import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { countDatasetCollectionsByDatasetIds } from '@fastgpt/service/core/dataset/collection/entity';

const teamId = new Types.ObjectId('65f000000000000000000101');
const otherTeamId = new Types.ObjectId('65f000000000000000000102');
const tmbId = new Types.ObjectId('65f000000000000000000103');
const datasetId = new Types.ObjectId('65f000000000000000000104');
const otherDatasetId = new Types.ObjectId('65f000000000000000000105');
const emptyDatasetId = new Types.ObjectId('65f000000000000000000106');
const folderId = new Types.ObjectId('65f000000000000000000107');
const otherTeamDatasetId = new Types.ObjectId('65f000000000000000000108');

const collection = ({
  dataset = datasetId,
  team = teamId,
  type,
  parentId,
  name
}: {
  dataset?: Types.ObjectId;
  team?: Types.ObjectId;
  type: DatasetCollectionTypeEnum;
  parentId?: Types.ObjectId;
  name: string;
}) => ({
  teamId: team,
  tmbId,
  datasetId: dataset,
  type,
  name,
  ...(parentId ? { parentId } : {})
});

describe('countDatasetCollectionsByDatasetIds', () => {
  beforeEach(async () => {
    await MongoDatasetCollection.deleteMany({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts non-folder collections only, including nested files', async () => {
    await MongoDatasetCollection.collection.insertMany([
      collection({ type: DatasetCollectionTypeEnum.folder, name: 'folder' }),
      collection({ type: DatasetCollectionTypeEnum.file, name: 'file' }),
      collection({ type: DatasetCollectionTypeEnum.link, name: 'link' }),
      collection({ type: DatasetCollectionTypeEnum.virtual, name: 'virtual' }),
      collection({ type: DatasetCollectionTypeEnum.images, name: 'images' }),
      collection({
        type: DatasetCollectionTypeEnum.file,
        parentId: folderId,
        name: 'nested file'
      })
    ]);

    const counts = await countDatasetCollectionsByDatasetIds({
      teamId: String(teamId),
      datasetIds: [String(datasetId)]
    });

    expect(counts.get(String(datasetId))).toBe(5);
  });

  it('counts each dataset independently and returns 0 for datasets without collections', async () => {
    await MongoDatasetCollection.collection.insertMany([
      collection({ type: DatasetCollectionTypeEnum.file, name: 'a-1' }),
      collection({ type: DatasetCollectionTypeEnum.file, name: 'a-2' }),
      collection({
        dataset: otherDatasetId,
        type: DatasetCollectionTypeEnum.folder,
        name: 'b-folder'
      })
    ]);

    const counts = await countDatasetCollectionsByDatasetIds({
      teamId: String(teamId),
      datasetIds: [String(datasetId), String(otherDatasetId), String(emptyDatasetId)]
    });

    expect(counts.get(String(datasetId))).toBe(2);
    expect(counts.get(String(otherDatasetId))).toBe(0);
    expect(counts.get(String(emptyDatasetId))).toBe(0);
  });

  it('ignores collections from another team', async () => {
    await MongoDatasetCollection.collection.insertMany([
      collection({
        dataset: otherTeamDatasetId,
        team: otherTeamId,
        type: DatasetCollectionTypeEnum.file,
        name: 'other team file'
      })
    ]);

    const counts = await countDatasetCollectionsByDatasetIds({
      teamId: String(teamId),
      datasetIds: [String(otherTeamDatasetId)]
    });

    expect(counts.get(String(otherTeamDatasetId))).toBe(0);
  });

  it.each([{ datasetIds: [] }, { datasetIds: ['invalid-dataset-id'] }])(
    'returns zero counts without querying mongo when there are no valid dataset IDs: $datasetIds',
    async ({ datasetIds }) => {
      const aggregateSpy = vi.spyOn(MongoDatasetCollection, 'aggregate');

      await expect(
        countDatasetCollectionsByDatasetIds({ teamId: String(teamId), datasetIds })
      ).resolves.toEqual(new Map(datasetIds.map((id) => [id, 0])));
      expect(aggregateSpy).not.toHaveBeenCalled();
    }
  );
});
