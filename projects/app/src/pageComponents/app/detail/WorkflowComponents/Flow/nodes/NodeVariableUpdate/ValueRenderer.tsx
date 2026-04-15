import React from 'react';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import InputRender from '@/components/core/app/formRender';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import type { TUpdateListItem } from '@fastgpt/global/core/workflow/template/system/variableUpdate/type';
import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import VariableSelector from './VariableSelector';
import NumberFormula from './renderers/NumberFormula';
import BooleanSelect from './renderers/BooleanSelect';
import ArrayValue from './renderers/ArrayValue';

const isArrayValueType = (valueType?: WorkflowIOValueTypeEnum) =>
  typeof valueType === 'string' && valueType.startsWith('array');

export type ValueRendererProps = {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  // 外层根据目标变量推断出的 inputType（e.g. textarea/select/...）
  stringInputType: InputTypeEnum;
  stringFormParams?: Record<string, any>;

  value?: ReferenceValueType;
  renderType: TUpdateListItem['renderType'];
  numberOperator?: TUpdateListItem['numberOperator'];
  booleanMode?: TUpdateListItem['booleanMode'];
  arrayMode?: TUpdateListItem['arrayMode'];

  variables: EditorVariablePickerType[];
  variableLabels: EditorVariableLabelPickerType[];

  onChange: (patch: Partial<TUpdateListItem>) => void;
};

const ValueRenderer: React.FC<ValueRendererProps> = (props) => {
  const {
    nodeId,
    valueType,
    stringInputType,
    stringFormParams = {},
    value,
    renderType,
    numberOperator,
    booleanMode,
    arrayMode,
    variables,
    variableLabels,
    onChange
  } = props;

  // 1) Reference 分支：任意类型（含 array）都直接 VariableSelector
  if (renderType === FlowNodeInputTypeEnum.reference) {
    return (
      <VariableSelector
        nodeId={nodeId}
        variable={value}
        valueType={valueType}
        onSelect={(v) => onChange({ value: v })}
      />
    );
  }

  // 2) Input 分支 + Array：派发到 ArrayValue（自带模式下拉）
  if (isArrayValueType(valueType)) {
    return (
      <ArrayValue
        valueType={valueType}
        arrayMode={arrayMode}
        value={value}
        variables={variables}
        variableLabels={variableLabels}
        onChange={onChange}
      />
    );
  }

  // 3) Input 分支 + 叶子类型
  if (valueType === WorkflowIOValueTypeEnum.number) {
    return (
      <NumberFormula
        operator={numberOperator}
        value={value?.[1]}
        variables={variables}
        variableLabels={variableLabels}
        onChange={(patch) => {
          const next: Partial<TUpdateListItem> = {};
          if ('operator' in patch) next.numberOperator = patch.operator;
          if ('value' in patch) next.value = ['', patch.value] as ReferenceValueType;
          onChange(next);
        }}
      />
    );
  }

  if (valueType === WorkflowIOValueTypeEnum.boolean) {
    return (
      <BooleanSelect
        mode={booleanMode}
        onChange={(m) =>
          onChange({ booleanMode: m, value: ['', m !== 'false'] as unknown as ReferenceValueType })
        }
      />
    );
  }

  // 其他类型：通用 InputRender
  // - string 统一走 textarea（PromptEditor 大号，带 `/` 变量选择）
  //   除非目标变量是 select/switch/numberInput 等特殊形态，则保留推断
  // - object/any/其它: 沿用 stringInputType 推断
  const effectiveInputType = (() => {
    const GENERIC = new Set<InputTypeEnum>([
      InputTypeEnum.input,
      InputTypeEnum.textarea,
      InputTypeEnum.JSONEditor
    ]);
    if (valueType === WorkflowIOValueTypeEnum.string) {
      return GENERIC.has(stringInputType) ? InputTypeEnum.textarea : stringInputType;
    }
    return stringInputType;
  })();

  return (
    <InputRender
      inputType={effectiveInputType}
      {...stringFormParams}
      variables={variables}
      variableLabels={variableLabels}
      value={value?.[1]}
      onChange={(v: unknown) => onChange({ value: ['', v] as ReferenceValueType })}
    />
  );
};

export default ValueRenderer;
