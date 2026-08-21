import { describe, expect, it } from 'vitest';
import {
  createDatasetSearchTool,
  patchDatasetSearchParams
} from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/datasetSearch';
import { DATASET_SEARCH_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';

describe('agent loop dataset_search system tool', () => {
  it('defines dataset_search without workflow-specific inputs', () => {
    const tool = createDatasetSearchTool();

    expect(tool.function.name).toBe(DATASET_SEARCH_TOOL_NAME);
    expect(tool.function.parameters).toMatchObject({
      type: 'object',
      properties: {
        query: {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      }
    });
  });

  it('merges query and current HTTP files without interpreting workflow fields', () => {
    const params = patchDatasetSearchParams({
      args: JSON.stringify({
        query: ['FastGPT', ' '],
        limit: 5
      }),
      currentInputFiles: ['https://files.example.com/image.png', '']
    });

    expect(params).toEqual({
      query: ['FastGPT', 'https://files.example.com/image.png'],
      limit: 5
    });
  });

  it('does not append non-http current files as search text', () => {
    const params = patchDatasetSearchParams({
      args: JSON.stringify({
        query: ['FastGPT']
      }),
      currentInputFiles: ['/api/file/local.png', 'data:image/png;base64,AAAA']
    });

    expect(params).toEqual({ query: ['FastGPT'] });
  });
});
