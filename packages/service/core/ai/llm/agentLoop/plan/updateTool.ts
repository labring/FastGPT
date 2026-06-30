import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';

const planEvidenceSchema = {
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
} as const;

const planSchema = {
  type: 'object',
  description:
    'Complete active plan. Shape: { planId?, task, description, background?, steps: [{ id, title, description, acceptanceCriteria, status, evidence?, outputSummary?, blocker?, needsReplan? }] }.',
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
            items: planEvidenceSchema
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
} as const;

const setPlanOperationSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['set_plan']
    },
    plan: planSchema,
    reason: {
      type: 'string'
    }
  },
  required: ['action', 'plan'],
  additionalProperties: false
} as const;

const replacePlanOperationSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['replace_plan']
    },
    plan: planSchema,
    reason: {
      type: 'string'
    }
  },
  required: ['action', 'plan'],
  additionalProperties: false
} as const;

const updateStepOperationSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['update_step']
    },
    stepId: {
      type: 'string',
      description:
        'Required when action is update_step. update_step changes exactly one step; use multiple update_step operations for multiple steps.'
    },
    status: {
      type: 'string',
      enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped']
    },
    evidence: {
      type: 'array',
      items: planEvidenceSchema
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
  required: ['action', 'stepId', 'status'],
  additionalProperties: false
} as const;

/**
 * 创建单主 loop 使用的计划维护工具。
 * Main Agent 通过它创建、更新或替换 active plan；工具调用由 loop 内部消费，不进入业务工具执行器。
 */
export const createUpdatePlanTool = (name = 'update_plan'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Create, update, or replace the active plan. Send one or more operations in updates; batch related step changes in a single call. set_plan and replace_plan require a complete plan object. update_step must only include stepId/status/evidence/outputSummary/blocker/needsReplan/reason; never include plan in update_step.',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description:
            'Ordered plan operations. Use multiple update_step operations in one call when several steps changed together.',
          minItems: 1,
          items: {
            oneOf: [setPlanOperationSchema, updateStepOperationSchema, replacePlanOperationSchema]
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
