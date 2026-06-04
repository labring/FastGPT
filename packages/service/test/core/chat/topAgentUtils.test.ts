import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_SANDBOX_TOOLSET_ID,
  SANDBOX_SHELL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';

vi.mock('@fastgpt/service/core/app/tool/controller', () => ({
  getSystemToolsWithInstalled: vi.fn(async () => []),
  getMyTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/app/tool/workflowTool', () => ({
  getUserAvaliableWorkflowTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: vi.fn(() => ({
      getSystemToolList: vi.fn(async () => [])
    }))
  }
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        sort: vi.fn(() => ({
          lean: vi.fn(async () => [])
        }))
      }))
    }))
  }
}));

vi.mock('@fastgpt/service/support/permission/schema', () => ({
  MongoResourcePermission: {
    find: vi.fn(() => ({
      lean: vi.fn(async () => [])
    }))
  }
}));

vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', () => ({
  getGroupsByTmbId: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/support/permission/org/controllers', () => ({
  getOrgIdSetWithParentByTmbId: vi.fn(async () => new Set())
}));

import { generateResourceList } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/utils';

describe('topAgent utils', () => {
  it('lists sandbox as an agent sandbox capability group instead of the shell tool', async () => {
    const { resourceList } = await generateResourceList({
      teamId: 'team_1',
      tmbId: 'tmb_1',
      isRoot: false,
      lang: 'zh-CN'
    });

    expect(resourceList).toContain(`**${AGENT_SANDBOX_TOOLSET_ID}**`);
    expect(resourceList).not.toContain(`**${SANDBOX_SHELL_TOOL_NAME}**`);
  });
});
