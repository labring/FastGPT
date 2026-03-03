import {
  VariableInputEnum,
  variableConfigs,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../i18n/utils';

export type InputTypeConfigItem = {
  icon: string;
  label: string;
  value: string;
  description?: string;
  defaultValueType?: WorkflowIOValueTypeEnum;
};
export type PluginInputTypeConfigItem = {
  icon: string;
  label: string;
  value: FlowNodeInputTypeEnum[];
  defaultValueType: WorkflowIOValueTypeEnum;
  description?: string;
};

export const getVariableInputTypeList = (): InputTypeConfigItem[][] => {
  return variableConfigs
    .map((group) =>
      group
        .filter((item) => item && item.value !== VariableInputEnum.textarea)
        .map((item) => ({
          icon: item.icon,
          label: item.label,
          value: item.value,
          description: item.description,
          defaultValueType: item.defaultValueType
        }))
    )
    .filter((group) => group.length > 0);
};
export const getFormInputTypeList = (): InputTypeConfigItem[][] => {
  return [
    [
      {
        icon: 'core/workflow/inputType/input',
        label: i18nT('common:core.workflow.inputType.textInput'),
        value: FlowNodeInputTypeEnum.input,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/password',
        label: i18nT('common:core.workflow.inputType.password'),
        value: FlowNodeInputTypeEnum.password,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/numberInput',
        label: i18nT('common:core.workflow.inputType.number input'),
        value: FlowNodeInputTypeEnum.numberInput,
        defaultValueType: WorkflowIOValueTypeEnum.number
      },
      {
        icon: 'core/workflow/inputType/option',
        label: i18nT('common:core.workflow.inputType.select'),
        value: FlowNodeInputTypeEnum.select,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/multipleSelect',
        label: i18nT('common:core.workflow.inputType.multipleSelect'),
        value: FlowNodeInputTypeEnum.multipleSelect,
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      },
      {
        icon: 'core/workflow/inputType/switch',
        label: i18nT('common:core.workflow.inputType.switch'),
        value: FlowNodeInputTypeEnum.switch,
        defaultValueType: WorkflowIOValueTypeEnum.boolean
      },
      {
        icon: 'core/workflow/inputType/timePointSelect',
        label: i18nT('common:core.workflow.inputType.timePointSelect'),
        value: FlowNodeInputTypeEnum.timePointSelect,
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/timeRangeSelect',
        label: i18nT('common:core.workflow.inputType.timeRangeSelect'),
        value: FlowNodeInputTypeEnum.timeRangeSelect,
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      }
    ],
    [
      {
        icon: 'core/workflow/inputType/file',
        label: i18nT('common:core.workflow.inputType.file'),
        value: FlowNodeInputTypeEnum.fileSelect,
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      },
      {
        icon: 'core/workflow/inputType/selectLLM',
        label: i18nT('common:core.workflow.inputType.selectLLMModel'),
        value: FlowNodeInputTypeEnum.selectLLMModel,
        defaultValueType: WorkflowIOValueTypeEnum.string
      }
    ]
  ];
};
export const getPluginInputTypeRawList = (options?: {
  hasDynamicInput?: boolean;
}): PluginInputTypeConfigItem[][] => {
  const { hasDynamicInput = false } = options || {};

  return [
    [
      {
        icon: 'core/workflow/inputType/reference',
        label: i18nT('common:core.workflow.inputType.Reference'),
        value: [FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/input',
        label: i18nT('common:core.workflow.inputType.textInput'),
        value: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/password',
        label: i18nT('common:core.workflow.inputType.password'),
        value: [FlowNodeInputTypeEnum.password],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/numberInput',
        label: i18nT('common:core.workflow.inputType.number input'),
        value: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.number
      },
      {
        icon: 'core/workflow/inputType/option',
        label: i18nT('common:core.workflow.inputType.select'),
        value: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/multipleSelect',
        label: i18nT('common:core.workflow.inputType.multipleSelect'),
        value: [FlowNodeInputTypeEnum.multipleSelect, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      },
      {
        icon: 'core/workflow/inputType/switch',
        label: i18nT('common:core.workflow.inputType.switch'),
        value: [FlowNodeInputTypeEnum.switch, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.boolean
      },
      {
        icon: 'core/workflow/inputType/timePointSelect',
        label: i18nT('common:core.workflow.inputType.timePointSelect'),
        value: [FlowNodeInputTypeEnum.timePointSelect, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/timeRangeSelect',
        label: i18nT('common:core.workflow.inputType.timeRangeSelect'),
        value: [FlowNodeInputTypeEnum.timeRangeSelect, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      }
    ],
    [
      {
        icon: 'core/workflow/inputType/file',
        label: i18nT('common:core.workflow.inputType.file'),
        value: [FlowNodeInputTypeEnum.fileSelect, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.arrayString
      },
      {
        icon: 'core/workflow/inputType/selectLLM',
        label: i18nT('common:core.workflow.inputType.selectLLMModel'),
        value: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.string
      },
      {
        icon: 'core/workflow/inputType/selectDataset',
        label: i18nT('common:core.workflow.inputType.selectDataset'),
        value: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
        defaultValueType: WorkflowIOValueTypeEnum.selectDataset
      },
      ...(hasDynamicInput
        ? []
        : [
            {
              icon: 'core/workflow/inputType/dynamic',
              label: i18nT('common:core.workflow.inputType.dynamicTargetInput'),
              value: [FlowNodeInputTypeEnum.addInputParam],
              defaultValueType: WorkflowIOValueTypeEnum.dynamic
            }
          ])
    ],
    [
      {
        icon: 'core/workflow/inputType/customVariable',
        label: i18nT('common:core.workflow.inputType.custom'),
        value: [FlowNodeInputTypeEnum.customVariable],
        defaultValueType: WorkflowIOValueTypeEnum.string,
        description: i18nT('app:variable.select type_desc')
      },
      {
        icon: 'core/workflow/inputType/internal',
        label: i18nT('common:core.workflow.inputType.internal'),
        value: [FlowNodeInputTypeEnum.hidden],
        defaultValueType: WorkflowIOValueTypeEnum.string,
        description: i18nT('app:variable.internal_type_desc')
      }
    ]
  ];
};
export const getPluginInputTypeList = (options?: {
  hasDynamicInput?: boolean;
}): InputTypeConfigItem[][] => {
  const rawList = getPluginInputTypeRawList(options);

  return rawList.map((group) =>
    group.map((item) => ({
      icon: item.icon,
      label: item.label,
      value: item.value[0],
      defaultValueType: item.defaultValueType,
      description: item.description
    }))
  );
};
