import { describe, expect, it } from 'vitest';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import {
  createDatasetAuditProcessors,
  processDatasetConfigUpdateSpecific
} from '@/pageComponents/account/team/Audit/dataset/audit';

/** 模拟 i18next：只有已知 key 会命中，未命中时原样返回（与项目 i18n 行为一致）。 */
const t = (key: string) =>
  ({
    'account_team:dataset_config_item_name': '名称',
    'account_team:dataset_config_item_externalReadUrl': '外部预览地址',
    'account_team:dataset_config_item_chunkSettings': '分块参数'
  })[key] ?? key;

describe('dataset audit processors', () => {
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
