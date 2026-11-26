import { describe, expect, it, vi } from 'vitest';
import {
  DatasetConfigAuditItemEnum,
  datasetConfigAuditItemLabelMap
} from '@fastgpt/global/core/dataset/audit/constants/config';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { ApiDatasetServerSchema } from '@fastgpt/global/core/dataset/apiDataset/type';
import {
  ChunkSettingsSchema,
  DatasetSchema,
  sangforFileParseConfigSchema
} from '@fastgpt/global/core/dataset/type';
import { formatAuditSummary } from '@fastgpt/web/support/user/audit/presenter';
import {
  createDatasetAuditProcessors,
  datasetConfigAuditFieldMap,
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

const t = (key: string, params?: Record<string, unknown>) => {
  const separatorIndex = key.indexOf(':');
  if (separatorIndex === -1) return key;
  const ns = key.slice(0, separatorIndex);
  const entry = key.slice(separatorIndex + 1);
  const template = zhCNResources[ns]?.[entry] ?? key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ''));
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
    {
      changeItem: 'account_team:dataset_config_item_autoSync',
      expectedItem: '自动同步',
      oldValue: 'common:no',
      newValue: 'common:yes',
      expectedOld: '否',
      expectedNew: '是'
    },
    {
      changeItem: 'account_team:dataset_config_item_chunkSettings · indexPrefixTitle',
      expectedItem: '分块参数 · 将标题加入索引',
      oldValue: 'common:no',
      newValue: 'common:yes',
      expectedOld: '否',
      expectedNew: '是'
    },
    {
      changeItem: 'account_team:dataset_config_item_fileParseConfig · keep_header_footer',
      expectedItem: '文件解析配置 · 保留页眉页脚',
      oldValue: 'common:yes',
      newValue: 'common:no',
      expectedOld: '是',
      expectedNew: '否'
    },
    {
      changeItem: 'account_team:dataset_config_item_agentModel',
      expectedItem: '知识库 Agent 模型',
      oldValue: 'common:UnKnow',
      newValue: 'GPT-4o',
      oldValueSource: 'fallback',
      newValueSource: 'literal',
      expectedOld: '未知',
      expectedNew: 'GPT-4o'
    },
    {
      changeItem: 'account_team:dataset_config_item_vlmModel',
      expectedItem: '图片理解模型',
      oldValue: 'common:UnKnow',
      newValue: '-',
      expectedOld: '未知',
      expectedNew: '-'
    },
    {
      changeItem: 'account_team:dataset_config_item_agentModel',
      expectedItem: '知识库 Agent 模型',
      oldValue: 'common:UnKnow',
      newValue: 'GPT-4o',
      oldValueSource: 'literal',
      newValueSource: 'literal',
      expectedOld: 'common:UnKnow',
      expectedNew: 'GPT-4o'
    },
    {
      changeItem: 'account_team:dataset_config_item_vlmModel',
      expectedItem: '图片理解模型',
      oldValue: 'GPT-4o',
      newValue: 'common:UnKnow',
      oldValueSource: 'literal',
      newValueSource: 'literal',
      expectedOld: 'GPT-4o',
      expectedNew: 'common:UnKnow'
    }
  ])(
    'translates semantic system values for $changeItem ($oldValue -> $newValue)',
    ({
      changeItem,
      expectedItem,
      oldValue,
      newValue,
      oldValueSource,
      newValueSource,
      expectedOld,
      expectedNew
    }) => {
      const metadata = {
        name: '张三',
        datasetName: '产品手册',
        changeItem,
        oldValue,
        newValue,
        ...(oldValueSource !== undefined && { oldValueSource }),
        ...(newValueSource !== undefined && { newValueSource })
      };
      expect(processDatasetConfigUpdateSpecific(metadata, t)).toEqual({
        ...metadata,
        changeItem: expectedItem,
        oldValue: expectedOld,
        newValue: expectedNew
      });
    }
  );

  it.each([
    {
      changeItem: 'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization',
      expectedItem: '第三方来源配置 · API 认证信息',
      oldValue: undefined,
      newValue: undefined
    },
    {
      changeItem: 'account_team:dataset_config_item_apiDatasetServer · apiServer.authorization',
      expectedItem: '第三方来源配置 · API 认证信息',
      oldValue: '[REDACTED]',
      newValue: '[REDACTED]'
    },
    {
      changeItem: 'account_team:dataset_config_item_apiDatasetServer · yuqueServer.token',
      expectedItem: '第三方来源配置 · 语雀 Token',
      oldValue: '-',
      newValue: '[REDACTED]'
    }
  ])(
    'omits values for sensitive fields (new and historical) so summary hides value diff',
    ({ changeItem, expectedItem, oldValue, newValue }) => {
      const metadata = {
        name: '张三',
        datasetName: '产品手册',
        changeItem,
        ...(oldValue !== undefined && { oldValue }),
        ...(newValue !== undefined && { newValue })
      };

      expect(processDatasetConfigUpdateSpecific(metadata, t)).toEqual({
        name: '张三',
        datasetName: '产品手册',
        changeItem: expectedItem
      });
      expect(
        formatAuditSummary({
          event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
          metadata,
          t
        })
      ).toBe(expectedItem);
    }
  );

  it.each([
    {
      changeItem: 'account_team:dataset_config_item_intro',
      expectedItem: '简介',
      oldValue: '[REDACTED]',
      newValue: '已隐藏'
    },
    {
      changeItem: 'account_team:dataset_config_item_websiteConfig · selector',
      expectedItem: '网站抓取配置 · 选择器',
      oldValue: '[REDACTED]',
      newValue: '#content'
    },
    {
      changeItem: 'account_team:dataset_config_item_name',
      expectedItem: '名称',
      oldValue: 'common:no',
      newValue: 'common:yes'
    },
    {
      changeItem: 'account_team:dataset_config_item_externalReadUrl',
      expectedItem: '外部预览地址',
      oldValue: 'https://old.example.com/read?fileId=1',
      newValue: 'common:UnKnow'
    },
    {
      changeItem: 'account_team:dataset_config_item_chunkSettings · unknownField',
      expectedItem: '分块参数 · unknownField',
      oldValue: 'common:yes',
      newValue: 'toString'
    }
  ])(
    'preserves literal tokens in non-matching free-text field $changeItem without translating values',
    ({ changeItem, expectedItem, oldValue, newValue }) => {
      const spyT = vi.fn(t);
      const metadata = Object.freeze({
        name: 'account_team:用户',
        datasetName: 'account_team:member',
        changeItem,
        oldValue,
        newValue
      });

      expect(processDatasetConfigUpdateSpecific(metadata, spyT)).toEqual({
        ...metadata,
        changeItem: expectedItem
      });
      expect(spyT).not.toHaveBeenCalledWith(oldValue);
      expect(spyT).not.toHaveBeenCalledWith(newValue);
      expect(
        formatAuditSummary({
          event: DatasetAuditEventEnum.DATASET_CONFIG_UPDATE,
          metadata,
          t
        })
      ).toBe(`${expectedItem}：${oldValue} → ${newValue}`);
    }
  );

  it('covers every schema subfield and boolean subfield of object dataset configs', () => {
    const websiteKeys = Object.keys(DatasetSchema.shape.websiteConfig.unwrap().shape);
    const chunkKeys = Object.keys(ChunkSettingsSchema.shape);
    const fileParseKeys = Object.keys(sangforFileParseConfigSchema.shape);
    const apiServerKeys = Object.entries(ApiDatasetServerSchema.shape).flatMap(
      ([serverName, serverSchema]) => {
        const unwrapped =
          'unwrap' in serverSchema && typeof serverSchema.unwrap === 'function'
            ? serverSchema.unwrap()
            : serverSchema;
        if ('shape' in unwrapped && unwrapped.shape && typeof unwrapped.shape === 'object') {
          return [
            serverName,
            ...Object.keys(unwrapped.shape).map((field) => `${serverName}.${field}`)
          ];
        }
        return [serverName];
      }
    );

    const getMappedFields = (item: DatasetConfigAuditItemEnum) =>
      datasetConfigAuditFieldMap[datasetConfigAuditItemLabelMap[item]] ?? {};

    expect(Object.keys(getMappedFields(DatasetConfigAuditItemEnum.WEBSITE_CONFIG)).sort()).toEqual(
      websiteKeys.sort()
    );
    expect(Object.keys(getMappedFields(DatasetConfigAuditItemEnum.CHUNK_SETTINGS)).sort()).toEqual(
      chunkKeys.sort()
    );
    expect(
      Object.keys(getMappedFields(DatasetConfigAuditItemEnum.API_DATASET_SERVER)).sort()
    ).toEqual(apiServerKeys.sort());
    expect(
      Object.keys(getMappedFields(DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG)).sort()
    ).toEqual(fileParseKeys.sort());

    const extractBooleanFields = (
      shape: Record<string, { safeParse: (value: unknown) => { success: boolean } }>
    ) =>
      Object.entries(shape)
        .filter(
          ([, schema]) =>
            schema.safeParse(true).success &&
            schema.safeParse(false).success &&
            !schema.safeParse(123).success &&
            !schema.safeParse({}).success
        )
        .map(([key]) => key)
        .sort();

    const getMappedBooleanFields = (item: DatasetConfigAuditItemEnum) =>
      Object.entries(getMappedFields(item))
        .filter(([, meta]) => meta.valueKind === 'boolean')
        .map(([key]) => key)
        .sort();

    expect(getMappedBooleanFields(DatasetConfigAuditItemEnum.CHUNK_SETTINGS)).toEqual(
      extractBooleanFields(ChunkSettingsSchema.shape)
    );
    expect(getMappedBooleanFields(DatasetConfigAuditItemEnum.API_DATASET_SERVER)).toEqual(
      extractBooleanFields(ApiDatasetServerSchema.shape)
    );
    expect(getMappedBooleanFields(DatasetConfigAuditItemEnum.FILE_PARSE_CONFIG)).toEqual(
      extractBooleanFields(sangforFileParseConfigSchema.shape)
    );
  });

  it('keeps every dataset config audit i18n key present across all locales', () => {
    const locales: Record<string, Record<string, Record<string, string>>> = {
      'zh-CN': { account_team: zhCNAccountTeam, common: zhCNCommon },
      en: { account_team: enAccountTeam, common: enCommon },
      'zh-Hant': { account_team: zhHantAccountTeam, common: zhHantCommon },
      'ko-KR': { account_team: koKRAccountTeam, common: koKRCommon }
    };

    const allKeys = [
      'common:yes',
      'common:no',
      'common:UnKnow',
      ...Object.values(datasetConfigAuditItemLabelMap),
      ...Object.values(datasetConfigAuditFieldMap).flatMap((fields) =>
        Object.values(fields ?? {}).map((meta) => meta.label)
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
