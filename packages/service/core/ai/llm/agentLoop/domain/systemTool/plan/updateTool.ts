import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';

const stepStatusSchema = {
  type: 'string',
  enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped'],
  description: 'New step status. Use done instead of completed.'
};

const stepUpdateSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Existing step id returned by set_plan or update_plan.'
    },
    status: stepStatusSchema,
    note: {
      type: 'string',
      description: 'Short progress, completion, blocker, or skip note.'
    }
  },
  required: ['id', 'status']
};

/** 创建或重置 active plan。步骤使用字符串数组，降低模型生成嵌套参数的出错率。 */
export const createSetPlanTool = (name = 'set_plan'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Create the active plan for a complex task. When planning is required, call this before any sandbox or runtime tool; do not inspect context first. Do not call it when continuing an existing active plan: use update_plan instead.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short plan name.'
        },
        steps: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string'
          },
          description:
            'Ordered step names. Each item must be a concise executable step name, not a detailed paragraph.'
        }
      },
      required: ['name', 'steps']
    }
  }
});

/** 更新 active plan：可更新已有步骤状态，也可用字符串数组追加新步骤。 */
export const createUpdatePlanTool = (name = 'update_plan'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Maintain an existing active plan. Provide updates to change existing step statuses, add_steps to append new step names, or both. At least one field is required.',
    parameters: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          minItems: 1,
          items: stepUpdateSchema,
          description: 'Status updates for existing step ids.'
        },
        add_steps: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string'
          },
          description: 'New step names to append to the current plan.'
        }
      }
    }
  }
});
