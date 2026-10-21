import { describe, expect, it } from 'vitest';
import { AdminSystemToolDetailSchema, SystemToolDetailSchema } from '@fastgpt/global/core/app/tool/systemTool/type';
import { SystemToolVersionSchema } from '@fastgpt/global/core/app/tool/systemTool/type/base';
import { MarketplaceToolBaseSchema } from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { UploadPkgPluginResponseItemSchema } from '@fastgpt/global/openapi/core/plugin/admin/api';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { TeamToolDetailSchema } from '@fastgpt/global/openapi/core/plugin/team/tool/api';

const createAdminToolDetail = () => ({
  id: 'systemTool-null-schema',
  version: '0.0.1',
  status: PluginStatusEnum.Normal,
  source: 'system',
  isToolSet: false,
  avatar: '/icon.svg',
  name: 'Null schema tool',
  intro: 'Tool intro',
  author: 'FastGPT',
  tags: [],
  currentCost: 0,
  systemKeyCost: 0,
  hasTokenFee: false,
  hasSystemSecret: false,
  systemSecretStatus: SystemToolSystemSecretStatusEnum.none
});

describe('AdminSystemToolDetailSchema', () => {
  it('accepts hidden system tool status', () => {
    const result = AdminSystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      status: PluginStatusEnum.Hidden
    });

    expect(result.status).toBe(PluginStatusEnum.Hidden);
  });

  it('strips input and output schemas from admin detail response', () => {
    const detail = {
      ...createAdminToolDetail(),
      inputSchema: null,
      outputSchema: null,
      secretSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            isSecret: true
          }
        },
        required: ['apiKey']
      }
    };

    const result = AdminSystemToolDetailSchema.parse(detail);

    expect(result).not.toHaveProperty('inputSchema');
    expect(result).not.toHaveProperty('outputSchema');
    expect(result.secretSchema).toEqual(detail.secretSchema);
  });

  it('strips child input and output schemas from admin detail response', () => {
    const result = AdminSystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      isToolSet: true,
      children: [
        {
          id: 'child',
          name: 'Child tool',
          currentCost: 0,
          systemKeyCost: 0,
          inputSchema: null,
          outputSchema: null
        }
      ]
    });

    expect(result.children?.[0]).not.toHaveProperty('inputSchema');
    expect(result.children?.[0]).not.toHaveProperty('outputSchema');
  });
});

describe('SystemToolDetailSchema', () => {
  it('treats null input and output schemas as missing schema fields', () => {
    const result = SystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      inputSchema: null,
      outputSchema: null,
      secretSchema: null
    });

    expect(result.inputSchema).toBeUndefined();
    expect(result.outputSchema).toBeUndefined();
    expect(result.secretSchema).toBeUndefined();
  });

  it('ignores legacy tool-level descriptions on parent and child DTOs', () => {
    const result = SystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      toolDescription: 'Legacy parent description',
      children: [
        {
          id: 'child',
          name: 'Child tool',
          status: PluginStatusEnum.Normal,
          currentCost: 0,
          systemKeyCost: 0,
          toolDescription: 'Legacy child description'
        }
      ]
    });

    expect(result).not.toHaveProperty('toolDescription');
    expect(result.children?.[0]).not.toHaveProperty('toolDescription');
  });
});

describe('plugin metadata response schemas', () => {
  it('accepts legacy strings and preserves partial translations with localized readme URLs', () => {
    const detail = SystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      name: { en: 'Search', 'zh-CN': '搜索' },
      intro: { en: 'Find pages' },
      readmeUrl: 'https://example.com/legacy.md',
      readmeUrls: { en: 'https://example.com/en.md' },
      children: [
        {
          id: 'child',
          name: 'Legacy child',
          description: { 'zh-CN': '子工具' },
          status: PluginStatusEnum.Normal,
          currentCost: 0,
          systemKeyCost: 0
        }
      ]
    });

    expect(detail.name).toEqual({ en: 'Search', 'zh-CN': '搜索' });
    expect(detail.readmeUrls).toEqual({ en: 'https://example.com/en.md' });
    expect(detail.readmeUrl).toBe('https://example.com/legacy.md');
    expect(detail.children?.[0].name).toBe('Legacy child');
  });

  it('accepts plugin text in marketplace, upload, and version responses', () => {
    const metadata = { en: 'Search', 'zh-CN': '搜索' };
    const marketplace = MarketplaceToolBaseSchema.parse({
      type: 'tool',
      id: 'search-record',
      toolId: 'search',
      pluginId: 'search',
      version: '1.0.0',
      etag: 'etag',
      isToolset: true,
      name: metadata,
      description: 'Legacy description',
      icon: 'search.svg',
      readmeUrls: { en: 'https://example.com/en.md', 'zh-CN': 'https://example.com/zh.md' },
      downloadCount: 0,
      children: [
        {
          id: 'child',
          name: metadata,
          description: 'Legacy child description',
        }
      ]
    });
    const upload = UploadPkgPluginResponseItemSchema.parse({
      pluginId: 'search',
      version: '1.0.0',
      etag: 'etag',
      type: 'tool',
      name: 'Legacy plugin',
      icon: 'search.svg',
      description: metadata,
      versionDescription: metadata
    });
    const version = SystemToolVersionSchema.parse({ version: '1.0.0', versionDescription: metadata });

    expect(marketplace.readmeUrls).toEqual({
      en: 'https://example.com/en.md',
      'zh-CN': 'https://example.com/zh.md'
    });
    expect(upload.name).toBe('Legacy plugin');
    expect(version.versionDescription).toEqual(metadata);
  });
});


describe('TeamToolDetailSchema', () => {
  it('accepts null tool schemas from legacy plugin definitions', () => {
    const result = TeamToolDetailSchema.parse({
      ...createAdminToolDetail(),
      inputSchema: null,
      outputSchema: null,
      children: [
        {
          id: 'child',
          name: 'Child tool',
          status: PluginStatusEnum.Normal,
          currentCost: 0,
          systemKeyCost: 0,
          inputSchema: null,
          outputSchema: null
        }
      ]
    });

    expect(result.inputSchema).toBeUndefined();
    expect(result.outputSchema).toBeUndefined();
    expect(result.children?.[0].inputSchema).toBeUndefined();
    expect(result.children?.[0].outputSchema).toBeUndefined();
  });
});
