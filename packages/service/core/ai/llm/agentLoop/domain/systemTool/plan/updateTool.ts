import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';

const stepStatusSchema = {
  type: 'string',
  enum: ['pending', 'in_progress', 'done', 'blocked', 'skipped']
};

const newStepSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Step name.'
    },
    description: {
      type: 'string',
      description: 'Step description.'
    }
  },
  required: ['name']
};

const stepStatusPatchSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'Existing step id.'
    },
    status: {
      ...stepStatusSchema,
      description: 'New step status.'
    },
    note: {
      type: 'string',
      description: 'Short note for progress, completion result, blocker, or skip reason.'
    }
  },
  required: ['id', 'status']
};

const planInfoProperties = {
  name: {
    type: 'string',
    description: 'Plan name.'
  },
  description: {
    type: 'string',
    description: 'Plan description.'
  }
};

const stepsArraySchema = (items: typeof newStepSchema | typeof stepStatusPatchSchema) => ({
  type: 'array',
  minItems: 1,
  items
});

/**
 * 创建单主 loop 使用的计划维护工具。
 * Main Agent 通过它创建计划、追加步骤、更新步骤状态；工具调用由 loop 内部消费，不进入业务工具执行器。
 */
export const createUpdatePlanTool = (name = 'update_plan'): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description:
      'Maintain the active plan for complex tasks. Use set_plan to create/reset a plan, add_steps to append steps, and update_steps to update step status and note.',
    parameters: {
      type: 'object',
      oneOf: [
        {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['set_plan']
            },
            ...planInfoProperties,
            steps: stepsArraySchema(newStepSchema)
          },
          required: ['action', 'name', 'steps']
        },
        {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['add_steps']
            },
            steps: stepsArraySchema(newStepSchema)
          },
          required: ['action', 'steps']
        },
        {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['update_steps']
            },
            steps: stepsArraySchema(stepStatusPatchSchema)
          },
          required: ['action', 'steps']
        }
      ]
    }
  }
});
