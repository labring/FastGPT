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

const {
  normalizeSimpleImportForm,
  parseAppImportConfig,
  parseDashboardImportConfig,
  parseWorkflowImportConfig,
  resolveImportAppType,
  isDashboardImportAppTypeAllowed
} = await import('@/pageComponents/dashboard/agent/utils/appTemplateParse');

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

  it('should support legacy workflowTool type alias', () => {
    expect(resolveImportAppType({ type: 'workflowTool' })).toBe(AppTypeEnum.workflowTool);
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

  it('should prefer plugin input in tool scene for old mixed workflow JSON', () => {
    const config = {
      nodes: [{ flowNodeType: 'workflowStart' }, { flowNodeType: 'pluginInput' }],
      edges: []
    };

    expect(resolveImportAppType(config, 'tool')).toBe(AppTypeEnum.workflowTool);
    expect(resolveImportAppType(config, 'agent')).toBe(AppTypeEnum.workflow);
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
      scene: 'agent',
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
      scene: 'agent',
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

  it('should parse workflow tool JSON in tool dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should parse legacy workflowTool alias JSON in tool dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        type: 'workflowTool',
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should parse old mixed workflow JSON as workflow tool in tool dashboard', () => {
    const result = parseDashboardImportConfig({
      config: {
        nodes: [{ flowNodeType: 'workflowStart' }, { flowNodeType: 'pluginInput' }],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should reject workflow tool JSON in agent dashboard', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject simple and workflow JSON in tool dashboard', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        scene: 'tool',
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        scene: 'tool',
        t
      })
    ).toThrow('app:type_not_recognized');
  });

  it('should reject chatAgent and unknown typed JSON with existing type_not_recognized text', () => {
    expect(() =>
      parseDashboardImportConfig({
        config: { type: AppTypeEnum.chatAgent },
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseDashboardImportConfig({
        config: { type: 'workflow' },
        scene: 'agent',
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
        scene: 'agent',
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
        scene: 'agent',
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
        scene: 'agent',
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});

describe('isDashboardImportAppTypeAllowed', () => {
  it('should match app type with dashboard scene', () => {
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.simple, scene: 'agent' })).toBe(
      true
    );
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflow, scene: 'agent' })).toBe(
      true
    );
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'agent' })
    ).toBe(false);
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.simple, scene: 'tool' })).toBe(
      false
    );
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflow, scene: 'tool' })).toBe(
      false
    );
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'tool' })
    ).toBe(true);
  });
});

describe('parseAppImportConfig', () => {
  it('should parse through the shared import entry with caller constraints', () => {
    const result = parseAppImportConfig({
      config: {
        type: 'workflowTool',
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      },
      resolveScene: 'tool',
      expectedAppType: AppTypeEnum.workflowTool,
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
    expect(result.workflow.nodes).toEqual([{ flowNodeType: 'pluginInput' }]);
  });

  it('should reject mismatched app type in the shared import entry', () => {
    expect(() =>
      parseAppImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        resolveScene: 'agent',
        expectedAppType: AppTypeEnum.workflowTool,
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});

describe('parseWorkflowImportConfig', () => {
  it('should parse workflow JSON and ignore app meta in workflow detail import', () => {
    const result = parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow name',
        intro: 'Workflow intro',
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      t
    });

    expect(result).toEqual({
      nodes: [{ flowNodeType: 'workflowStart' }],
      edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
      chatConfig: { welcomeText: 'hello' }
    });
  });

  it('should parse workflow tool JSON in workflow tool detail import', () => {
    const result = parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        name: 'Tool name',
        intro: 'Tool intro',
        nodes: [{ flowNodeType: 'pluginInput' }, { flowNodeType: 'pluginOutput' }],
        edges: [],
        chatConfig: { welcomeText: 'plugin hello' }
      },
      appType: AppTypeEnum.workflowTool,
      t
    });

    expect(result).toEqual({
      nodes: [{ flowNodeType: 'pluginInput' }, { flowNodeType: 'pluginOutput' }],
      edges: [],
      chatConfig: { welcomeText: 'plugin hello' }
    });
  });

  it('should reject mismatched JSON in workflow detail import', () => {
    expect(() =>
      parseWorkflowImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseWorkflowImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [{ flowNodeType: 'workflowStart' }],
          edges: []
        },
        appType: AppTypeEnum.workflowTool,
        t
      })
    ).toThrow('app:type_not_recognized');

    expect(() =>
      parseWorkflowImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        t
      })
    ).toThrow('app:type_not_recognized');
  });
});
