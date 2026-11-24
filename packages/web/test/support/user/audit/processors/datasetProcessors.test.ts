import { describe, expect, it, vi } from 'vitest';
import {
  DATASET_CONFIG_REDACTED_VALUE,
  DatasetConfigAuditItemEnum,
  datasetConfigAuditFieldLabelMap,
  datasetConfigAuditItemLabelMap,
  datasetConfigAuditValueLabelMap
} from '@fastgpt/global/core/dataset/audit/constants/config';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { ApiDatasetServerSchema } from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  ChunkSettingsSchema,
  DatasetSchema,
  sangforFileParseConfigSchema
} from '@fastgpt/global/core/dataset/type';
import {
  createDatasetAuditProcessors,
  processDatasetCollectionSpecific,
  processDatasetConfigUpdateSpecific
} from '@fastgpt/web/support/user/audit/processors/datasetProcessors';
import zhCNAccountTeam from '@fastgpt/web/i18n/zh-CN/account_team.json';
import enAccountTeam from '@fastgpt/web/i18n/en/account_team.json';
import zhHantAccountTeam from '@fastgpt/web/i18n/zh-Hant/account_team.json';
import koKRAccountTeam from '@fastgpt/web/i18n/ko-KR/account_team.json';
import zhCNCommon from '@fastgpt/web/i18n/zh-CN/common.json';
import enCommon from '@fastgpt/web/i18n/en/common.json';
import zhHantCommon from '@fastgpt/web/i18n/zh-Hant/common.json';
import koKRCommon from '@fastgpt/web/i18n/ko-KR/common.json';

const zhCNResources: Record<string, Record<string, string>> = {
  account_team: zhCNAccountTeam,
  common: zhCNCommon
};

const t = (key: string) => {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) return key;
  const ns = key.slice(0, separatorIndex);
  const entry = key.slice(separatorIndex + 1);
  return zhCNResources[ns]?.[entry] ?? key;
};

describe('processDatasetConfigUpdateSpecific', () => {
  it.each([
    ['account_team:dataset_config_item_name', '名称'],
    ['account_team:dataset_config_item_externalReadUrl', '外部预览地址'],
    [
      'account_team:dataset_config_item_chunkSettings · indexPrefixTitle',
      '分块参数 · 将标题加入索引'
    ],
    ['account_team:dataset_config_item_websiteConfig · selector', '网站抓取配置 · 选择器'],
    [
      'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization',
      '第三方来源配置 · API 认证信息'
    ],
    [
      'account_team:dataset_config_item_fileParseConfig · keep_header_footer',
      '文件解析配置 · 保留页眉页脚'
    ],
    ['account_team:dataset_config_item_chunkSettings · unknownField', '分块参数 · unknownField'],
    ['account_team:dataset_config_item_chunkSettings · toString', '分块参数 · toString'],
    [undefined, '']
  ])('translates config item and known subfield path in %s', (changeItem, expected) => {
    const metadata = Object.freeze({
      name: '张三',
      datasetName: 'account_team:member',
      changeItem,
      oldValue: 'https://old.example.com/read?fileId=1',
      newValue: 'https://new.example.com/read?fileId=2'
    });
    expect(processDatasetConfigUpdateSpecific(metadata, t)).toEqual({
      ...metadata,
      changeItem: expected
    });
  });

  it.each([
    ['common:no', 'common:yes', '否', '是'],
    ['-', DATASET_CONFIG_REDACTED_VALUE, '-', '已隐藏'],
    [DATASET_CONFIG_REDACTED_VALUE, DATASET_CONFIG_REDACTED_VALUE, '已隐藏', '已隐藏'],
    ['common:UnKnow', 'GPT-4o', '未知', 'GPT-4o']
  ])(
    'translates whitelisted system values (%s -> %s)',
    (oldValue, newValue, expectedOld, expectedNew) => {
      expect(
        processDatasetConfigUpdateSpecific(
          {
            name: '张三',
            datasetName: '产品手册',
            changeItem: 'account_team:dataset_config_item_autoSync',
            oldValue,
            newValue
          },
          t
        )
      ).toEqual({
        name: '张三',
        datasetName: '产品手册',
        changeItem: '自动同步',
        oldValue: expectedOld,
        newValue: expectedNew
      });
    }
  );

  it('preserves user values containing colons or prototype keys without calling t', () => {
    const spyT = vi.fn(t);
    const metadata = Object.freeze({
      name: 'account_team:用户',
      datasetName: 'account_team:member',
      changeItem: 'account_team:dataset_config_item_externalReadUrl',
      oldValue: 'https://old.example.com/read?fileId=1',
      newValue: 'toString'
    });

    expect(processDatasetConfigUpdateSpecific(metadata, spyT)).toEqual({
      ...metadata,
      changeItem: '外部预览地址'
    });
    expect(spyT).toHaveBeenCalledExactlyOnceWith(
      'account_team:dataset_config_item_externalReadUrl'
    );
  });

  it('covers every schema subfield of object dataset configs in the field label map', () => {
    const websiteKeys = Object.keys(DatasetSchema.shape.websiteConfig.unwrap().shape);
    const chunkKeys = Object.keys(ChunkSettingsSchema.shape);
    const fileParseKeys = Object.keys(sangforFileParseConfigSchema.shape);
    const apiServerKeys = Object.entries(ApiDatasetServerSchema.shape).flatMap(
      ([serverName, serverSchema]) => [
        serverName,
        ...Object.keys(serverSchema.unwrap().shape).map((field) => `${serverName}.${field}`)
      ]
    );

    expect(
      Object.keys(
        datasetConfigAuditFieldLabelMap[
          datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.WEBSITE_CONFIG]
        ] ?? {}
      ).sort()
    ).toEqual(websiteKeys.sort());
    expect(
      Object.keys(
        datasetConfigAuditFieldLabelMap[
          datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.CHUNK_SETTINGS]
        ] ?? {}
      ).sort()
    ).toEqual(chunkKeys.sort());
    expect(
      Object.keys(
        datasetConfigAuditFieldLabelMap[
          datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.API_DATASET_SERVER]
        ] ?? {}
      ).sort()
    ).toEqual(apiServerKeys.sort());
    expect(
      Object.keys(
        datasetConfigAuditFieldLabelMap[
          datasetConfigAuditItemLabelMap[DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG]
        ] ?? {}
      ).sort()
    ).toEqual(fileParseKeys.sort());
  });

  it('keeps every dataset config audit i18n key present across all locales', () => {
    const locales: Record<string, Record<string, Record<string, string>>> = {
      'zh-CN': { account_team: zhCNAccountTeam, common: zhCNCommon },
      en: { account_team: enAccountTeam, common: enCommon },
      'zh-Hant': { account_team: zhHantAccountTeam, common: zhHantCommon },
      'ko-KR': { account_team: koKRAccountTeam, common: koKRCommon }
    };

    const allKeys = [
      ...Object.values(datasetConfigAuditItemLabelMap),
      ...Object.values(datasetConfigAuditValueLabelMap),
      ...Object.values(datasetConfigAuditFieldLabelMap).flatMap((fields) =>
        Object.values(fields ?? {})
      )
    ];

    for (const key of allKeys) {
      const [ns, entry] = key.split(':');
      for (const [locale, bundles] of Object.entries(locales)) {
        expect(bundles[ns]?.[entry], `missing ${key} in ${locale}`).toBeTruthy();
      }
    }
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
