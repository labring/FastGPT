import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

vi.mock('@/pageComponents/app/detail/Edit/SimpleApp/utils', () => ({
  form2AppWorkflow: vi.fn((data) => ({
    nodes: [
      {
        flowNodeType: 'workflowStart',
        formData: data
      }
    ],
    edges: [],
    chatConfig: data.chatConfig
  }))
}));

const { normalizeSimpleImportForm, parseDashboardImportConfig, resolveImportAppType } =
  await import('@/pageComponents/dashboard/agent/utils/importJson');

const t = (key: string) => key;

const createSimpleConfig = (extra: Record<string, unknown> = {}) => ({
  aiSettings: {
    model: 'gpt-4o',
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
  selectedAgentSkills: [],
  chatConfig: {},
  ...extra
});

describe('normalizeSimpleImportForm', () => {
  it('should fill missing simple form arrays and default fields', () => {
    const result = normalizeSimpleImportForm({
      aiSettings: {
        model: 'gpt-4o',
        isResponseAnswerText: true,
        maxHistories: 3
      },
      dataset: {
        datasets: []
      },
      chatConfig: {}
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.selectedTools).toEqual([]);
    expect(result.data.selectedAgentSkills).toEqual([]);
    expect(result.data.dataset.limit).toBe(3000);
    expect(result.data.dataset.searchMode).toBe(DatasetSearchModeEnum.embedding);
  });
});

describe('resolveImportAppType', () => {
  it('should prefer supported top-level type from new JSON', () => {
    expect(
      resolveImportAppType({
        type: AppTypeEnum.workflow,
        nodes: [{ flowNodeType: 'pluginInput' }]
      })
    ).toBe(AppTypeEnum.workflow);
  });

  it('should reject chatAgent and unknown top-level type', () => {
    expect(resolveImportAppType({ type: AppTypeEnum.chatAgent })).toBe('');
    expect(resolveImportAppType({ type: 'workflow' })).toBe('');
  });

  it('should fall back to old JSON structure detection when type is missing', () => {
    expect(resolveImportAppType(createSimpleConfig())).toBe(AppTypeEnum.simple);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflow);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflowTool);
  });

  it('should return empty type for malformed node list items', () => {
    expect(
      resolveImportAppType({
        nodes: [null]
      })
    ).toBe('');
  });
});

describe('parseDashboardImportConfig', () => {
  it('should parse simple JSON in agent dashboard and ignore import meta', () => {
    const result = parseDashboardImportConfig({
      config: createSimpleConfig({
        type: AppTypeEnum.simple,
        name: 'Simple app',
        intro: 'Simple intro'
      }),
      t
    });

    expect(result.appType).toBe(AppTypeEnum.simple);
    expect(result.workflow.nodes[0].flowNodeType).toBe('workflowStart');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('type');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('name');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('intro');
  });

  it('should parse workflow JSON in agent dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow',
        intro: 'Workflow intro',
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      t
    });

    expect(result).toEqual({
      appType: AppTypeEnum.workflow,
      workflow: {
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      }
    });
  });

  it('should parse workflow tool JSON in dashboard import', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should keep old behavior and allow importing workflow tool JSON from agent dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should reject chatAgent and unknown typed JSON with existing type_not_recognized text', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: { type: AppTypeEnum.chatAgent },
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: { type: 'workflow' },
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject top-level type and structure mismatch', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.simple,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject malformed old workflow JSON safely', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          nodes: {}
        },
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});
