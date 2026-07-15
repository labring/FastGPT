import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFileContentByUrlMock } = vi.hoisted(() => ({
  getFileContentByUrlMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/chat/fileContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/chat/fileContext')>();
  return {
    ...actual,
    getFileContentByUrl: getFileContentByUrlMock
  };
});

import { runSkillEditReadFiles } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/tools';

describe('runSkillEditReadFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads known ids, isolates per-file errors and ignores unknown ids', async () => {
    getFileContentByUrlMock
      .mockRejectedValueOnce(new Error('parse failed'))
      .mockResolvedValueOnce({ name: 'guide.pdf', content: 'guide content' });

    const response = await runSkillEditReadFiles({
      args: JSON.stringify({ ids: ['bad', 'file-1', 'missing'] }),
      filesMap: {
        bad: '/files/bad.pdf',
        'file-1': '/files/guide.pdf'
      },
      teamId: 'team-id',
      tmbId: 'tmb-id',
      customPdfParse: false,
      usageId: 'usage-id'
    });

    expect(getFileContentByUrlMock).toHaveBeenLastCalledWith({
      url: '/files/guide.pdf',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      customPdfParse: false,
      usageId: 'usage-id'
    });
    expect(JSON.parse(response)).toEqual([
      { id: 'bad', name: '', content: 'parse failed' },
      {
        id: 'file-1',
        name: 'guide.pdf',
        content: 'guide content'
      }
    ]);
  });
});
