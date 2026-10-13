import type { CanonicalFlowNodeInputItem } from '../schema';
import type { LegacyFlowNodeInputItem } from './schema';
import { canInputBeAgentGenerated } from '../../../app/formEdit/utils';
import { FlowNodeInputTypeEnum } from '../../node/constant';
import { NodeInputKeyEnum } from '../../constants';

type MigrateFlowNodeInputOptions = {
  isTool?: boolean;
  forceDefaultMode?: boolean;
  allowLegacyToolDescriptionFallback?: boolean;
  deferDefaultSelection?: boolean;
};

/** 在迁移边界恢复历史输入来源，并删除 selectedTypeIndex。 */
export const migrateLegacyFlowNodeInputToCurrent = (
  input: LegacyFlowNodeInputItem,
  {
    isTool = false,
    forceDefaultMode = false,
    allowLegacyToolDescriptionFallback = false,
    deferDefaultSelection = false
  }: MigrateFlowNodeInputOptions = {}
) => {
  const inputRenderTypeList = input.renderTypeList ?? [];
  const legacySelectedType =
    input.selectedTypeIndex === undefined
      ? undefined
      : inputRenderTypeList[input.selectedTypeIndex];
  const isFileInput = inputRenderTypeList.includes(FlowNodeInputTypeEnum.fileSelect);
  const legacyDefaultToAgentGenerated =
    input.defaultToAgentGenerated ?? (isFileInput ? undefined : input.isToolParam);
  const shouldUseLegacyToolDescriptionFallback =
    !isFileInput &&
    allowLegacyToolDescriptionFallback &&
    legacyDefaultToAgentGenerated === undefined &&
    !!input.toolDescription &&
    canInputBeAgentGenerated({ ...input, renderTypeList: inputRenderTypeList });
  // 新增字段会显式保存默认模式；历史文件字段没有该字段时保持原来的手动上传行为。
  const defaultToAgentGenerated =
    legacyDefaultToAgentGenerated ??
    (shouldUseLegacyToolDescriptionFallback ? true : isFileInput ? false : undefined);
  const recommendsAgentGenerated =
    defaultToAgentGenerated === true ||
    (defaultToAgentGenerated !== false && isTool && input.key === NodeInputKeyEnum.userChatInput);
  const isLegacyDefaultSelection =
    input.selectedType === undefined &&
    input.selectedTypeIndex === 0 &&
    (isTool || deferDefaultSelection) &&
    recommendsAgentGenerated;
  const supportsAgentGenerated = canInputBeAgentGenerated({
    ...input,
    renderTypeList: inputRenderTypeList
  });
  const renderTypeList = Array.from(
    new Set([
      ...(supportsAgentGenerated ? [FlowNodeInputTypeEnum.agentGenerated] : []),
      ...inputRenderTypeList.filter(
        (type) => supportsAgentGenerated || type !== FlowNodeInputTypeEnum.agentGenerated
      )
    ])
  );
  const savedSelectedType = forceDefaultMode
    ? undefined
    : (input.selectedType ?? (isLegacyDefaultSelection ? undefined : legacySelectedType));
  const defaultManualType = renderTypeList.find(
    (type) => type !== FlowNodeInputTypeEnum.agentGenerated
  );
  const selectedType =
    deferDefaultSelection && recommendsAgentGenerated && !savedSelectedType
      ? undefined
      : savedSelectedType &&
          renderTypeList.includes(savedSelectedType) &&
          (isTool ||
            deferDefaultSelection ||
            savedSelectedType !== FlowNodeInputTypeEnum.agentGenerated)
        ? savedSelectedType
        : isTool && supportsAgentGenerated && recommendsAgentGenerated
          ? FlowNodeInputTypeEnum.agentGenerated
          : defaultManualType;

  const {
    selectedTypeIndex: _selectedTypeIndex,
    isToolParam: _legacyDefaultToAgentGenerated,
    ...canonicalInput
  } = input;
  // 旧数据用 selectedTypeIndex 保存 renderTypeList 下标；canonical 数据只保留解析后的 selectedType。
  // 同时始终输出 renderTypeList，避免历史输入缺少该字段时把 undefined 带入后续 schema。
  return {
    ...canonicalInput,
    renderTypeList,
    ...(defaultToAgentGenerated === undefined ? {} : { defaultToAgentGenerated }),
    ...(selectedType === undefined ? {} : { selectedType })
  } as CanonicalFlowNodeInputItem;
};

/** 恢复旧 HTTP 468 工具输入的默认 AI 来源。 */
export const migrateLegacyHttpToolInputDefaultMode = (input: LegacyFlowNodeInputItem) => {
  if (
    input.canEdit !== true ||
    !input.toolDescription ||
    input.defaultToAgentGenerated !== undefined ||
    input.isToolParam !== undefined ||
    input.renderTypeList?.includes(FlowNodeInputTypeEnum.fileSelect) ||
    input.selectedType !== undefined ||
    !canInputBeAgentGenerated({ ...input, renderTypeList: input.renderTypeList ?? [] })
  ) {
    return input;
  }

  return { ...input, isToolParam: true };
};

/** 恢复旧工作流工具由 toolDescription 表示的默认 AI 来源。 */
export const migrateLegacyWorkflowToolInputDefaultMode = (input: LegacyFlowNodeInputItem) => {
  if (
    input.defaultToAgentGenerated !== undefined ||
    input.isToolParam !== undefined ||
    input.renderTypeList?.includes(FlowNodeInputTypeEnum.fileSelect) ||
    !input.toolDescription ||
    !canInputBeAgentGenerated({ ...input, renderTypeList: input.renderTypeList ?? [] })
  ) {
    return input;
  }

  return { ...input, isToolParam: true };
};
