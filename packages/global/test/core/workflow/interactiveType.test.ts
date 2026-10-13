import { describe, expect, it } from 'vitest';
import { FlowNodeInputTypeEnum } from '../../../core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../../core/workflow/constants';
import {
  UserInputFormItemSchema,
  UserInputInteractiveSchema,
  UserSelectInteractiveSchema
} from '../../../core/workflow/template/system/interactive/type';

describe('UserInputFormItemSchema', () => {
  it('preserves file upload method configuration', () => {
    expect(
      UserInputFormItemSchema.parse({
        type: FlowNodeInputTypeEnum.fileSelect,
        key: 'attachment',
        label: 'Attachment',
        value: [],
        valueType: WorkflowIOValueTypeEnum.arrayString,
        required: false,
        canSelectFile: true,
        canLocalUpload: false,
        canUrlUpload: true
      })
    ).toMatchObject({
      canSelectFile: true,
      canLocalUpload: false,
      canUrlUpload: true
    });
  });
});

describe('interactive description', () => {
  // 说明文字是可选节点输入；历史与调试回放会直接省略该字段，缺省为空串而不是拒绝。
  it('defaults a missing description', () => {
    expect(
      UserSelectInteractiveSchema.parse({
        type: 'userSelect',
        params: { userSelectOptions: [{ key: 'option1', value: 'Confirm' }] }
      })
    ).toMatchObject({ params: { description: '' } });

    expect(
      UserInputInteractiveSchema.parse({ type: 'userInput', params: { inputForm: [] } })
    ).toMatchObject({ params: { description: '' } });
  });
});
