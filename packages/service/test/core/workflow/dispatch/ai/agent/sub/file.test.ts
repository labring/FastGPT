import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { getRawTextBufferMock } = vi.hoisted(() => ({
  getRawTextBufferMock: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/rawText/index', () => ({
  getS3RawTextSource: () => ({
    getRawTextBuffer: getRawTextBufferMock,
    addRawTextBuffer: vi.fn()
  })
}));

import { dispatchFileRead } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/file';

describe('dispatchFileRead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns raw file content and leaves compression to tool response compression', async () => {
    getRawTextBufferMock.mockResolvedValue({
      filename: 'doc.txt',
      text: 'large file content'
    });

    const result = await dispatchFileRead({
      files: [
        {
          id: 'file_0',
          url: 'file_raw_text_id'
        }
      ],
      teamId: 'team_1',
      tmbId: 'tmb_1'
    });

    expect(result.response).toBe(
      JSON.stringify([
        {
          id: 'file_0',
          name: 'doc.txt',
          content: 'large file content'
        }
      ])
    );
    expect(result.usages).toEqual([]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.readFiles,
      moduleName: 'chat:read_file'
    });
  });
});
