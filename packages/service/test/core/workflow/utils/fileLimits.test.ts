import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';

const getTeamPlanStatusMock = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/support/wallet/sub/utils', () => ({
  getTeamPlanStatus: getTeamPlanStatusMock
}));

import {
  filterWorkflowQueryFiles,
  getWorkflowFileAmountLimits,
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
      limit: { uploadFileMaxAmount: 20, uploadFileMaxSize: 100 }
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
    const limits = {
      maxFileAmount: 2,
      maxBytesPerFile: 100 * 1024 * 1024
    };
    const files = Array.from({ length: 3 }, (_, index) => createFile(`${index}.pdf`));

    const result = await prepareWorkflowFileQuery({
      teamId: 'team-1',
      chatConfig: {
        fileSelectConfig: { maxFiles: 3 }
      },
      query: files,
      limits
    });

    expect(result.query).toEqual(files.slice(0, 2));
    expect(result.maxFileAmount).toBe(2);
    expect(result.maxBytesPerFile).toBe(100 * 1024 * 1024);
    expect(getTeamPlanStatusMock).not.toHaveBeenCalled();
  });

  it('treats a zero team file count as unset and falls back to the system limit', () => {
    expect(
      getWorkflowFileAmountLimits({
        teamMaxFileAmount: 0,
        systemMaxFileAmount: 20
      })
    ).toEqual({
      maxFileAmount: 20,
      queryMaxFileAmount: 20
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

describe('filterWorkflowQueryFiles', () => {
  const textItem: UserChatItemValueItemType = { text: { content: 'question' } };
  const firstFile = createFile('first.pdf');
  const secondFile = createFile('second.pdf');

  it('keeps non-file inputs and only the first files within the limit', () => {
    expect(
      filterWorkflowQueryFiles({
        query: [firstFile, textItem, secondFile],
        maxFileAmount: 1
      })
    ).toEqual([firstFile, textItem]);
  });

  it('removes all file inputs when the limit is zero', () => {
    expect(
      filterWorkflowQueryFiles({
        query: [firstFile, textItem, secondFile],
        maxFileAmount: 0
      })
    ).toEqual([textItem]);
  });
});

describe('getWorkflowFileAmountLimits', () => {
  it('uses the team plan for Context and the app config for query uploads', () => {
    expect(
      getWorkflowFileAmountLimits({
        teamMaxFileAmount: 100,
        systemMaxFileAmount: 1000,
        queryMaxFileAmount: 3
      })
    ).toEqual({
      maxFileAmount: 100,
      queryMaxFileAmount: 3
    });
  });

  it('falls back to the system limit and then uses it for an unconfigured query', () => {
    expect(
      getWorkflowFileAmountLimits({
        systemMaxFileAmount: 1000
      })
    ).toEqual({
      maxFileAmount: 1000,
      queryMaxFileAmount: 1000
    });
  });
});
