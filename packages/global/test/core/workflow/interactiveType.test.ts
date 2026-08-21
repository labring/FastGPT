import { describe, expect, it } from 'vitest';
import { FlowNodeInputTypeEnum } from '../../../core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../../core/workflow/constants';
import { UserInputFormItemSchema } from '../../../core/workflow/template/system/interactive/type';

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
