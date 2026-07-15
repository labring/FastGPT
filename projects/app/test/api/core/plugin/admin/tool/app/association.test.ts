import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  validateSystemToolWorkflowAssociation: vi.fn(),
  findOneSystemTool: vi.fn(),
  createSystemTool: vi.fn(),
  findOneAndUpdateSystemTool: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));

vi.mock('@fastgpt/service/core/app/tool/workflowTool/service', () => ({
  validateSystemToolWorkflowAssociation: mocks.validateSystemToolWorkflowAssociation
}));

vi.mock('@fastgpt/service/core/plugin/tool/systemToolSchema', () => ({
  MongoSystemTool: {
    findOne: mocks.findOneSystemTool,
    create: mocks.createSystemTool,
    findOneAndUpdate: mocks.findOneAndUpdateSystemTool
  }
}));

import { handler as createHandler } from '@/pages/api/core/plugin/admin/tool/app/create';
import { handler as updateHandler } from '@/pages/api/core/plugin/admin/tool/app/update';

const createBody = {
  name: 'Workflow tool',
  avatar: 'workflow.svg',
  intro: 'Workflow tool intro',
  associatedPluginId: 'workflow-app'
};

const updatePlugin = {
  customConfig: {
    name: 'Workflow tool',
    avatar: 'workflow.svg',
    intro: 'Workflow tool intro',
    version: 'version-1',
    tags: [],
    associatedPluginId: 'workflow-app',
    userGuide: undefined,
    author: 'FastGPT'
  }
};

const createRequest = (body: unknown) =>
  ({ body, query: {} }) as ApiRequestProps<any, Record<string, never>>;

describe('system tool workflow association validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.validateSystemToolWorkflowAssociation.mockResolvedValue(undefined);
    mocks.findOneSystemTool.mockReturnValue({
      sort: () => ({
        lean: vi.fn().mockResolvedValue(null)
      })
    });
    mocks.createSystemTool.mockResolvedValue(undefined);
    mocks.findOneAndUpdateSystemTool.mockResolvedValue(undefined);
  });

  it('validates the associated workflow before creating a system tool', async () => {
    const error = new Error('unsupported workflow input');
    mocks.validateSystemToolWorkflowAssociation.mockRejectedValueOnce(error);

    await expect(createHandler(createRequest(createBody))).rejects.toThrow(error);

    expect(mocks.validateSystemToolWorkflowAssociation).toHaveBeenCalledWith('workflow-app');
    expect(mocks.findOneSystemTool).not.toHaveBeenCalled();
    expect(mocks.createSystemTool).not.toHaveBeenCalled();
  });

  it('does not revalidate an unchanged association during update', async () => {
    mocks.findOneSystemTool.mockResolvedValueOnce(updatePlugin);

    await expect(
      updateHandler(
        createRequest({
          id: 'commercial-tool',
          status: PluginStatusEnum.Normal
        })
      )
    ).resolves.toEqual({});

    expect(mocks.validateSystemToolWorkflowAssociation).not.toHaveBeenCalled();
    expect(mocks.findOneAndUpdateSystemTool).toHaveBeenCalledTimes(1);
  });

  it('validates a new association during update', async () => {
    mocks.findOneSystemTool.mockResolvedValueOnce(updatePlugin);
    const error = new Error('unsupported workflow input');
    mocks.validateSystemToolWorkflowAssociation.mockRejectedValueOnce(error);

    await expect(
      updateHandler(
        createRequest({
          id: 'commercial-tool',
          associatedPluginId: 'new-workflow-app'
        })
      )
    ).rejects.toThrow(error);

    expect(mocks.validateSystemToolWorkflowAssociation).toHaveBeenCalledWith('new-workflow-app');
    expect(mocks.findOneAndUpdateSystemTool).not.toHaveBeenCalled();
  });
});
