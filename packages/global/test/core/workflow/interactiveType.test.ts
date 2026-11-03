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
  it.each([undefined, null, '', '说明'])('normalizes description %s', (description) => {
    expect(
      UserSelectInteractiveSchema.parse({
        type: 'userSelect',
        params: { description, userSelectOptions: [{ key: 'option1', value: 'Confirm' }] }
      })
    ).toMatchObject({ params: { description: description ?? '' } });

    expect(
      UserInputInteractiveSchema.parse({
        type: 'userInput',
        params: { description, inputForm: [] }
      })
    ).toMatchObject({ params: { description: description ?? '' } });
  });
  it.each([123, {}, []])('rejects an invalid description %s', (description) => {
    expect(
      UserInputInteractiveSchema.safeParse({
        type: 'userInput',
        params: { description, inputForm: [] }
      }).success
    ).toBe(false);
    expect(
      UserSelectInteractiveSchema.safeParse({
        type: 'userSelect',
        params: { description, userSelectOptions: [] }
      }).success
    ).toBe(false);
  });
});
