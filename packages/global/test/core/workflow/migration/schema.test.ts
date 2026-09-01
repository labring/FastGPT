import { describe, expect, it } from 'vitest';
import {
  CanonicalFlowNodeInputItemSchema,
  LegacyFlowNodeInputItemSchema,
  migrateWorkflowToCurrent
} from '@fastgpt/global/core/workflow/migration';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
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

  it('keeps reference snapshots in canonical data', () => {
    const input = CanonicalFlowNodeInputItemSchema.parse({
      key: 'query',
      label: 'Query',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      value: ['source-node', 'output-key'],
      referenceSnapshots: [
        {
          reference: ['source-node', 'output-key'],
          sourceLabel: 'Source node',
          outputLabel: 'Output label'
        }
      ]
    });

    expect(input.referenceSnapshots).toEqual([
      {
        reference: ['source-node', 'output-key'],
        sourceLabel: 'Source node',
        outputLabel: 'Output label'
      }
    ]);
  });

  it('cleans malformed references at the migration boundary and preserves dead tuples', async () => {
    const input = {
      nodes: [
        {
          nodeId: 'consumer',
          flowNodeType: 'answerNode',
          name: 'Consumer',
          isFolded: true,
          inputs: [
            {
              key: 'single',
              label: 'Single',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.string,
              value: ['deleted-node', 'deleted-output']
            },
            {
              key: 'malformed-single',
              label: 'Malformed single',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              value: ['deleted-node', undefined]
            },
            {
              key: 'multiple',
              label: 'Multiple',
              renderTypeList: [FlowNodeInputTypeEnum.reference],
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: [
                ['kept-node', 'kept-output'],
                ['deleted-node'],
                ['deleted-node', undefined],
                ['', 'output']
              ]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'if-else',
          flowNodeType: 'ifElseNode',
          name: 'If Else',
          inputs: [
            {
              key: NodeInputKeyEnum.ifElseList,
              label: 'If Else',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: [
                {
                  condition: 'AND',
                  list: [
                    {
                      variable: ['deleted-node', 'variable'],
                      condition: 'isEqual',
                      valueType: 'reference',
                      value: ['deleted-node', 'value']
                    }
                  ]
                }
              ]
            }
          ],
          outputs: []
        },
        {
          nodeId: 'variable-update',
          flowNodeType: 'variableUpdate',
          name: 'Variable Update',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Update list',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: [
                {
                  variable: ['deleted-node', 'target'],
                  valueType: WorkflowIOValueTypeEnum.string,
                  renderType: FlowNodeInputTypeEnum.reference,
                  value: [
                    ['deleted-node', 'value'],
                    ['deleted-node', undefined]
                  ]
                }
              ]
            }
          ],
          outputs: []
        }
      ],
      edges: []
    } as any;

    const result = await migrateWorkflowToCurrent(input);
    const consumer = result.nodes.find((node) => node.nodeId === 'consumer')!;
    const ifElse = result.nodes.find((node) => node.nodeId === 'if-else')!;
    const variableUpdate = result.nodes.find((node) => node.nodeId === 'variable-update')!;

    expect(consumer.isFolded).toBe(true);
    expect(consumer.inputs[0]).toMatchObject({
      value: ['deleted-node', 'deleted-output']
    });
    expect(consumer.inputs[1]).not.toHaveProperty('value');
    expect(consumer.inputs[2].value).toEqual([['kept-node', 'kept-output']]);

    const condition = (ifElse.inputs[0].value as any)[0].list[0];
    expect(condition.variable).toEqual(['deleted-node', 'variable']);
    expect(condition.value).toEqual(['deleted-node', 'value']);

    const update = (variableUpdate.inputs[0].value as any)[0];
    expect(update.variable).toEqual(['deleted-node', 'target']);
    expect(update.value).toEqual(['deleted-node', 'value']);
    expect(await migrateWorkflowToCurrent(result as any)).toEqual(result);
  });

  it('keeps scalar VariableUpdate references scalar and wraps array references', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'variable-update',
          flowNodeType: 'variableUpdate',
          name: 'Variable Update',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              label: 'Update list',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: [
                {
                  variable: ['deleted-node', 'scalar-target'],
                  value: [['deleted-node', 'scalar-value']],
                  valueType: WorkflowIOValueTypeEnum.string,
                  renderType: FlowNodeInputTypeEnum.reference
                },
                {
                  variable: ['deleted-node', 'array-target'],
                  value: ['deleted-node', 'array-value'],
                  valueType: WorkflowIOValueTypeEnum.arrayString,
                  renderType: FlowNodeInputTypeEnum.reference
                }
              ]
            }
          ],
          outputs: []
        }
      ],
      edges: []
    } as any);

    const updateList = result.nodes[0]?.inputs[0]?.value as any[];
    expect(updateList[0].value).toEqual(['deleted-node', 'scalar-value']);
    expect(updateList[1].value).toEqual([['deleted-node', 'array-value']]);
  });
});

