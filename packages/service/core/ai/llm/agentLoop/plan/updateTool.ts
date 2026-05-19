import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';

/**
 * 创建单主 loop 使用的计划维护工具。
 * Main Agent 通过它创建、更新或替换 active plan；工具调用由 loop 内部消费，不进入业务工具执行器。
 */
export const createUpdatePlanTool = (name = 'update_plan'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Create, update, or replace the active plan. Send one or more operations in updates; batch related step changes in a single call. For set_plan and replace_plan, always provide a complete plan object.',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description:
            'Ordered plan operations. Use multiple update_step operations in one call when several steps changed together.',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['set_plan', 'update_step', 'replace_plan']
              },
              plan: {
                type: 'object',
                description:
                  'Required for set_plan or replace_plan. Shape: { planId?, task, description, background?, steps: [{ id, title, description, acceptanceCriteria, status, evidence?, outputSummary?, blocker?, needsReplan? }] }.',
                properties: {
                  planId: {
                    type: 'string'
                  },
                  task: {
                    type: 'string'
                  },
                  description: {
                    type: 'string'
                  },
                  background: {
                    type: 'string'
                  },
                  steps: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      properties: {
                        id: {
                          type: 'string'
                        },
                        title: {
                          type: 'string'
                        },
                        description: {
                          type: 'string'
                        },
                        acceptanceCriteria: {
                          type: 'array',
                          items: {
                            type: 'string'
                          }
                        },
                        status: {
                          type: 'string',
                          enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped']
                        },
                        evidence: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              kind: {
                                type: 'string',
                                enum: ['tool_result', 'model_output', 'user_input', 'manual']
                              },
                              ref: {
                                type: 'string'
                              },
                              summary: {
                                type: 'string'
                              }
                            },
                            required: ['kind', 'summary']
                          }
                        },
                        outputSummary: {
                          type: 'string'
                        },
                        blocker: {
                          type: 'string'
                        },
                        needsReplan: {
                          type: 'boolean'
                        }
                      },
                      required: ['id', 'title', 'description', 'acceptanceCriteria', 'status']
                    }
                  }
                },
                required: ['task', 'description', 'steps']
              },
              stepId: {
                type: 'string',
                description: 'Step id to update when action is update_step.'
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped']
              },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['tool_result', 'model_output', 'user_input', 'manual']
                    },
                    ref: {
                      type: 'string'
                    },
                    summary: {
                      type: 'string'
                    }
                  },
                  required: ['kind', 'summary']
                }
              },
              outputSummary: {
                type: 'string'
              },
              blocker: {
                type: 'string'
              },
              needsReplan: {
                type: 'boolean'
              },
              reason: {
                type: 'string'
              }
            },
            required: ['action']
          }
        },
        reason: {
          type: 'string',
          description: 'Overall reason for this batch update.'
        }
      },
      required: ['updates']
    }
  }
});
