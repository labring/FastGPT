import { describe, expect, it } from 'vitest';

import {
  ModerationCheckInputSchema,
  ModerationResultSchema
} from '@fastgpt-plugin/sdk-client';
import {
  DefaultSystemModerationPolicy,
  ModerationPluginConfigSchema,
  SystemModerationPolicySchema
} from '../../../../core/plugin/moderation/type';
import {
  DeleteModerationPluginBodySchema,
  GetModerationPluginListQuerySchema,
  GetModerationPolicyResponseSchema,
  GetModerationRecordsBodySchema,
  GetModerationRecordsResponseSchema,
  RawModerationCheckBodySchema,
  SaveModerationConfigBodySchema,
  UpdateModerationPolicyBodySchema
} from '../../../../openapi/core/plugin/admin/moderation/api';
import { PluginPath } from '../../../../openapi/core/plugin/index';

describe('moderation admin OpenAPI contracts', () => {
  it('registers the four admin moderation routes', () => {
    expect(PluginPath['/core/plugin/admin/moderation/list']?.get).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/config']?.post).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/check']?.post).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/delete']?.post).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/policy']?.get).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/policy']?.post).toBeDefined();
    expect(PluginPath['/core/plugin/admin/moderation/records']?.post).toBeDefined();
  });

  it('reuses the plugin-side moderation result schema instead of redefining it', () => {
    // 标准结构只有一份：FastGPT 不重复定义 verdict / hits / label
    expect(ModerationResultSchema.safeParse({
      verdict: 'block',
      keywords: ['badword'],
      hits: [{ label: 'porn', providerLabel: 'Porn', score: 80, keywords: ['badword'] }],
      provider: 'baidu'
    }).success).toBe(true);

    // 不在四档内的裁决必须被拒绝
    expect(ModerationResultSchema.safeParse({
      verdict: 'unknown',
      keywords: [],
      hits: [],
      provider: 'baidu'
    }).success).toBe(false);

    // error 档是正常结果，不是失败
    expect(ModerationResultSchema.safeParse({
      verdict: 'error',
      keywords: [],
      hits: [],
      provider: 'baidu',
      errorMessage: 'provider timeout'
    }).success).toBe(true);
  });

  it('rejects unknown fields in the check input', () => {
    expect(ModerationCheckInputSchema.safeParse({ content: 'hello' }).success).toBe(true);
    expect(ModerationCheckInputSchema.safeParse({ content: 'hello', modality: 'image' }).success).toBe(
      false
    );
  });

  it('validates admin request bodies', () => {
    expect(
      RawModerationCheckBodySchema.safeParse({
        pluginId: 'baidu-moderation',
        input: { content: 'hello' }
      }).success
    ).toBe(true);

    expect(SaveModerationConfigBodySchema.safeParse({ pluginId: 'baidu-moderation' }).success).toBe(
      true
    );
    expect(SaveModerationConfigBodySchema.safeParse({}).success).toBe(false);

    expect(DeleteModerationPluginBodySchema.safeParse({ pluginId: 'x' }).success).toBe(true);
    expect(GetModerationPluginListQuerySchema.safeParse({ includeDeleted: 'true' }).data).toEqual({
      includeDeleted: true
    });
    expect(GetModerationPluginListQuerySchema.safeParse({ includeDeleted: {} }).success).toBe(
      false
    );
  });

  it('keeps deleted and enabled as independent flags on the config record', () => {
    const base = { _id: '1', pluginId: 'x' };

    expect(ModerationPluginConfigSchema.safeParse({ ...base, enabled: true }).success).toBe(true);
    expect(ModerationPluginConfigSchema.safeParse({ ...base, deleted: true }).success).toBe(true);
    // 软删除的记录可以保留 enabled 原值，由 service 层负责先停用再删除
    expect(
      ModerationPluginConfigSchema.safeParse({ ...base, enabled: true, deleted: true }).success
    ).toBe(true);
  });

  it('validates moderation policy schema and defaults', () => {
    expect(SystemModerationPolicySchema.safeParse(DefaultSystemModerationPolicy).success).toBe(true);
    expect(GetModerationPolicyResponseSchema.safeParse(DefaultSystemModerationPolicy).success).toBe(
      true
    );
    expect(
      UpdateModerationPolicyBodySchema.safeParse({
        enabled: true,
        activePluginId: 'baidu-moderation',
        hooks: {
          userInput: true,
          modelInput: true,
          finalOutput: false
        },
        strategy: {
          streamInterval: 30,
          suspectedRiskAction: 'passAndLog',
          serviceExceptionAction: 'block'
        }
      }).success
    ).toBe(true);

    expect(
      GetModerationRecordsBodySchema.safeParse({
        stage: 'entry',
        verdict: 'block',
        offset: 0,
        limit: 10
      }).success
    ).toBe(true);
  });
});