describe('workflow migration boundary', () => {
  it('maps the legacy default field and keeps an explicit current default', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'plugin-input',
          flowNodeType: 'pluginInput',
          name: 'Plugin input',
          inputs: [
            {
              key: 'legacy',
              label: 'Legacy',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              isToolParam: true
            },
            {
              key: 'current',
              label: 'Current',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              defaultToAgentGenerated: false,
              isToolParam: true
            }
          ],
          outputs: []
        }
      ]
    });

    expect(result.nodes[0].inputs).toMatchObject([
      { key: 'legacy', defaultToAgentGenerated: true },
      { key: 'current', defaultToAgentGenerated: false }
    ]);
    expect(result.nodes[0].inputs[0]).not.toHaveProperty('isToolParam');
    expect(result.nodes[0].inputs[1]).not.toHaveProperty('isToolParam');
  });

  it('rejects V1 nodes before V2 schema parsing', async () => {
    expect(() =>
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
    ).toThrow();
  });

  it('repairs deterministic V2 structural defects before schema parsing', async () => {
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

  it.each([
    ['missing', undefined],
    ['empty', []],
    ['invalid', ['removedType']]
  ])('falls back to reference for %s render types', async (_case, renderTypeList) => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'node-1',
          flowNodeType: 'pluginInput',
          name: 'Start',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              ...(renderTypeList === undefined ? {} : { renderTypeList })
            }
          ],
          outputs: []
        }
      ]
    } as any);

    expect(result.nodes[0].inputs[0]).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    });
  });

  it('removes React Flow node ids from legacy persisted nodes', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          id: 'react-flow-node-id',
          nodeId: 'node-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ]
    } as any);

    expect(result.nodes[0]).not.toHaveProperty('id');
    expect(result.nodes[0].nodeId).toBe('node-1');
  });

  it('removes deprecated model input metadata and Mongo chat config ids', () => {
    const result = migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'legacy-node',
          flowNodeType: 'removedNodeType',
          name: 'Legacy node',
          inputs: [
            {
              key: 'model',
              label: 'Model',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              llmModelType: 'chat'
            }
          ],
          outputs: []
        }
      ],
      chatConfig: {
        _id: 'legacy-mongo-subdocument-id'
      }
    });

    expect(result.nodes[0].flowNodeType).toBe('emptyNode');
    expect(result.nodes[0].inputs[0]).not.toHaveProperty('llmModelType');
    expect(result.chatConfig).not.toHaveProperty('_id');
  });

  it('maps empty variable value types and falls back to any for unknown variable types', () => {
    const result = migrateWorkflowToCurrent({
      nodes: [],
      chatConfig: {
        variables: [
          {
            key: 'query',
            label: 'Query',
            description: '',
            type: VariableInputEnum.textarea,
            valueType: null
          },
          {
            key: 'count',
            label: 'Count',
            description: '',
            type: VariableInputEnum.numberInput
          },
          {
            key: 'unknown',
            label: 'Unknown',
            description: '',
            type: 'removed-input-type'
          }
        ]
      }
    });

    expect(result.chatConfig.variables).toMatchObject([
      { type: VariableInputEnum.textarea, valueType: WorkflowIOValueTypeEnum.string },
      { type: VariableInputEnum.numberInput, valueType: WorkflowIOValueTypeEnum.number },
      { type: VariableInputEnum.input, valueType: WorkflowIOValueTypeEnum.any }
    ]);
  });

  it('adds an empty config to available Agent tools missing config', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [{ id: 'tool-1', inputs: [{ key: 'query', mode: 'manual' }] }]
            }
          ],
          outputs: []
        }
      ]
    } as any);

    expect((result.nodes[0].inputs[0].value as any)[0]).toMatchObject({ config: {} });
  });

  it('migrates legacy Agent tool config values into input modes', async () => {
    const config = {
      text: 'value',
      zero: 0,
      falseValue: false,
      trueValue: true,
      array: ['value'],
      object: { value: 'value' },
      emptyText: '',
      emptyArray: [],
      emptyObject: {},
      nullValue: null,
      undefinedValue: undefined
    };
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [{ id: 'tool-1', config }]
            }
          ],
          outputs: []
        }
      ]
    } as any);

    const tool = (result.nodes[0].inputs[0].value as any)[0];

    expect(tool.inputs).toEqual([
      { key: 'text', mode: 'manual' },
      { key: 'zero', mode: 'manual' },
      { key: 'falseValue', mode: 'manual' },
      { key: 'trueValue', mode: 'manual' },
      { key: 'array', mode: 'manual' },
      { key: 'object', mode: 'manual' },
      { key: 'emptyText', mode: 'agentGenerated' },
      { key: 'emptyArray', mode: 'agentGenerated' },
      { key: 'emptyObject', mode: 'agentGenerated' },
      { key: 'nullValue', mode: 'agentGenerated' },
      { key: 'undefinedValue', mode: 'agentGenerated' }
    ]);
    expect(tool.config).toEqual(config);
  });

  it('keeps explicit Agent tool input modes unchanged', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'agent-1',
          flowNodeType: 'agent',
          name: 'Agent',
          inputs: [
            {
              key: NodeInputKeyEnum.selectedTools,
              renderTypeList: [FlowNodeInputTypeEnum.selectTool],
              value: [
                {
                  id: 'tool-1',
                  inputs: [
                    { key: 'manualValue', mode: 'manual' },
                    { key: 'generatedValue', mode: 'agentGenerated' }
                  ],
                  config: {
                    manualValue: '',
                    generatedValue: 'saved value'
                  }
                }
              ]
            }
          ],
          outputs: []
        }
      ]
    } as any);

    expect((result.nodes[0].inputs[0].value as any)[0]).toMatchObject({
      inputs: [
        { key: 'manualValue', mode: 'manual' },
        { key: 'generatedValue', mode: 'agentGenerated' }
      ],
      config: {
        manualValue: '',
        generatedValue: 'saved value'
      }
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

  it('adds reference fallback to agent-capable legacy inputs', async () => {
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
    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
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

  it('drops historical null input fields before schema parsing', async () => {
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
              selectedType: null,
              inputList: [
                {
                  key: 'secret',
                  label: 'Secret',
                  inputType: 'secret',
                  value: null
                }
              ]
            }
          ],
          outputs: []
        }
      ]
    } as any);

    const input = result.nodes[0].inputs[0];
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input.inputList?.[0]).not.toHaveProperty('value');
  });

  it('trusts canonical Agent tool key and mode values', async () => {
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
                  inputs: [
                    { key: 'query', mode: 'agentGenerated' },
                    { key: 'fixed', mode: 'manual' }
                  ],
                  config: { fixed: 'saved value' }
                }
              ]
            }
          ],
          outputs: []
        }
      ]
    } as any);

    expect((result.nodes[0].inputs[0].value as any)[0]).toEqual({
      id: 'tool-1',
      inputs: [
        { key: 'query', mode: 'agentGenerated' },
        { key: 'fixed', mode: 'manual' }
      ],
      config: { fixed: 'saved value' }
    });
  });

  it('rejects invalid legacy tool input modes', async () => {
    expect(() =>
      migrateWorkflowToCurrent({
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
                    inputs: [{ key: 'query', selectedType: 'agentGenerated' }],
                    config: {}
                  }
                ]
              }
            ],
            outputs: []
          }
        ]
      } as any)
    ).toThrow();

    expect(() =>
      migrateWorkflowToCurrent({
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
                    inputs: [{ key: 'query', mode: 'invalid-mode' }],
                    config: {}
                  }
                ]
              }
            ],
            outputs: []
          }
        ]
      } as any)
    ).toThrow();
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

    expect(input.defaultToAgentGenerated).toBe(true);
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

  it('keeps existing normal and catch edges unchanged for current catchError nodes', async () => {
    const result = await migrateWorkflowToCurrent({
      nodes: [
        {
          nodeId: 'code-1',
          flowNodeType: 'code',
          name: 'Code',
          catchError: true,
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'normal-1',
          flowNodeType: 'workflowStart',
          name: 'Normal',
          inputs: [],
          outputs: []
        },
        {
          nodeId: 'error-1',
          flowNodeType: 'workflowStart',
          name: 'Error',
          inputs: [],
          outputs: []
        }
      ],
      edges: [
        {
          source: 'code-1',
          sourceHandle: 'code-1-source-right',
          target: 'normal-1',
          targetHandle: 'normal-1-target-left'
        },
        {
          source: 'code-1',
          sourceHandle: 'code-1-source_catch-right',
          target: 'error-1',
          targetHandle: 'error-1-target-left'
        }
      ]
    } as any);

    expect(result.edges).toHaveLength(2);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceHandle: 'code-1-source-right',
          target: 'normal-1'
        }),
        expect.objectContaining({
          sourceHandle: 'code-1-source_catch-right',
          target: 'error-1'
        })
      ])
    );
  });

  it('keeps canonical config and removes historical recovery fields', async () => {
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
                  legacyRecoveryFlag: true,
                  legacyRecoveryInputs: [{ key: 'query', mode: 'manual' }],
                  inputs: [{ key: 'query', mode: 'manual' }]
                }
              ]
            }
          ],
          outputs: []
        }
      ]
    } as any);
    const tool = (result.nodes[0].inputs[0].value as any)[0];

    expect(tool).toMatchObject({ id: 'tool-1', inputs: [{ key: 'query', mode: 'manual' }] });
    expect(tool).not.toHaveProperty('legacyRecoveryFlag');
    expect(tool).not.toHaveProperty('legacyRecoveryInputs');
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
