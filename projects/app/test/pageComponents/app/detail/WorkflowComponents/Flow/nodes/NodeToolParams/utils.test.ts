import { parseToolParamJsonSchema } from '@fastgpt/global/core/app/jsonschema';
import { toolParamKeyReg } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolParams/utils';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { describe, expect, it } from 'vitest';

describe('toolParamKeyReg', () => {
  it.each(['userInfo', 'user1Info', 'User2'])('should accept %s', (key) => {
    expect(toolParamKeyReg.test(key)).toBe(true);
  });

  it.each(['1user', 'user_info', '用户信息', ''])('should reject %s', (key) => {
    expect(toolParamKeyReg.test(key)).toBe(false);
  });
});

describe('parseToolParamJsonSchema', () => {
  it('should parse a property schema', () => {
    const result = parseToolParamJsonSchema(
      JSON.stringify({
        type: 'object',
        description: ' User information ',
        properties: {
          name: { type: 'string' }
        }
      })
    );

    expect(result).toEqual({
      description: 'User information',
      schema: {
        type: 'object',
        description: ' User information ',
        properties: {
          name: { type: 'string' }
        }
      },
      valueType: WorkflowIOValueTypeEnum.object
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['non-object input', JSON.stringify([])],
    ['missing description', JSON.stringify({ type: 'string' })]
  ])('should reject %s', (_case, schema) => {
    expect(() => parseToolParamJsonSchema(schema)).toThrow();
  });
});
