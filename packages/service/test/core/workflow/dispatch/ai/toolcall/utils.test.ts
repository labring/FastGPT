import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { mergeDatasetToolQueryImages } from '../../../../../../core/workflow/dispatch/ai/toolcall/utils';

describe('mergeDatasetToolQueryImages', () => {
  it('should append image urls to dataset tool string query', () => {
    const result = mergeDatasetToolQueryImages({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams: {
        [NodeInputKeyEnum.userChatInput]: 'black high heels'
      },
      queryImageUrls: ['/api/file/current.png']
    });

    expect(result[NodeInputKeyEnum.userChatInput]).toEqual([
      'black high heels',
      '/api/file/current.png'
    ]);
  });

  it('should append image urls to dataset tool array query', () => {
    const result = mergeDatasetToolQueryImages({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams: {
        [NodeInputKeyEnum.userChatInput]: ['black high heels', 'red sole']
      },
      queryImageUrls: ['/api/file/current.png']
    });

    expect(result[NodeInputKeyEnum.userChatInput]).toEqual([
      'black high heels',
      'red sole',
      '/api/file/current.png'
    ]);
  });

  it('should deduplicate merged query image urls while preserving order', () => {
    const result = mergeDatasetToolQueryImages({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams: {
        [NodeInputKeyEnum.userChatInput]: ['black high heels', '/api/file/current.png']
      },
      queryImageUrls: ['/api/file/current.png', '/api/file/second.png']
    });

    expect(result[NodeInputKeyEnum.userChatInput]).toEqual([
      'black high heels',
      '/api/file/current.png',
      '/api/file/second.png'
    ]);
  });

  it('should not inject image urls into non-dataset tools', () => {
    const startParams = {
      [NodeInputKeyEnum.userChatInput]: 'black high heels'
    };

    const result = mergeDatasetToolQueryImages({
      flowNodeType: FlowNodeTypeEnum.httpRequest468,
      startParams,
      queryImageUrls: ['/api/file/current.png']
    });

    expect(result).toBe(startParams);
    expect(result[NodeInputKeyEnum.userChatInput]).toBe('black high heels');
  });

  it('should keep dataset tool params unchanged when there are no image urls', () => {
    const startParams = {
      [NodeInputKeyEnum.userChatInput]: 'black high heels'
    };

    const result = mergeDatasetToolQueryImages({
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      startParams,
      queryImageUrls: []
    });

    expect(result).toBe(startParams);
  });
});
