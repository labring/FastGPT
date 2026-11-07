import {
  NodeGradients,
  NodeBorderColors,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import { type VariableInputEnum, variableMap } from '@fastgpt/global/core/workflow/constants';
import type { EditorVariablePickerType } from '@fastgpt/global/core/workflow/type/io';

const getColorSchemaBySource = (source?: AppToolSourceEnum | string) => {
  if (source === AppToolSourceEnum.http || source === AppToolSourceEnum.mcp) {
    return 'salmon';
  }
  if (
    source === AppToolSourceEnum.commercial ||
    source === AppToolSourceEnum.community ||
    source === AppToolSourceEnum.systemTool
  ) {
    return 'gray';
  }
  if (isDebugToolSource(source)) {
    return 'gray';
  }
  return undefined;
};

export const getGradientByColorSchema = ({
  colorSchema,
  source
}: {
  colorSchema?: keyof typeof NodeGradients;
  source?: AppToolSourceEnum | string;
}): string | undefined => {
  const sourceColor = getColorSchemaBySource(source);
  if (sourceColor) {
    return NodeGradients[sourceColor];
  }
  if (!colorSchema) return undefined;
  return NodeGradients[colorSchema];
};

export const getBorderColorByColorSchema = ({
  colorSchema,
  source
}: {
  colorSchema?: keyof typeof NodeBorderColors;
  source?: AppToolSourceEnum | string;
}): string | undefined => {
  const sourceColor = getColorSchemaBySource(source);
  if (sourceColor) {
    return NodeBorderColors[sourceColor];
  }
  if (!colorSchema) return undefined;
  return NodeBorderColors[colorSchema];
};

export const getColorSchemaByFlowNodeType = (
  flowNodeType: FlowNodeTypeEnum
): keyof typeof NodeGradients | undefined => {
  if (flowNodeType === FlowNodeTypeEnum.toolSet || flowNodeType === FlowNodeTypeEnum.pluginModule) {
    return 'salmon';
  }
  if (flowNodeType === FlowNodeTypeEnum.appModule) {
    return 'skyBlue';
  }
  return undefined;
};

export const formatEditorVariablePickerIcon = (
  variables: { key: string; label: string; type?: `${VariableInputEnum}`; required?: boolean }[]
): EditorVariablePickerType[] => {
  return variables.map((item) => ({
    ...item,
    icon: item.type ? variableMap[item.type]?.icon : variableMap['input'].icon
  }));
};
