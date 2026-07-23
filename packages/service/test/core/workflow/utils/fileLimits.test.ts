import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';

const getTeamPlanStatusMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: getTeamPlanStatusMock
}));

import {
  getWorkflowFileAmountLimits,
  getWorkflowFileLimits,
  prepareWorkflowFileQuery
} from '@fastgpt/service/core/workflow/utils/fileLimits';

const createFile = (name: string): UserChatItemValueItemType => ({
  file: {
    type: ChatFileTypeEnum.file,
    name,
    url: `https://files.example.com/${name}`
  }
});

describe('prepareWorkflowFileQuery', () => {
  const originalFeConfigs = global.feConfigs;

  beforeEach(() => {
    global.feConfigs = {
      ...originalFeConfigs,
      uploadFileMaxAmount: 20,
      uploadFileMaxSize: 100
    };
  });

  afterEach(() => {
    global.feConfigs = originalFeConfigs;
    vi.clearAllMocks();
  });

  it('uses the team plan for Context while applying app maxFiles only to query uploads', async () => {
    getTeamPlanStatusMock.mockResolvedValue({
      standard: { maxUploadFileCount: 8, maxUploadFileSize: 50 }
    });
    const firstFile = createFile('first.pdf');
    const secondFile = createFile('second.pdf');
    const text: UserChatItemValueItemType = { text: { content: 'question' } };

    const result = await prepareWorkflowFileQuery({
      teamId: 'team-1',
      chatConfig: {
        fileSelectConfig: { maxFiles: 1 }
      },
      query: [firstFile, text, secondFile]
    });

    expect(result).toEqual({
      query: [firstFile, text],
      maxFileAmount: 8,
      maxBytesPerFile: 50 * 1024 * 1024
    });
    expect(getTeamPlanStatusMock).toHaveBeenCalledWith({ teamId: 'team-1' });
  });

  it('falls back to the system limit when the plan has no upload file limit', async () => {
    getTeamPlanStatusMock.mockResolvedValue({ standard: undefined });
    const files = Array.from({ length: 21 }, (_, index) => createFile(`${index}.pdf`));

    const result = await prepareWorkflowFileQuery({
      teamId: 'team-1',
      query: files
    });

    expect(result.maxFileAmount).toBe(20);
    expect(result.maxBytesPerFile).toBe(100 * 1024 * 1024);
    expect(result.query).toHaveLength(20);
  });

  it('reuses preloaded Workflow limits without querying the team plan again', async () => {
    getTeamPlanStatusMock.mockResolvedValue({ standard: undefined });
    const limits = await getWorkflowFileLimits({ teamId: 'team-1' });
    getTeamPlanStatusMock.mockClear();

    const result = await prepareWorkflowFileQuery({
      teamId: 'team-1',
      query: [createFile('first.pdf')],
      limits
    });

    expect(result.maxFileAmount).toBe(20);
    expect(result.maxBytesPerFile).toBe(100 * 1024 * 1024);
    expect(getTeamPlanStatusMock).not.toHaveBeenCalled();
  });

  it('preserves an explicit zero team file count instead of falling back to the system limit', () => {
    expect(
      getWorkflowFileAmountLimits({
        teamMaxFileAmount: 0,
        systemMaxFileAmount: 20
      })
    ).toEqual({
      maxFileAmount: 0,
      queryMaxFileAmount: 0
    });
  });

  it('caps the query module limit by the team quota', async () => {
    getTeamPlanStatusMock.mockResolvedValue({
      standard: { maxUploadFileCount: 2, maxUploadFileSize: 50 }
    });
    const files = Array.from({ length: 3 }, (_, index) => createFile(`${index}.pdf`));

    const result = await prepareWorkflowFileQuery({
      teamId: 'team-1',
      chatConfig: {
        fileSelectConfig: { maxFiles: 3 }
      },
      query: files
    });

    expect(result.query).toEqual(files.slice(0, 2));
    expect(result.maxFileAmount).toBe(2);
  });
});
