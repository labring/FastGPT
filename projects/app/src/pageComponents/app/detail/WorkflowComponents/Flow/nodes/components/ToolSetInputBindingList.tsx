import { Box, Button, Flex } from '@chakra-ui/react';
import React, { useState } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import PromptEditor from '@fastgpt/web/components/common/Textarea/PromptEditor';
import GlobalVariableSelect, { useGlobalVariableLabels } from './GlobalVariableSelect';
import { AppToolSourceEnum, AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/common/workflow/reference';
import {
  canInputBeAgentGenerated,
  getToolInputManualRenderType,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';
import { isGlobalVariableReferenceValue } from '@fastgpt/global/core/app/tool/toolSet/utils';
import type {
  EditorVariablePickerType,
  FlowNodeInputItemType
} from '@fastgpt/global/core/workflow/type/io';

const getManualDefaultValue = (input: FlowNodeInputItemType) => {
  if (
    input.valueType === WorkflowIOValueTypeEnum.boolean ||
    getToolInputManualRenderType(input) === FlowNodeInputTypeEnum.switch
  ) {
    return false;
  }
  return '';
};

const ToolSetParamRow = ({
  input,
  keyPrefix,
  value,
  hasValue,
  mode,
  globalVariables,
  onChangeParameter
}: {
  input: FlowNodeInputItemType;
  keyPrefix: string;
  value?: unknown;
  hasValue: boolean;
  mode?: AgentToolInputModeEnum;
  globalVariables: EditorVariablePickerType[];
  onChangeParameter: (payload: {
    key: string;
    input: FlowNodeInputItemType;
    mode?: AgentToolInputModeEnum;
    value?: unknown;
  }) => void;
}) => {
  const { t } = useSafeTranslation();
  const key = `${keyPrefix}.${input.key}`;
  // 与运行时一致：未显式选择时沿用工具定义声明的默认输入方式。
  const normalizedInput = initToolInputTypeByDefaultMode(input, {
    allowUserChatInputAgentGenerated: true
  });
  const manualType = getToolInputManualRenderType(normalizedInput) ?? FlowNodeInputTypeEnum.input;
  const isReference = isGlobalVariableReferenceValue(value);
  const isAgentGenerated =
    mode === AgentToolInputModeEnum.agentGenerated ||
    (mode === undefined && isAgentGeneratedToolInput(normalizedInput));
  const canAgentGenerated = canInputBeAgentGenerated(input);
  const compatibleVariables = globalVariables.filter((variable) =>
    areWorkflowValueTypesCompatible({
      expected: input.valueType,
      actual: variable.valueType
    })
  );
  // 没有可引用的变量时不展示「引用」，避免切过去后删掉已填内容。
  const canReference =
    input.renderTypeList?.includes(FlowNodeInputTypeEnum.reference) === true &&
    compatibleVariables.length > 0;
  const requiredEmpty =
    input.required &&
    hasValue &&
    !isReference &&
    (value === undefined || (typeof value === 'string' && value.trim() === ''));
  const selectedType = isAgentGenerated
    ? FlowNodeInputTypeEnum.agentGenerated
    : isReference
      ? FlowNodeInputTypeEnum.reference
      : manualType;
  const isTextManual = [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea].includes(
    manualType
  );
  const variableLabels = useGlobalVariableLabels(globalVariables);

  return (
    <Flex flexDirection={'column'} gap={2}>
      <Flex alignItems={'center'} gap={2}>
        <Box flex={1} minW={0}>
          <Box fontSize={'12px'} lineHeight={'18px'} color={'myGray.700'} className="textEllipsis">
            {t((input.label || input.key) as any)}
            {input.required && (
              <Box as={'span'} color={'red.600'} ml={0.5}>
                *
              </Box>
            )}
          </Box>
          {(input.toolDescription || input.description) && (
            <Box
              fontSize={'11px'}
              lineHeight={'16px'}
              color={'myGray.500'}
              className="textEllipsis"
            >
              {t((input.toolDescription || input.description) as any)}
            </Box>
          )}
        </Box>
        <NodeInputSelect
          renderTypeList={[
            ...(canAgentGenerated ? [FlowNodeInputTypeEnum.agentGenerated] : []),
            ...(canReference ? [FlowNodeInputTypeEnum.reference] : []),
            ...(getToolInputManualRenderType(input) ? [manualType] : [])
          ]}
          selectedType={selectedType}
          isAgentGeneratedMode
          onChange={(type) => {
            if (type === FlowNodeInputTypeEnum.agentGenerated) {
              onChangeParameter({
                key,
                input,
                mode: AgentToolInputModeEnum.agentGenerated,
                value: undefined
              });
              return;
            }
            if (type === FlowNodeInputTypeEnum.reference) {
              // 切到引用时优先保留已选变量；没有则选第一个类型兼容的全局变量。
              const firstVariable = compatibleVariables[0];
              onChangeParameter({
                key,
                input,
                mode: AgentToolInputModeEnum.manual,
                value: isReference
                  ? value
                  : firstVariable
                    ? [VARIABLE_NODE_ID, firstVariable.key]
                    : undefined
              });
              return;
            }
            onChangeParameter({
              key,
              input,
              mode: AgentToolInputModeEnum.manual,
              value: hasValue && !isReference ? value : getManualDefaultValue(input)
            });
          }}
        />
      </Flex>

      {!isAgentGenerated && (
        <Box pl={'12px'}>
          {isReference ? (
            <GlobalVariableSelect
              value={value}
              valueType={input.valueType}
              globalVariables={globalVariables}
              onChange={(nextValue) => onChangeParameter({ key, input, value: nextValue })}
            />
          ) : isTextManual ? (
            <PromptEditor
              isRichText={false}
              showOpenModal={false}
              minH={60}
              maxH={160}
              bg={'white'}
              value={
                typeof value === 'string'
                  ? value
                  : value === undefined || value === null
                    ? ''
                    : String(value)
              }
              variableLabels={variableLabels}
              maxLength={input.maxLength}
              placeholder={input.placeholder ?? t('app:toolset_param_manual_placeholder')}
              onChange={(text) => onChangeParameter({ key, input, value: text })}
            />
          ) : (
            <InputRender
              {...input}
              inputType={nodeInputTypeToInputType([manualType])}
              isRichText={false}
              value={value}
              onChange={(nextValue) => onChangeParameter({ key, input, value: nextValue })}
            />
          )}
          {requiredEmpty && (
            <Box mt={1} fontSize={'11px'} lineHeight={'16px'} color={'red.600'}>
              {t('app:toolset_param_required_empty')}
            </Box>
          )}
          {globalVariables.length === 0 && (
            <Box mt={1} fontSize={'11px'} lineHeight={'16px'} color={'myGray.500'}>
              {t('app:toolset_global_variable_empty')}
            </Box>
          )}
        </Box>
      )}
    </Flex>
  );
};

/**
 * HTTP 工具集子工具参数配置。
 * 每个参数可切换 AI 生成 / 引用全局变量 / 手动输入；默认 AI 生成。
 */
const ToolSetInputBindingList = ({
  toolList,
  toolsetAppId,
  values,
  modes,
  globalVariables,
  onChangeParameter
}: {
  toolList: { name: string; description?: string }[];
  toolsetAppId?: string;
  values: Record<string, unknown>;
  modes: Record<string, AgentToolInputModeEnum>;
  globalVariables: EditorVariablePickerType[];
  onChangeParameter: (payload: {
    key: string;
    input: FlowNodeInputItemType;
    mode?: AgentToolInputModeEnum;
    value?: unknown;
  }) => void;
}) => {
  const { t } = useSafeTranslation();
  const [expandedTool, setExpandedTool] = useState<string>();
  const [toolInputs, setToolInputs] = useState<Record<string, FlowNodeInputItemType[]>>({});
  // run 会捕获失败（onError 已提示），避免预览请求失败时留下未处理的 rejection。
  const { run: loadToolInputs, loading: isLoadingInputs } = useRequest(
    async (toolName: string) => {
      if (!toolsetAppId) return;
      const preview = await getClientToolPreviewNode({
        appId: `${AppToolSourceEnum.http}-${toolsetAppId}/${toolName}`,
        getLatestVersion: true
      });
      setToolInputs((state) => ({ ...state, [toolName]: preview.inputs }));
    },
    { manual: true }
  );

  if (toolList.length === 0) return null;

  return (
    <Flex flexDirection={'column'} gap={2}>
      {toolList.map((item, index) => {
        const isExpanded = expandedTool === item.name;
        const inputs = toolInputs[item.name];
        return (
          <Box
            key={`${item.name}-${index}`}
            py={2}
            borderBottom={index === toolList.length - 1 ? 'none' : '1px solid'}
            borderColor={'myGray.200'}
          >
            <Flex alignItems={'center'} gap={2}>
              <Box
                w={'24px'}
                flexShrink={0}
                color={'myGray.500'}
                fontSize={'14px'}
                fontWeight={'500'}
              >
                {index + 1 < 10 ? `0${index + 1}` : index + 1}
              </Box>
              <Box
                flex={1}
                minW={0}
                fontSize={'13px'}
                color={'myGray.900'}
                className="textEllipsis"
              >
                {item.name}
              </Box>
              <Button
                size={'xs'}
                variant={'whiteBase'}
                flexShrink={0}
                onClick={() => {
                  if (isExpanded) {
                    setExpandedTool(undefined);
                    return;
                  }
                  setExpandedTool(item.name);
                  if (!inputs) loadToolInputs(item.name);
                }}
              >
                {t('app:tool_param_config')}
              </Button>
            </Flex>
            {isExpanded && (
              <Box mt={2} pl={'32px'} display={'flex'} flexDirection={'column'} gap={3}>
                {isLoadingInputs ? (
                  <Box fontSize={'12px'} color={'myGray.500'}>
                    {t('common:Loading')}
                  </Box>
                ) : !inputs?.length ? (
                  <Box fontSize={'12px'} color={'myGray.500'}>
                    {t('app:tools_no_description')}
                  </Box>
                ) : (
                  inputs
                    .filter((input) => input.renderTypeList?.length)
                    .map((input) => {
                      const key = `${item.name}.${input.key}`;
                      return (
                        <ToolSetParamRow
                          key={input.key}
                          input={input}
                          keyPrefix={item.name}
                          hasValue={Object.prototype.hasOwnProperty.call(values, key)}
                          value={values[key]}
                          mode={modes[key]}
                          globalVariables={globalVariables}
                          onChangeParameter={onChangeParameter}
                        />
                      );
                    })
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Flex>
  );
};

export default React.memo(ToolSetInputBindingList);
