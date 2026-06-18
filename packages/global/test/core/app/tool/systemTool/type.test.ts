import { describe, expect, it } from 'vitest';
import { AdminSystemToolDetailSchema } from '@fastgpt/global/core/app/tool/systemTool/type';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { SystemToolSystemSecretStatusEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';

const createAdminToolDetail = () => ({
  id: 'systemTool-null-schema',
  version: '0.0.1',
  status: PluginStatusEnum.Normal,
  source: 'system',
  isToolSet: false,
  avatar: '/icon.svg',
  name: 'Null schema tool',
  intro: 'Tool intro',
  author: 'FastGPT',
  tags: [],
  toolDescription: 'Tool description',
  currentCost: 0,
  systemKeyCost: 0,
  hasTokenFee: false,
  hasSystemSecret: false,
  systemSecretStatus: SystemToolSystemSecretStatusEnum.none
});

describe('AdminSystemToolDetailSchema', () => {
  it('strips input and output schemas from admin detail response', () => {
    const detail = {
      ...createAdminToolDetail(),
      inputSchema: null,
      outputSchema: null,
      secretSchema: {
        type: 'object',
        properties: {
          apiKey: {
            type: 'string',
            isSecret: true
          }
        },
        required: ['apiKey']
      }
    };

    const result = AdminSystemToolDetailSchema.parse(detail);

    expect(result).not.toHaveProperty('inputSchema');
    expect(result).not.toHaveProperty('outputSchema');
    expect(result.secretSchema).toEqual(detail.secretSchema);
  });

  it('strips child input and output schemas from admin detail response', () => {
    const result = AdminSystemToolDetailSchema.parse({
      ...createAdminToolDetail(),
      isToolSet: true,
      children: [
        {
          id: 'child',
          name: 'Child tool',
          currentCost: 0,
          systemKeyCost: 0,
          inputSchema: null,
          outputSchema: null
        }
      ]
    });

    expect(result.children?.[0]).not.toHaveProperty('inputSchema');
    expect(result.children?.[0]).not.toHaveProperty('outputSchema');
  });
});
