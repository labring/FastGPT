import { describe, expect, it } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getPluginInputTypeList,
  getPluginInputTypeRawList
} from '@fastgpt/web/components/common/InputTypeSelector/configs';

describe('plugin input type config', () => {
  it('hides JSON Editor by default for new workflow tool inputs', () => {
    const inputTypeList = getPluginInputTypeList();

    expect(
      inputTypeList.flat().some((item) => item.value === FlowNodeInputTypeEnum.JSONEditor)
    ).toBe(false);
  });

  it('can keep JSON Editor available for editing legacy inputs', () => {
    const inputTypeList = getPluginInputTypeList({ showJsonEditor: true });
    const rawInputTypeList = getPluginInputTypeRawList({ showJsonEditor: true });

    expect(
      inputTypeList.flat().some((item) => item.value === FlowNodeInputTypeEnum.JSONEditor)
    ).toBe(true);
    expect(
      rawInputTypeList.flat().find((item) => item.value[0] === FlowNodeInputTypeEnum.JSONEditor)
        ?.value
    ).toEqual([FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference]);
  });
});
