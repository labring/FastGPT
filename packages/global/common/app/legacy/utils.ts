import type { AppChatConfigType, AppWelcomeConfigType } from '../../../core/app/type';
import type { VariableItemType } from '../../../core/app/variable/type';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes
} from '../../../core/workflow/constants';
import type { NodeToolConfigType } from '../../../core/workflow/type/node';

/** 读取历史欢迎语；会话快照优先，空字符串表示明确清空，不能回退到应用值。 */
export const resolveLegacyWelcomeConfig = ({
  chatConfig,
  storeWelcomeText
}: {
  chatConfig?: AppChatConfigType;
  storeWelcomeText?: string;
}): AppWelcomeConfigType => ({
  welcomeText:
    storeWelcomeText ?? chatConfig?.welcomeConfig?.welcomeText ?? chatConfig?.welcomeText,
  welcomeQuestions: chatConfig?.welcomeConfig?.welcomeQuestions
});

/** 在应用变量进入节点适配前修复旧文本控件类型，并把 enums 归一到 list；不修改持久化原对象。 */
export const normalizeLegacyAppVariable = (variable: VariableItemType): VariableItemType => ({
  ...variable,
  valueType:
    variable.type === VariableInputEnum.input &&
    variable.valueType !== undefined &&
    !textInputVariableValueTypes.includes(variable.valueType)
      ? WorkflowIOValueTypeEnum.string
      : variable.valueType,
  list: variable.list ?? variable.enums
});

/** 旧工具集节点可能没有 toolId 或用空值占位；读取边界用所属 App ID 补齐，保留其他配置。 */
export const normalizeLegacyToolSetConfig = ({
  config,
  toolSetId
}: {
  config?: NodeToolConfigType;
  toolSetId: string;
}) => {
  if (!config) return undefined;
  const normalize = <T extends object>(toolSet: T) => ({
    ...toolSet,
    toolId:
      'toolId' in toolSet && typeof toolSet.toolId === 'string' && toolSet.toolId
        ? toolSet.toolId
        : toolSetId
  });
  return {
    ...config,
    httpToolSet: config.httpToolSet ? normalize(config.httpToolSet) : undefined,
    mcpToolSet: config.mcpToolSet ? normalize(config.mcpToolSet) : undefined
  };
};
