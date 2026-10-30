import { describe, expect, it } from 'vitest';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  createDatasetAuditProcessors,
  processDatasetCollectionSpecific,
  processDatasetConfigUpdateSpecific
} from '@/pageComponents/account/team/Audit/dataset/audit';

/** 模拟 i18next：只有已知 key 会命中，未命中时原样返回（与项目 i18n 行为一致）。 */
const t = (key: string) =>
  ({
    'account_team:dataset_config_item_name': '名称',
    'account_team:dataset_config_item_externalReadUrl': '外部预览地址',
    'account_team:dataset_config_item_chunkSettings': '分块参数',
    'account_team:dataset_content_change_item_name': '名称',
    'account_team:dataset_content_change_item_status': '状态',
    'account_team:dataset_content_status_enabled': '启用',
    'account_team:dataset_content_status_disabled': '禁用',
    'common:core.dataset.file': '文件',
    'common:File': '文件'
  })[key] ?? key;

describe('dataset audit processors', () => {
  it('preserves collection names and paths while translating declared labels', () => {
    const metadata = {
      name: 'user:owner',
      datasetName: 'docs:api',
      collectionName: 'https://example.com/read',
      objectType: 'common:core.dataset.file',
      action: 'rename',
      changeItem: 'account_team:dataset_content_change_item_name',
      oldValue: 'common:File',
      newValue: 'https://example.com/new'
    };

    expect(processDatasetCollectionSpecific(metadata, t)).toEqual({
      ...metadata,
      objectType: '文件',
      changeItem: '名称'
    });
  });

  it.each(['enable', 'disable'])('translates collection status values for %s', (action) => {
    expect(
      processDatasetCollectionSpecific(
        {
          action,
          changeItem: 'account_team:dataset_content_change_item_status',
          oldValue: 'account_team:dataset_content_status_enabled',
          newValue: 'account_team:dataset_content_status_disabled'
        },
        t
      )
    ).toMatchObject({ changeItem: '状态', oldValue: '启用', newValue: '禁用' });
  });

  it('leaves tag snapshots untouched', () => {
    const metadata = {
      collectionName: 'common:File',
      tagName: 'team:dev',
      parentResource: 'docs:v2'
    };
    expect(processDatasetCollectionSpecific(metadata, t)).toEqual(metadata);
  });

  it('registers a processor for the dataset config update event', () => {
    expect(createDatasetAuditProcessors[DatasetAuditEventEnum.DATASET_CONFIG_UPDATE]).toBe(
      processDatasetConfigUpdateSpecific
    );
  });

  it('translates only changeItem and leaves user values untouched', () => {
    const result = processDatasetConfigUpdateSpecific(
      {
        name: '张三',
        datasetName: '产品手册',
        changeItem: 'account_team:dataset_config_item_externalReadUrl',
        oldValue: 'https://old.example.com/read?fileId=1',
        newValue: 'https://new.example.com/read?fileId=2'
      },
      t
    );

    expect(result.changeItem).toBe('外部预览地址');
    // URL 里的 http:// 不能被当成 i18n key 翻译掉，否则审计里的地址会被破坏
    expect(result.oldValue).toBe('https://old.example.com/read?fileId=1');
    expect(result.newValue).toBe('https://new.example.com/read?fileId=2');
  });

  it('translates only the item key when changeItem carries a field path', () => {
    const result = processDatasetConfigUpdateSpecific(
      {
        datasetName: '产品手册',
        changeItem: 'account_team:dataset_config_item_chunkSettings · indexPrefixTitle',
        oldValue: '关闭',
        newValue: '开启'
      },
      t
    );

    // 只翻译前缀，字段路径保持原样，避免把字段名也当成 i18n key
    expect(result.changeItem).toBe('分块参数 · indexPrefixTitle');
  });

  it('keeps the remaining metadata fields for the log template', () => {
    const result = processDatasetConfigUpdateSpecific(
      {
        name: '张三',
        datasetName: '产品手册',
        changeItem: 'account_team:dataset_config_item_name',
        oldValue: 'old',
        newValue: 'new'
      },
      t
    );

    expect(result).toMatchObject({
      name: '张三',
      datasetName: '产品手册',
      changeItem: '名称',
      oldValue: 'old',
      newValue: 'new'
    });
  });
});
