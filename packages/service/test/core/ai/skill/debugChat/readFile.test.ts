import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFileContentByUrl: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/fileContext', () => ({
  getFileContentByUrl: mocks.getFileContentByUrl
}));

import { createSkillDebugReadFileExecutor } from '@fastgpt/service/core/ai/skill/debugChat/readFile';

describe('Skill Debug read_files executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFileContentByUrl.mockResolvedValue({ name: 'guide.txt', content: 'file content' });
  });

  const createExecutor = () =>
    createSkillDebugReadFileExecutor({
      readableFileUrls: ['https://files.example.com/guide.txt'],
      maxFileAmount: 2,
      teamId: 'team-id',
      tmbId: 'tmb-id',
      usageId: 'usage-id'
    });

  it('only reads URLs registered in the current chat context', async () => {
    const result = await createExecutor()({
      call: {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'read_files',
          arguments: JSON.stringify({
            urls: ['https://files.example.com/guide.txt', 'https://files.example.com/private.txt']
          })
        }
      },
      messages: []
    });

    expect(mocks.getFileContentByUrl).toHaveBeenCalledOnce();
    expect(mocks.getFileContentByUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://files.example.com/guide.txt',
        usageId: 'usage-id'
      })
    );
    expect(JSON.parse(result.response)).toEqual([
      {
        url: 'https://files.example.com/guide.txt',
        name: 'guide.txt',
        content: 'file content'
      },
      {
        url: 'https://files.example.com/private.txt',
        name: '',
        content: 'File is not available in the current chat context.'
      }
    ]);
  });

  it('returns a tool-visible validation error for invalid arguments', async () => {
    const result = await createExecutor()({
      call: {
        id: 'call-1',
        type: 'function',
        function: { name: 'read_files', arguments: '{}' }
      },
      messages: []
    });

    expect(result.error).toBeDefined();
    expect(mocks.getFileContentByUrl).not.toHaveBeenCalled();
  });
});
