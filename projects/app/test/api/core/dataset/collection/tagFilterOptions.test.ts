import listHandler from '@/pages/api/core/dataset/collection/listV2';
import tagFilterOptionsHandler from '@/pages/api/core/dataset/collection/tagFilterOptions';
import {
  DatasetCollectionTagTypeEnum,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoDatasetCollectionTagsV2 } from '@fastgpt/service/core/dataset/tag/schemaV2';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('collection tag filter options and listV2 tagFilters', () => {
  it('returns used values and filters collections by tag values', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'tag-filter-dataset',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });

    const [docType, version] = await MongoDatasetCollectionTagsV2.create([
      {
        teamId: root.teamId,
        datasetId: dataset._id,
        tag: '文档类型',
        tagType: DatasetCollectionTagTypeEnum.array,
        options: ['PRD', 'unused']
      },
      {
        teamId: root.teamId,
        datasetId: dataset._id,
        tag: '版本',
        tagType: DatasetCollectionTagTypeEnum.number
      }
    ]);

    await MongoDatasetCollection.create([
      {
        name: 'prd-file',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        tags: [
          { tagId: String(docType._id), value: ['PRD'] },
          { tagId: String(version._id), value: 2 }
        ]
      },
      {
        name: 'spec-file',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        tags: [{ tagId: String(docType._id), value: ['spec'] }]
      }
    ]);

    const optionsRes = await Call(tagFilterOptionsHandler, {
      auth: root,
      query: { datasetId: String(dataset._id) }
    });

    expect(optionsRes.code).toBe(200);
    const docTypeOption = optionsRes.data.list.find((item) => item.tagId === String(docType._id));
    const versionOption = optionsRes.data.list.find((item) => item.tagId === String(version._id));
    expect(docTypeOption?.values).toEqual(['PRD', 'spec']);
    expect(versionOption?.values).toEqual([2]);

    const listRes = await Call(listHandler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        pageSize: 10,
        offset: 0,
        tagFilters: [{ tagId: String(docType._id), values: ['PRD'] }]
      }
    });

    expect(listRes.code).toBe(200);
    expect(listRes.data.list.map((item) => item.name)).toEqual(['prd-file']);
  });

  it('requires every selected tag to match when combining filters', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'tag-filter-and-dataset',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModel: 'test',
      agentModel: 'test'
    });

    const [docType, version] = await MongoDatasetCollectionTagsV2.create([
      {
        teamId: root.teamId,
        datasetId: dataset._id,
        tag: '文档类型',
        tagType: DatasetCollectionTagTypeEnum.array
      },
      {
        teamId: root.teamId,
        datasetId: dataset._id,
        tag: '版本',
        tagType: DatasetCollectionTagTypeEnum.number
      }
    ]);

    await MongoDatasetCollection.create([
      {
        name: 'both',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        tags: [
          { tagId: String(docType._id), value: ['PRD'] },
          { tagId: String(version._id), value: 2 }
        ]
      },
      {
        name: 'only-type',
        type: DatasetCollectionTypeEnum.file,
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: dataset._id,
        tags: [{ tagId: String(docType._id), value: ['PRD'] }]
      }
    ]);

    const listRes = await Call(listHandler, {
      auth: root,
      body: {
        datasetId: String(dataset._id),
        pageSize: 10,
        offset: 0,
        tagFilters: [
          { tagId: String(docType._id), values: ['PRD'] },
          { tagId: String(version._id), values: [2] }
        ]
      }
    });

    expect(listRes.code).toBe(200);
    expect(listRes.data.list.map((item) => item.name)).toEqual(['both']);
  });
});
