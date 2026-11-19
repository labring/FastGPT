import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  getAuthorizedSystemToolTemplateCatalog: vi.fn(),
  getTeamModelHandle: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', () => ({ authCert: mocks.authCert }));
vi.mock('@fastgpt/service/core/app/tool/systemTool/capability', () => ({
  getAuthorizedSystemToolTemplateCatalog: mocks.getAuthorizedSystemToolTemplateCatalog
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

import { handler } from '@/pages/api/core/workflow/getTemplateBundle';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { createWorkflowTemplateBundle } from '@fastgpt/workflow-core/template/bundle';
import { WorkflowTemplateBundleSchema } from '@fastgpt/global/core/workflow/template/type';

describe('getTemplateBundle', () => {
  const member = { teamId: 'team-id', tmbId: 'member-id', isRoot: false };

  function request(query: Record<string, unknown>) {
    const req = { query, headers: { cookie: 'NEXT_LOCALE=ko-KR' } } as Parameters<
      typeof handler
    >[0];
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as Parameters<typeof handler>[1];
    return { result: handler(req, res), req, setHeader };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authCert.mockResolvedValue(member);
    const builtin = createWorkflowTemplateBundle({ locale: 'en' }).items[0].template;
    mocks.getAuthorizedSystemToolTemplateCatalog.mockResolvedValue([
      {
        toolId: 'systemTool-safe-example',
        source: 'system',
        template: { ...builtin, pluginId: 'systemTool-safe-example', source: 'system' }
      }
    ]);
    mocks.getTeamModelHandle.mockResolvedValue({
      getDefaultModelData: () => ({ modelId: 'team-model' })
    });
  });

  it.each([
    [{ locale: 'zh-CN' }, 'zh-CN'],
    [{}, 'ko-KR']
  ])('validates the query and returns a private template bundle for %j', async (query, locale) => {
    const { result, req, setHeader } = request(query);
    const bundle = await result;
    expect(mocks.authCert).toHaveBeenCalledWith({ req, authToken: true, authApiKey: true });
    expect(mocks.getAuthorizedSystemToolTemplateCatalog).toHaveBeenCalledWith({
      ...member,
      lang: locale
    });
    expect(mocks.getTeamModelHandle).toHaveBeenCalledWith({ teamId: member.teamId });
    expect(WorkflowTemplateBundleSchema.parse(bundle).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: { kind: 'systemTool', toolId: 'systemTool-safe-example', source: 'system' }
        }),
        expect.objectContaining({
          ref: { kind: 'builtin', templateId: 'ai-chat' },
          validatedInputDefaults: {
            [NodeInputKeyEnum.aiModelId]: { provided: true, value: 'team-model' }
          }
        })
      ])
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('skips catalog lookup for invalid input or failed auth', async () => {
    await expect(request({ locale: 'invalid' }).result).rejects.toBeDefined();
    expect(mocks.authCert).not.toHaveBeenCalled();
    mocks.authCert.mockRejectedValueOnce(new Error('unauthorized'));
    await expect(request({}).result).rejects.toThrow('unauthorized');
    expect(mocks.getAuthorizedSystemToolTemplateCatalog).not.toHaveBeenCalled();
    expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
  });
});
