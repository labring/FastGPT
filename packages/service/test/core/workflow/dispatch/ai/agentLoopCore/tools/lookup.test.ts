import { describe, expect, it, vi } from 'vitest';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { READ_FILES_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { DATASET_SEARCH_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { getAgentLoopCoreSystemToolInfo } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';

const { getSandboxToolInfoMock } = vi.hoisted(() => ({
  getSandboxToolInfoMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/toolCall')>();

  return {
    ...original,
    getSandboxToolInfo: getSandboxToolInfoMock
  };
});

describe('getAgentLoopCoreSystemToolInfo', () => {
  it('returns shared display info for read_files and dataset_search', () => {
    expect(getAgentLoopCoreSystemToolInfo({ name: READ_FILES_TOOL_NAME, lang: 'en' })).toEqual(
      expect.objectContaining({
        type: 'file',
        name: 'FileParsing',
        avatar: 'core/workflow/template/readFiles'
      })
    );
    expect(getAgentLoopCoreSystemToolInfo({ name: DATASET_SEARCH_TOOL_NAME, lang: 'en' })).toEqual(
      expect.objectContaining({
        type: 'datasetSearch',
        name: 'DatasetSearch',
        avatar: 'core/workflow/template/datasetSearch'
      })
    );
  });

  it('delegates sandbox tool display info to sandbox tool registry', () => {
    getSandboxToolInfoMock.mockReturnValue({
      name: 'Run shell',
      avatar: 'sandbox-avatar',
      toolDescription: 'Run command'
    });

    expect(getAgentLoopCoreSystemToolInfo({ name: SANDBOX_SHELL_TOOL_NAME, lang: 'en' })).toEqual({
      type: 'sandbox',
      name: 'Run shell',
      avatar: 'sandbox-avatar',
      toolDescription: 'Run command'
    });
  });
});
