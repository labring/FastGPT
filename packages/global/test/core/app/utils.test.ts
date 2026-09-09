import { describe, expect, it } from 'vitest';
import { getDefaultAppForm, getAppType } from '@fastgpt/global/core/app/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('getDefaultAppForm', () => {
  it('should return default app form with correct structure', () => {
    const result = getDefaultAppForm();

    expect(result).toHaveProperty('aiSettings');
    expect(result).toHaveProperty('dataset');
    expect(result).toHaveProperty('selectedTools');
    expect(result).toHaveProperty('chatConfig');
  });

  it('should return correct aiSettings defaults', () => {
    const result = getDefaultAppForm();

    expect(result.aiSettings).toEqual({
      isResponseAnswerText: true,
      maxHistories: 6
    });
  });

  it('should return correct dataset defaults', () => {
    const result = getDefaultAppForm();

    expect(result.dataset).toEqual({
      datasets: [],
      similarity: 0.4,
      limit: 3000,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: false,
      rerankWeight: 0.5,
      datasetSearchUsingExtensionQuery: false,
      datasetSearchExtensionBg: '',
      [NodeInputKeyEnum.collectionFilterVersion]: 'structured',
      authTmbId: false
    });
  });

  it('should return empty selectedTools array', () => {
    const result = getDefaultAppForm();
    expect(result.selectedTools).toEqual([]);
  });

  it('should return empty chatConfig object', () => {
    const result = getDefaultAppForm();
    expect(result.chatConfig).toEqual({});
  });
});

describe('getAppType', () => {
  it('should return empty string when config is undefined', () => {
    const result = getAppType(undefined);
    expect(result).toBe('');
  });

  it('should return simple type when config has aiSettings', () => {
    const config = {
      aiSettings: {
        model: 'gpt-4',
        isResponseAnswerText: true,
        maxHistories: 6
      },
      dataset: {
        datasets: [],
        similarity: 0.4,
        limit: 3000,
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: true,
        rerankModel: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: true,
        datasetSearchExtensionBg: ''
      },
      selectedTools: [],
      chatConfig: {}
    };
    const result = getAppType(config);
    expect(result).toBe(AppTypeEnum.simple);
  });

  it('should return empty string when config has no nodes and no aiSettings', () => {
    const config = {} as any;
    const result = getAppType(config);
    expect(result).toBe('');
  });

  it('should return workflow type when nodes contain workflowStart', () => {
    const config = {
      nodes: [
        { flowNodeType: 'workflowStart', nodeId: '1' },
        { flowNodeType: 'aiChat', nodeId: '2' }
      ],
      edges: []
    };
    const result = getAppType(config as any);
    expect(result).toBe(AppTypeEnum.workflow);
  });

  it('should return workflowTool type when nodes contain pluginInput', () => {
    const config = {
      nodes: [
        { flowNodeType: 'pluginInput', nodeId: '1' },
        { flowNodeType: 'pluginOutput', nodeId: '2' }
      ],
      edges: []
    };
    const result = getAppType(config as any);
    expect(result).toBe(AppTypeEnum.workflowTool);
  });

  it('should return empty string when nodes exist but no workflowStart or pluginInput', () => {
    const config = {
      nodes: [
        { flowNodeType: 'aiChat', nodeId: '1' },
        { flowNodeType: 'textOutput', nodeId: '2' }
      ],
      edges: []
    };
    const result = getAppType(config as any);
    expect(result).toBe('');
  });

  it('should prioritize workflow type over workflowTool when both exist', () => {
    const config = {
      nodes: [
        { flowNodeType: 'workflowStart', nodeId: '1' },
        { flowNodeType: 'pluginInput', nodeId: '2' }
      ],
      edges: []
    };
    const result = getAppType(config as any);
    expect(result).toBe(AppTypeEnum.workflow);
  });
});
