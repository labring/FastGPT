import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchTextEditor } from '@fastgpt/service/core/workflow/dispatch/tools/textEditor';
import type { WorkflowVariableStateLike } from '@fastgpt/global/core/workflow/runtime/type';

const createVariableState = (
  variables: Record<string, unknown> = {}
): WorkflowVariableStateLike => ({
  get: (key) => variables[key],
  set: async (key, value) => {
    variables[key] = value;
    return value;
  },
  getStoreValue: (key) => variables[key],
  getFileStoreValueByRuntimeUrl: () => undefined,
  toRuntimeRecord: () => ({ ...variables }),
  toStoreRecord: () => ({ ...variables }),
  clone: () => createVariableState({ ...variables })
});

describe('dispatchTextEditor', () => {
  it('纯文本不构造 runtime variables', () => {
    const result = dispatchTextEditor({
      variableState: {
        ...createVariableState(),
        toRuntimeRecord: () => {
          throw new Error('should not build runtime variables');
        }
      },
      params: {
        [NodeInputKeyEnum.textareaInput]: 'plain text',
        [NodeInputKeyEnum.addInputParam]: {}
      }
    });

    expect(result.data?.[NodeOutputKeyEnum.text]).toBe('plain text');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.textOutput).toBe('plain text');
  });

  it('只 stringify 模板实际引用的 custom variable', () => {
    let stringifyCount = 0;
    const unusedObject = {
      toJSON() {
        stringifyCount += 1;
        return { value: 'unused' };
      }
    };

    const result = dispatchTextEditor({
      variableState: createVariableState(),
      params: {
        [NodeInputKeyEnum.textareaInput]: 'Hello {{name}}',
        [NodeInputKeyEnum.addInputParam]: {
          name: 'Ada',
          unusedObject
        }
      }
    });

    expect(result.data?.[NodeOutputKeyEnum.text]).toBe('Hello Ada');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.textOutput).toBe('Hello Ada');
    expect(stringifyCount).toBe(0);
  });

  it('保持 custom variable object 的 pretty JSON 输出兼容行为', () => {
    const result = dispatchTextEditor({
      variableState: createVariableState(),
      params: {
        [NodeInputKeyEnum.textareaInput]: '{{payload}}',
        [NodeInputKeyEnum.addInputParam]: {
          payload: { a: 1 }
        }
      }
    });

    expect(result.data?.[NodeOutputKeyEnum.text]).toBe('{\n  "a": 1\n}');
  });

  it('不把 Object 原型字段误当作变量', () => {
    const result = dispatchTextEditor({
      variableState: createVariableState(),
      params: {
        [NodeInputKeyEnum.textareaInput]: '{{toString}}',
        [NodeInputKeyEnum.addInputParam]: {}
      }
    });

    expect(result.data?.[NodeOutputKeyEnum.text]).toBe('{{toString}}');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.textOutput).toBe('{{toString}}');
  });
});
