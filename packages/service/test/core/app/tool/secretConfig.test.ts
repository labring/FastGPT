import { describe, expect, it } from 'vitest';
import {
  formatToolInputSecrets,
  resolveToolInputValues
} from '@fastgpt/service/core/app/tool/secretConfig';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

describe('formatToolInputSecrets', () => {
  it.each([
    [FlowNodeTypeEnum.httpRequest468, true],
    [FlowNodeTypeEnum.code, false]
  ])('formats only the HTTP authentication container on %s nodes', (flowNodeType, encrypted) => {
    const value = { Authorization: { value: 'plain', secret: 'business-secret' } };
    const inputs: FlowNodeInputItemType[] = [
      {
        key: NodeInputKeyEnum.headerSecret,
        label: 'Auth',
        renderTypeList: [],
        value: structuredClone(value)
      },
      {
        key: 'business',
        label: 'Business',
        renderTypeList: [],
        value: { headerSecret: structuredClone(value) }
      }
    ];
    formatToolInputSecrets({ flowNodeType, inputs });
    expect(inputs[0].value).toEqual(
      encrypted ? { Authorization: { secret: expect.any(String) } } : value
    );
    expect(inputs[1].value).toEqual({ headerSecret: value });
  });

  it('preserves a same-named business parameter while encrypting explicitly declared passwords', () => {
    const value = { type: 'system', value: { apiKey: { value: 'business' } } };
    const inputs: FlowNodeInputItemType[] = [
      { key: NodeInputKeyEnum.systemInputConfig, label: 'Business', renderTypeList: [], value },
      {
        key: 'password',
        label: 'Password',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        value: { value: 'plain' }
      }
    ];
    formatToolInputSecrets({ flowNodeType: FlowNodeTypeEnum.code, inputs });
    expect(inputs[0].value).toBe(value);
    expect(inputs[1].value).toEqual({ secret: expect.any(String) });
  });

  it('encrypts only declared manual secrets and drops inactive configuration values', () => {
    const reference = { ref: ['node', 'token'] };
    const inputs: FlowNodeInputItemType[] = [
      {
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'Manual',
        renderTypeList: [],
        inputList: [
          { key: 'token', label: 'Token', inputType: 'secret' },
          { key: 'reference', label: 'Reference', inputType: 'secret' },
          { key: 'count', label: 'Count', inputType: 'numberInput' }
        ],
        value: { type: 'manual', value: { token: { value: 'plain' }, reference, count: 0 } }
      },
      {
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'System',
        renderTypeList: [],
        value: { type: 'system', value: { token: { value: 'unused' } } }
      }
    ];
    formatToolInputSecrets({ flowNodeType: FlowNodeTypeEnum.tool, inputs });
    expect(inputs.map((input) => input.value)).toEqual([
      { type: 'manual', value: { token: { secret: expect.any(String) }, reference, count: 0 } },
      { type: 'system' }
    ]);
  });

  it('preserves missing containers and manual values without secret declarations', () => {
    for (const value of [
      null,
      'raw',
      { type: 'manual' },
      { type: 'manual', value: [] },
      { type: 'manual', value: { token: { value: 'plain' } } }
    ]) {
      const inputs: FlowNodeInputItemType[] = [
        { key: NodeInputKeyEnum.systemInputConfig, label: 'Config', renderTypeList: [], value }
      ];
      formatToolInputSecrets({ flowNodeType: FlowNodeTypeEnum.tool, inputs });
      expect(inputs[0].value).toBe(value);
    }
    const inputs = [{ key: NodeInputKeyEnum.headerSecret, value: null }];
    // @ts-expect-error - exercise historical runtime input without editor metadata
    formatToolInputSecrets({ flowNodeType: FlowNodeTypeEnum.httpRequest468, inputs });
    expect(inputs[0].value).toBeNull();
  });
});

describe('resolveToolInputValues', () => {
  it('preserves missing values and undeclared parameters while rejecting declared object inputs', () => {
    expect(resolveToolInputValues({})).toBeUndefined();
    expect(resolveToolInputValues({ value: {} })).toEqual({});
    expect(resolveToolInputValues({ value: { text: { value: 'plain' } } })).toEqual({
      text: 'plain'
    });
    const inputList = [{ key: 'token', label: 'Token', inputType: 'secret' as const }];
    expect(resolveToolInputValues({ value: { token: null }, inputList })).toEqual({ token: null });
    expect(() =>
      resolveToolInputValues({ value: { token: { business: true } }, inputList })
    ).toThrow('must resolve to a scalar');
  });
  it('resolves refs and preserves input type conversion', () => {
    const result = resolveToolInputValues({
      value: {
        count: { ref: ['node-1', 'count'] },
        enabled: { ref: ['node-1', 'enabled'] },
        token: { ref: ['node-1', 'token'] }
      },
      inputList: [
        { key: 'count', label: 'Count', inputType: 'numberInput' },
        { key: 'enabled', label: 'Enabled', inputType: 'switch' },
        { key: 'token', label: 'Token', inputType: 'secret' }
      ],
      resolveReference: (ref) =>
        ({ count: '12', enabled: false, token: 'raw-token' })[ref[1] as string]
    });

    expect(result).toEqual({ count: 12, enabled: false, token: 'raw-token' });
  });

  it('rejects object and array reference results', () => {
    expect(() =>
      resolveToolInputValues({
        value: { token: { ref: ['node-1', 'token'] } },
        inputList: [{ key: 'token', label: 'Token', inputType: 'secret' }],
        resolveReference: () => ['token-a', 'token-b']
      })
    ).toThrow('must resolve to a scalar');
  });

  it('parses persisted manual switch values as booleans', () => {
    const result = resolveToolInputValues({
      value: {
        enabled: { value: 'false' },
        disabled: { value: 'true' }
      },
      inputList: [
        { key: 'enabled', label: 'Enabled', inputType: 'switch' },
        { key: 'disabled', label: 'Disabled', inputType: 'switch' }
      ]
    });

    expect(result).toEqual({ enabled: false, disabled: true });
  });

  it('uses the shared editor normalization for legacy scalar wrappers', () => {
    expect(
      resolveToolInputValues({
        value: { count: { value: 0 }, enabled: { value: false } },
        inputList: [
          { key: 'count', label: 'Count', inputType: 'numberInput' },
          { key: 'enabled', label: 'Enabled', inputType: 'switch' }
        ]
      })
    ).toEqual({ count: 0, enabled: false });
  });
});
