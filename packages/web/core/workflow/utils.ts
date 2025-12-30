import { NodeGradients, NodeBorderColors } from '@fastgpt/global/core/workflow/node/constant';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const getColorSchemaBySource = (source: AppToolSourceEnum) => {
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
  return undefined;
};

export const getGradientByColorSchema = ({
  colorSchema,
  source
}: {
  colorSchema?: keyof typeof NodeGradients;
  source: AppToolSourceEnum;
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
  source: AppToolSourceEnum;
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
