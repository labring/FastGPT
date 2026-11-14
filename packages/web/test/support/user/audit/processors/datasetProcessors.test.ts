import { describe, expect, it } from 'vitest';
import { processDatasetConfigUpdateSpecific } from '@fastgpt/web/support/user/audit/processors/datasetProcessors';

const t = (key: string) =>
  ({
    'account_team:dataset_config_item_name': '名称',
    'account_team:dataset_config_item_externalReadUrl': '外部预览地址',
    'account_team:dataset_config_item_chunkSettings': '分块参数'
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
