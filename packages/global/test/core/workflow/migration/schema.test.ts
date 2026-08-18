import { describe, expect, it } from 'vitest';
import {
  CanonicalFlowNodeInputItemSchema,
  LegacyFlowNodeInputItemSchema,
  migrateWorkflowToCurrent
} from '@fastgpt/global/core/workflow/migration';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';

const inputWithLegacyIndex = {
  key: 'query',
  label: 'Query',
  renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
  selectedTypeIndex: 1
};

describe('workflow input schema boundaries', () => {
  it('keeps legacy questionGuide booleans outside the canonical app schema', () => {
    expect(AppChatConfigTypeSchema.safeParse({ questionGuide: true }).success).toBe(false);
  });

  it('accepts the historical index only through the Legacy schema', () => {
    expect(LegacyFlowNodeInputItemSchema.parse(inputWithLegacyIndex)).toMatchObject({
      selectedTypeIndex: 1
    });
    expect(CanonicalFlowNodeInputItemSchema.parse(inputWithLegacyIndex)).not.toHaveProperty(
      'selectedTypeIndex'
    );
  });

  it('keeps current selectedType in canonical data', () => {
    const input = CanonicalFlowNodeInputItemSchema.parse({
      key: 'query',
      label: 'Query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    });

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });
});

describe('workflow migration boundary', () => {
  it('rejects V1 nodes before strict V2 parsing', async () => {
    await expect(
      migrateWorkflowToCurrent({
        nodes: [
          {
            moduleId: 'start-1',
            flowType: 'questionInput',
            name: 'Ignored',
            inputs: [],
            outputs: [
              {
                key: 'userChatInput',
                type: 'source',
                targets: [{ moduleId: 'answer-1', key: 'text' }]
              }
            ]
          },
          {
            moduleId: 'answer-1',
            flowType: 'answerNode',
            inputs: [{ key: 'text', type: 'target' }],
            outputs: []
          }
        ],
        edges: []
      })
    ).rejects.toThrow();
  });

  it('repairs deterministic V2 structural defects before strict parsing', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: null,
          flowNodeType: 'lafModule',
          name: null,
          version: 481,
          inputs: [
            {
              key: null,
              label: null,
              renderTypeList: ['FlowNodeInputTypeEnum.reference', 'removedType'],
              valueType: 'WorkflowIOValueTypeEnum.string',
              description: null
            }
          ],
          outputs: [{ key: null, id: null, label: null, type: 'removedType', valueType: 'bad' }]
        }
      ],
      edges: [{ source: 'legacy-0', target: 'next' }],
      chatConfig: { questionGuide: true }
    });

    expect(result).toMatchObject({
      nodes: [
        {
          nodeId: 'legacy-0',
          name: 'lafModule',
          flowNodeType: 'emptyNode',
          version: '481',
          inputs: [
            expect.objectContaining({
              key: 'inputs_0',
              label: 'inputs_0',
              renderTypeList: expect.arrayContaining([FlowNodeInputTypeEnum.reference]),
              valueType: 'string'
            })
          ],
          outputs: [
            expect.objectContaining({
              key: 'outputs_0',
              id: 'outputs_0',
              type: 'static',
              valueType: 'any'
            })
          ]
        }
      ],
      edges: [],
      chatConfig: { questionGuide: { open: true } }
    });
  });

  it('normalizes registered tool, plugin, and variable storage defects', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'tool-set',
          flowNodeType: 'toolSet',
          name: 'Tool Set',
          inputs: [
            {
              key: 'system_input_config',
              label: 'Config',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              inputList: [
                { key: 'secret', label: 'Secret', inputType: 'secret', value: 'raw-secret' }
              ]
            }
          ],
          outputs: [],
          pluginData: { status: 1, name: null },
          toolConfig: {
            systemToolSet: {
              toolId: 'system-tools',
              toolList: [{ key: 'search' }, { name: 'read' }]
            },
            httpToolSet: { toolList: [], customHeaders: false }
          }
        }
      ],
      chatConfig: {
        variables: [
          {
            key: 'topic',
            label: 'Topic',
            type: 'string',
            maxLength: -1,
            enums: '[{"value":"a"}]'
          }
        ]
      }
    });

    const node = result.nodes[0];
    expect(node.pluginData).toMatchObject({ status: 'Normal' });
    expect(node.pluginData).not.toHaveProperty('name');
    expect(node.toolConfig?.systemToolSet?.toolList).toEqual([
      expect.objectContaining({ toolId: 'search', name: 'search', description: '' }),
      expect.objectContaining({ toolId: 'read', name: 'read', description: '' })
    ]);
    expect(node.toolConfig?.httpToolSet).not.toHaveProperty('customHeaders');
    expect(node.inputs[0].inputList?.[0]).toMatchObject({ value: { value: 'raw-secret' } });
    expect(result.chatConfig.variables).toEqual([
      expect.objectContaining({
        type: 'input',
        description: '',
        enums: [{ value: 'a', label: 'a' }]
      })
    ]);
    expect(result.chatConfig.variables?.[0]).not.toHaveProperty('maxLength');
  });

  it('accepts only migration-private system and plugin config node values', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'legacy-system',
          flowNodeType: 'userGuide',
          name: 'System config',
          inputs: [
            {
              key: NodeInputKeyEnum.welcomeText,
              label: 'Welcome',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: 'Legacy welcome'
            }
          ],
          outputs: []
        },
        {
          nodeId: 'legacy-plugin',
          flowNodeType: 'pluginConfig',
          name: 'Plugin config',
          inputs: [
            {
              key: NodeInputKeyEnum.instruction,
              label: 'Instruction',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: 'Legacy instruction'
            }
          ],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'legacy-system',
          sourceHandle: 'legacy-system-source-right',
          target: 'legacy-plugin',
          targetHandle: 'legacy-plugin-target-left'
        }
      ]
    });

    expect(result).toMatchObject({
      nodes: [],
      edges: [],
      chatConfig: {
        welcomeText: 'Legacy welcome',
        instruction: 'Legacy instruction'
      }
    });
  });

  it('moves every legacy system setting once while preserving explicit current values', async () => {
    const nodes = [
      {
        nodeId: 'legacy-system',
        flowNodeType: 'userGuide',
        name: 'System config',
        inputs: [
          [NodeInputKeyEnum.welcomeText, 'Legacy welcome'],
          [NodeInputKeyEnum.welcomeQuestions, ['Legacy question']],
          [NodeInputKeyEnum.variables, [{ key: 'legacy', label: 'Legacy', type: 'input' }]],
          [NodeInputKeyEnum.questionGuide, true],
          [NodeInputKeyEnum.tts, { type: 'web' }],
          [NodeInputKeyEnum.whisper, { open: true, autoSend: true, autoTTSResponse: false }],
          [
            NodeInputKeyEnum.scheduleTrigger,
            { cronString: '0 0 * * *', timezone: 'UTC', defaultPrompt: 'Run' }
          ],
          [NodeInputKeyEnum.chatInputGuide, { open: true, customUrl: 'https://example.com' }],
          [NodeInputKeyEnum.autoExecute, { open: true, defaultPrompt: 'Run automatically' }],
          [NodeInputKeyEnum.instruction, 'Legacy instruction']
        ].map(([key, value]) => ({
          key,
          label: key,
          value,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        })),
        outputs: []
      }
    ];
    const chatConfig = {
      welcomeConfig: { welcomeText: '', welcomeQuestions: [] },
      variables: [],
      questionGuide: { open: false },
      instruction: ''
    };

    const first = await migrateWorkflowToCurrent({ nodes, chatConfig });

    expect(first).toMatchObject({
      nodes: [],
      chatConfig: {
        welcomeText: '',
        welcomeConfig: { welcomeText: '', welcomeQuestions: [] },
        variables: [],
        questionGuide: { open: false },
        ttsConfig: { type: 'web' },
        whisperConfig: { open: true, autoSend: true, autoTTSResponse: false },
        scheduledTriggerConfig: { cronString: '0 0 * * *', timezone: 'UTC', defaultPrompt: 'Run' },
        chatInputGuide: { open: true, customUrl: 'https://example.com' },
        autoExecute: { open: true, defaultPrompt: 'Run automatically' },
        instruction: ''
      }
    });
    expect(await migrateWorkflowToCurrent(first)).toEqual(first);
    expect(nodes[0].flowNodeType).toBe('userGuide');
    expect(chatConfig).toEqual({
      welcomeConfig: { welcomeText: '', welcomeQuestions: [] },
      variables: [],
      questionGuide: { open: false },
      instruction: ''
    });
  });

  it('derives selectedType and drops the legacy index', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [inputWithLegacyIndex],
          outputs: []
        }
      ]
    } as any);
    const [input] = result.nodes[0].inputs;
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });

  it('accepts legacy inputs without renderTypeList and emits an empty list', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [{ key: 'query', label: 'Query', selectedTypeIndex: 0 }],
          outputs: []
        }
      ]
    } as any);
    const [input] = result.nodes[0].inputs;
    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.agentGenerated]);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });

  it('keeps explicit selectedType and falsy values', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [
            {
              ...inputWithLegacyIndex,
              selectedType: FlowNodeInputTypeEnum.input,
              value: false,
              valueDesc: '',
              selectedTypeIndex: 1
            }
          ],
          outputs: []
        }
      ]
    } as any);
    const [input] = result.nodes[0].inputs;
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.input);
    expect(input.value).toBe(false);
    expect(input.valueDesc).toBe('');
  });

  it('normalizes legacy Agent snapshots to key and mode', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [
                {
                  id: 'tool-1',
                  config: {},
                  inputs: [
                    {
                      key: 'query',
                      renderTypeList: [
                        FlowNodeInputTypeEnum.input,
                        FlowNodeInputTypeEnum.agentGenerated
                      ],
                      selectedTypeIndex: 1
                    }
                  ]
                }
              ]
            }
          ],
          outputs: []
        }
      ]
    } as any);
    const selectedTools = result.nodes[0].inputs.find(
      (input) => input.key === NodeInputKeyEnum.selectedTools
    )!;
    expect((selectedTools.value as any)[0].inputs).toEqual([
      { key: 'query', mode: 'agentGenerated' }
    ]);
  });

  it('restores legacy toolDescription defaults for tool nodes', async () => {
    const [input] = (
      await migrateWorkflowToCurrent({
        nodes: [
          {
            nodeId: 'tool-1',
            flowNodeType: 'pluginModule',
            pluginId: 'commercial-test-tool',
            name: 'Tool',
            inputs: [
              {
                key: 'query',
                label: 'Query',
                toolDescription: 'Query from user',
                renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
                selectedTypeIndex: 0
              }
            ],
            outputs: []
          }
        ],
        edges: [
          {
            source: 'agent-1',
            target: 'tool-1',
            sourceHandle: '',
            targetHandle: 'selectedTools'
          }
        ]
      } as any)
    ).nodes[0].inputs;

    expect(input).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]
    });
  });

  it('restores legacy HTTP tool input default mode', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'http-tool',
          flowNodeType: 'httpRequest468',
          name: 'HTTP tool',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              canEdit: true,
              toolDescription: 'Query from user',
              renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
            }
          ],
          outputs: []
        }
      ]
    } as any);
    const [input] = result.nodes[0].inputs;

    expect(input.isToolParam).toBe(true);
  });

  it('moves a legacy MCP ToolSet input into toolConfig', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'tool-set-1',
          flowNodeType: 'toolSet',
          pluginId: 'mcp-app-1',
          name: 'MCP tools',
          inputs: [
            {
              key: 'toolSetConfig',
              label: 'Tool set config',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: {
                url: 'https://mcp.example.com',
                toolList: [
                  {
                    name: 'search',
                    description: 'Search documents'
                  }
                ]
              }
            }
          ],
          outputs: []
        }
      ]
    } as any);

    expect(result.nodes[0]).toMatchObject({
      inputs: [],
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example.com',
          toolList: [{ name: 'search', description: 'Search documents' }]
        }
      }
    });
  });

  it('moves legacy if/else edge handles to stable branch ids', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'if-1',
          flowNodeType: 'ifElseNode',
          name: 'Condition',
          inputs: [
            {
              key: NodeInputKeyEnum.ifElseList,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: [
                { branchId: 'branch-a', condition: 'AND', list: [] },
                { condition: 'AND', list: [] }
              ]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'next-1',
          flowNodeType: 'workflowStart',
          name: 'Next',
          inputs: [],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'if-1',
          sourceHandle: 'if-1-source-IF',
          target: 'next-1',
          targetHandle: 'next-1-target-left'
        }
      ]
    } as any);

    const ifElseList = result.nodes[0].inputs[0].value as any[];
    expect(ifElseList.map(({ branchId }) => branchId)).toEqual(['branch-a', 'ELSE IF 1']);
    expect(result.edges[0].sourceHandle).toBe('if-1-source-branch-a');
  });

  it('adds canonical catchError and an error edge for legacy code nodes', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'code-1',
          flowNodeType: 'code',
          name: 'Code',
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'next-1',
          flowNodeType: 'workflowStart',
          name: 'Next',
          inputs: [],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'code-1',
          sourceHandle: 'code-1-source-right',
          target: 'next-1',
          targetHandle: 'next-1-target-left'
        }
      ]
    } as any);

    expect(result.nodes[0].catchError).toBe(true);
    expect(result.edges).toContainEqual(
      expect.objectContaining({ sourceHandle: 'code-1-source_catch-right' })
    );
  });

  it('calls resolver only for Agent tools with incomplete historical inputs', async () => {
    const input = {
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [{ id: 'tool-1', config: {} }]
            }
          ],
          outputs: []
        }
      ]
    } as any;
    const resolver = async () => ({
      inputs: [
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          isToolParam: true
        }
      ]
    });
    const migrated = await migrateWorkflowToCurrent(input, { resolveToolDefinition: resolver });

    expect(input.nodes[0].inputs[0].value[0]).not.toHaveProperty('inputs');
    const selectedTools = migrated.nodes[0].inputs.find(
      (input) => input.key === NodeInputKeyEnum.selectedTools
    )!;
    expect((selectedTools.value as any)[0].inputs).toEqual([
      { key: 'query', mode: 'agentGenerated' }
    ]);
  });

  it('does not call resolver for current Agent tool inputs', async () => {
    const input = {
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [{ id: 'tool-1', config: {}, inputs: [{ key: 'query', mode: 'manual' }] }]
            }
          ],
          outputs: []
        }
      ]
    } as any;
    let resolverCalls = 0;
    await migrateWorkflowToCurrent(input, {
      resolveToolDefinition: async () => {
        resolverCalls += 1;
        return undefined;
      }
    });
    expect(resolverCalls).toBe(0);
  });

  it('is idempotent for workflow data', async () => {
    const input = {
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [inputWithLegacyIndex],
          outputs: []
        }
      ],
      edges: []
    } as any;
    const first = await migrateWorkflowToCurrent(input);
    expect(await migrateWorkflowToCurrent(first as any)).toEqual(first);
  });

  it('does not change an already canonical Agent resource selection', async () => {
    const input = {
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              label: 'Selected tools',
              renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
              selectedType: FlowNodeInputTypeEnum.reference,
              value: ['source-node', 'tools']
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    };

    expect(await migrateWorkflowToCurrent(input as any)).toEqual(input);
  });
});
