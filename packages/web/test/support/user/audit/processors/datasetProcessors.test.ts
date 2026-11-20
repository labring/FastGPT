import { describe, expect, it } from 'vitest';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  createDatasetAuditProcessors,
  processDatasetCollectionSpecific,
  processDatasetConfigUpdateSpecific
} from '@fastgpt/web/support/user/audit/processors/datasetProcessors';

const t = (key: string) =>
  ({
    'account_team:dataset_config_item_name': '名称',
    'account_team:dataset_config_item_externalReadUrl': '外部预览地址',
    'account_team:dataset_config_item_chunkSettings': '分块参数',
    'common:core.dataset.file': '文件',
    'common:File': '文件'
  })[key] ?? key;

describe('processDatasetConfigUpdateSpecific', () => {
  it.each([
    ['account_team:dataset_config_item_name', '名称'],
    ['account_team:dataset_config_item_externalReadUrl', '外部预览地址'],
    [
      'account_team:dataset_config_item_chunkSettings · indexPrefixTitle',
      '分块参数 · indexPrefixTitle'
    ],
    [undefined, '']
  ])('translates only the label in %s and preserves raw values', (changeItem, expected) => {
    const metadata = Object.freeze({
      name: '张三',
      datasetName: 'account_team:member',
      changeItem,
      oldValue: 'https://old.example.com/read?fileId=1',
      newValue: 'common:yes'
    });
    expect(processDatasetConfigUpdateSpecific(metadata, t)).toEqual({
      ...metadata,
      changeItem: expected
    });
  });
});

describe('processDatasetCollectionSpecific', () => {
  it('translates known collection objectType while preserving location and unknown values', () => {
    const metadata = {
      name: 'user:owner',
      objectType: 'common:core.dataset.file',
      location: 'docs:api/https://example.com/read'
    };

    expect(processDatasetCollectionSpecific(metadata, t)).toEqual({
      ...metadata,
      objectType: '文件'
    });
  });

  it('leaves unknown objectType untouched and registers collection create processor', () => {
    const metadata = {
      objectType: 'custom_type',
      location: 'common:File'
    };
    expect(processDatasetCollectionSpecific(metadata, t)).toEqual(metadata);
    expect(createDatasetAuditProcessors[DatasetAuditEventEnum.DATASET_COLLECTION_CREATE]).toBe(
      processDatasetCollectionSpecific
    );
  });
});
