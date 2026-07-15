import { Button, Flex, ModalBody } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { childAppSystemKey } from '../FormComponent/ToolSelector/ToolSelectModal';
import {
  Controller,
  type Control,
  type UseFormGetValues,
  type UseFormReset,
  useForm,
  useWatch
} from 'react-hook-form';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum,
  FlowValueTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import {
  SecretInputForm,
  type ToolParamsFormType
} from '@/pageComponents/app/tool/SecretInputModal';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import {
  canInputBeAgentGenerated,
  canInputBeManuallyConfigured,
  getSelectedInputRenderType,
  getToolInputManualRenderType,
  getToolConfigStatus,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  isToolInputValueConfigured,
  stripToolInputDefaultMode
} from '@fastgpt/global/core/app/formEdit/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { getClientToolPreviewNode } from '@/web/core/app/api/tool';
import { getAppVersionList } from '@/web/core/app/api/version';
import { getTeamToolVersions } from '@/web/core/plugin/team/api';
import type { SystemToolVersionType } from '@fastgpt/global/core/app/tool/systemTool/type/base';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { isDebugToolSource, splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getNodeToolSetList } from '../../WorkflowComponents/Flow/nodes/components/ToolSetList';

const inputTypeFormKey = (key: string) => `__input_type__${key}`;
const developerInputTypeFormKey = (key: string) => `__developer_input_type__${key}`;

type ToolSetListItemType = {
  name: string;
  description?: string;
};

const buildConfigRenderTypeList = ({
  developerInputType,
  canAgentGenerated,
  renderTypeList
}: {
  developerInputType?: FlowNodeInputTypeEnum;
  canAgentGenerated: boolean;
  renderTypeList: FlowNodeInputTypeEnum[];
}): FlowNodeInputTypeEnum[] => {
  const canManuallyConfigure = canInputBeManuallyConfigured({ renderTypeList });
  const developerRenderTypeList = renderTypeList.filter(
    (type) => type !== FlowNodeInputTypeEnum.agentGenerated
  );
  const configDeveloperRenderTypeList = canManuallyConfigure
    ? Array.from(
        new Set([...(developerInputType ? [developerInputType] : []), ...developerRenderTypeList])
      )
    : developerRenderTypeList;

  if (!canAgentGenerated) {
    return configDeveloperRenderTypeList;
  }

  return Array.from(
    new Set([FlowNodeInputTypeEnum.agentGenerated, ...configDeveloperRenderTypeList])
  );
};

const buildConfigInputTypeState = ({
  selectedInputType,
  developerInputType,
  canAgentGenerated,
  renderTypeList
}: {
  selectedInputType?: FlowNodeInputTypeEnum;
  developerInputType?: FlowNodeInputTypeEnum;
  canAgentGenerated: boolean;
  renderTypeList: FlowNodeInputTypeEnum[];
}) => {
  const finalRenderTypeList = buildConfigRenderTypeList({
    developerInputType,
    canAgentGenerated,
    renderTypeList
  });
  const canManuallyConfigure = canInputBeManuallyConfigured({ renderTypeList });
  const selectedRenderType =
    canAgentGenerated && selectedInputType === FlowNodeInputTypeEnum.agentGenerated
      ? FlowNodeInputTypeEnum.agentGenerated
      : canManuallyConfigure
        ? (developerInputType ?? finalRenderTypeList[0])
        : canAgentGenerated
          ? FlowNodeInputTypeEnum.agentGenerated
          : finalRenderTypeList[0];
  const selectedTypeIndex = finalRenderTypeList.findIndex((type) => type === selectedRenderType);

  return {
    renderTypeList: finalRenderTypeList,
    selectedType: selectedRenderType,
    selectedTypeIndex: selectedTypeIndex >= 0 ? selectedTypeIndex : 0
  };
};

const normalizeInputSelectedTypeIndex = <T extends FlowNodeTemplateType['inputs'][number]>(
  input: T
): T => {
  const selectedType = input.selectedType ?? getSelectedInputRenderType(input);
  const normalizedInput = (
    selectedType
      ? {
          ...input,
          selectedType
        }
      : input
  ) as T;

  if (normalizedInput.selectedTypeIndex === undefined || normalizedInput.selectedTypeIndex >= 0)
    return normalizedInput;

  return {
    ...normalizedInput,
    selectedTypeIndex: undefined
  };
};

const shouldShowConfigInput = (input: FlowNodeTemplateType['inputs'][number]) =>
  input.key === NodeInputKeyEnum.systemInputConfig ||
  (!childAppSystemKey.includes(input.key) &&
    !input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) &&
    !input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
    input.renderTypeList[0] !== FlowNodeInputTypeEnum.hidden);

const shouldRenderConfigInput = (input: FlowNodeTemplateType['inputs'][number]) =>
  shouldShowConfigInput(input) && input.key !== NodeInputKeyEnum.systemInputConfig;

const getSecretInput = (tool: FlowNodeTemplateType) =>
  tool.inputs.find((input) => input.key === NodeInputKeyEnum.systemInputConfig && input.inputList);

const getConfigFormValues = (tool: FlowNodeTemplateType) =>
  tool.inputs.reduce(
    (acc, input) => {
      const normalizedInput = initToolInputTypeByDefaultMode(input);
      const canManuallyConfigure = canInputBeManuallyConfigured(normalizedInput);
      const developerInputType = canManuallyConfigure
        ? getToolInputManualRenderType(normalizedInput)
        : undefined;
      acc[input.key] = input.value ?? input.defaultValue;
      acc[inputTypeFormKey(input.key)] = isAgentGeneratedToolInput(normalizedInput)
        ? FlowNodeInputTypeEnum.agentGenerated
        : (developerInputType ?? getSelectedInputRenderType(normalizedInput));
      acc[developerInputTypeFormKey(input.key)] = developerInputType;
      return acc;
    },
    {} as Record<string, any>
  );

const getToolVersionText = (tool: FlowNodeTemplateType) => tool.versionLabel || tool.version || '';

const canShowVersionSelect = (tool: FlowNodeTemplateType) => {
  if (!tool.pluginId || isDebugToolSource(tool.source)) return false;

  const { source } = splitCombineToolId(tool.pluginId);
  return source !== AppToolSourceEnum.mcp && source !== AppToolSourceEnum.http;
};

const mergeConfiguredTool = ({
  nextTool,
  prevTool,
  formValues
}: {
  nextTool: FlowNodeTemplateType;
  prevTool: SelectedToolItemType;
  formValues: Record<string, any>;
}): SelectedToolItemType => {
  const prevInputMap = new Map(prevTool.inputs.map((input) => [input.key, input]));

  const mergedTool = {
    ...nextTool,
    configStatus: prevTool.configStatus,
    inputs: nextTool.inputs.map((input) => {
      const prevInput = prevInputMap.get(input.key);
      if (!prevInput) return normalizeInputSelectedTypeIndex(input);

      return {
        ...input,
        value: formValues[input.key] ?? prevInput.value ?? input.value,
        ...buildConfigInputTypeState({
          selectedInputType: formValues[inputTypeFormKey(input.key)] ?? input.renderTypeList[0],
          developerInputType:
            formValues[developerInputTypeFormKey(input.key)] ?? getToolInputManualRenderType(input),
          renderTypeList: input.renderTypeList,
          canAgentGenerated: canInputBeAgentGenerated(input)
        })
      };
    })
  };

  return {
    ...mergedTool,
    configStatus: getToolConfigStatus({ tool: mergedTool }).status
  };
};

const getOutputValueTypeText = (output: FlowNodeTemplateType['outputs'][number]) => {
  if (output.valueDesc) return output.valueDesc;
  if (output.valueType && FlowValueTypeMap[output.valueType]) {
    return FlowValueTypeMap[output.valueType].label;
  }
  return output.type || '';
};

const hasToolSetConfig = (tool: FlowNodeTemplateType) =>
  tool.flowNodeType === FlowNodeTypeEnum.toolSet ||
  !!tool.toolConfig?.mcpToolSet ||
  !!tool.toolConfig?.httpToolSet ||
  !!tool.toolConfig?.systemToolSet;

const getSecretConfigDisplay = ({
  value,
  hasSystemSecret,
  t
}: {
  value?: ToolParamsFormType;
  hasSystemSecret?: boolean;
  t: ReturnType<typeof useSafeTranslation>['t'];
}) => {
  const type =
    value?.type ??
    (hasSystemSecret ? SystemToolSecretInputTypeEnum.system : SystemToolSecretInputTypeEnum.manual);

  if (type === SystemToolSecretInputTypeEnum.system) {
    return {
      type,
      title: t('app:system_secret'),
      desc: t('app:tool_active_system_config_desc')
    };
  }

  return {
    type,
    title: t('app:manual_secret'),
    desc: t('app:tool_active_manual_config_desc')
  };
};

const isSecretInputConfigValid = ({
  input,
  value
}: {
  input: FlowNodeTemplateType['inputs'][number];
  value?: ToolParamsFormType;
}) => {
  if (!value) return false;
  if (value.type !== SystemToolSecretInputTypeEnum.manual) return true;

  return (input.inputList || []).every((item) => {
    if (!item.required) return true;

    const fieldValue = value.value?.[item.key];
    if (item.inputType === 'switch') {
      return fieldValue?.value !== undefined && fieldValue.value !== null;
    }

    return !!fieldValue?.value || !!fieldValue?.secret;
  });
};

const SectionTitle = ({ text }: { text: string }) => (
  <Flex alignItems={'center'} gap={2}>
    <Box w={'4px'} h={'14px'} bg={'primary.600'} borderRadius={'full'} />
    <Box fontSize={'md'} fontWeight={'500'} color={'myGray.900'}>
      {text}
    </Box>
  </Flex>
);

const CardSection = ({ children }: { children: React.ReactNode }) => (
  <Box bg={'white'} border={'1px solid'} borderColor={'myGray.150'} borderRadius={'8px'} p={4}>
    {children}
  </Box>
);

const SmallSectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Box
    fontSize={'10px'}
    lineHeight={'14px'}
    fontWeight={'500'}
    color={'myGray.400'}
    letterSpacing={'0.2px'}
  >
    {children}
  </Box>
);

const ActiveRadioIcon = () => (
  <Flex
    w={'18px'}
    h={'18px'}
    border={'2px solid'}
    borderColor={'rgba(51,112,255,0.15)'}
    borderRadius={'full'}
    alignItems={'center'}
    justifyContent={'center'}
    flexShrink={0}
  >
    <Flex
      w={'14px'}
      h={'14px'}
      border={'1px solid'}
      borderColor={'primary.600'}
      borderRadius={'full'}
      bg={'rgba(51,112,255,0.1)'}
      alignItems={'center'}
      justifyContent={'center'}
    >
      <Box w={'5px'} h={'5px'} bg={'primary.600'} borderRadius={'full'} />
    </Flex>
  </Flex>
);

const ToolHeaderCard = ({
  tool,
  reset,
  getValues,
  onChangeTool
}: {
  tool: SelectedToolItemType;
  reset: UseFormReset<Record<string, any>>;
  getValues: UseFormGetValues<Record<string, any>>;
  onChangeTool: (tool: SelectedToolItemType) => void;
}) => {
  const { t } = useSafeTranslation();

  return (
    <CardSection>
      <Flex flexDirection={'column'} gap={2}>
        <Flex alignItems={'center'} justifyContent={'space-between'} minH={'36px'} gap={3}>
          <Flex alignItems={'center'} gap={2} minW={0}>
            <Avatar src={tool.avatar} w={'24px'} h={'24px'} borderRadius={'sm'} />
            <Flex alignItems={'center'} gap={2} minW={0}>
              <Box
                color={'myGray.500'}
                fontSize={'14px'}
                lineHeight={'20px'}
                className="textEllipsis"
              >
                {t(tool.name as any)}
              </Box>
              {!!(tool?.courseUrl || tool?.readmeUrl || tool?.userGuide) && (
                <UseGuideModal
                  title={tool?.name}
                  iconSrc={tool?.avatar}
                  text={tool?.userGuide}
                  link={tool?.courseUrl}
                  readmeUrl={tool?.readmeUrl}
                >
                  {({ onClick }) => (
                    <MyIcon
                      name={'book'}
                      w={'16px'}
                      color={'primary.600'}
                      cursor={'pointer'}
                      flexShrink={0}
                      onClick={onClick}
                    />
                  )}
                </UseGuideModal>
              )}
            </Flex>
          </Flex>
          <ToolVersionSelect
            tool={tool}
            reset={reset}
            getValues={getValues}
            onChangeTool={onChangeTool}
          />
        </Flex>
        {tool.intro && (
          <Box color={'myGray.500'} fontSize={'14px'} lineHeight={'20px'} className="textEllipsis">
            {t(tool.intro as any)}
          </Box>
        )}
      </Flex>
    </CardSection>
  );
};

const AgentGeneratedPlaceholder = () => {
  const { t } = useSafeTranslation();

  return (
    <Flex
      h={'40px'}
      alignItems={'center'}
      px={3}
      bg={'myGray.25'}
      border={'base'}
      borderColor={'myGray.100'}
      borderRadius={'md'}
      color={'myGray.400'}
      fontSize={'sm'}
    >
      {t('common:core.workflow.inputType.agentGeneratedInputPlaceholder')}
    </Flex>
  );
};

const ConfigValueInput = ({
  input,
  control
}: {
  input: FlowNodeTemplateType['inputs'][number];
  control: Control<Record<string, any>>;
}) => {
  const selectedInputType = useWatch({
    control,
    name: inputTypeFormKey(input.key)
  }) as FlowNodeInputTypeEnum | undefined;
  const developerInputType = useWatch({
    control,
    name: developerInputTypeFormKey(input.key)
  }) as FlowNodeInputTypeEnum | undefined;

  const isAgentGenerated = selectedInputType === FlowNodeInputTypeEnum.agentGenerated;
  const inputType = developerInputType ?? FlowNodeInputTypeEnum.input;

  if (isAgentGenerated) {
    return <AgentGeneratedPlaceholder />;
  }

  return (
    <Controller
      control={control}
      name={input.key}
      rules={{
        validate: (value) => {
          if (!input.required) return true;
          return isToolInputValueConfigured({ input, value });
        }
      }}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        return (
          <InputRender
            {...input}
            isRichText={false}
            isInvalid={!!error}
            inputType={nodeInputTypeToInputType([inputType])}
            value={value}
            onChange={onChange}
          />
        );
      }}
    />
  );
};

const SecretInputControl = ({
  input,
  control,
  configTool
}: {
  input: FlowNodeTemplateType['inputs'][number];
  control: Control<Record<string, any>>;
  configTool: FlowNodeTemplateType;
}) => {
  const { t } = useSafeTranslation();
  const hasSystemSecret = configTool.hasSystemSecret === true;
  const [isExpanded, setIsExpanded] = useState(() => {
    const initialValue = input.value as ToolParamsFormType | undefined;
    return !hasSystemSecret || initialValue?.type === SystemToolSecretInputTypeEnum.manual;
  });

  return (
    <Controller
      control={control}
      name={input.key}
      rules={{
        validate: (value) =>
          isSecretInputConfigValid({
            input,
            value: value as ToolParamsFormType | undefined
          })
      }}
      render={({ field: { onChange, value }, fieldState: { error } }) => {
        const val = value as ToolParamsFormType | undefined;
        const display = getSecretConfigDisplay({
          value: val,
          hasSystemSecret,
          t
        });

        const secretInputForm = (
          <SecretInputForm
            isFolder={configTool?.isFolder}
            inputConfig={{
              ...input,
              value: val
            }}
            hasSystemSecret={hasSystemSecret}
            secretCost={configTool?.systemKeyCost}
            courseUrl={configTool?.courseUrl}
            readmeUrl={configTool?.readmeUrl}
            parentId={configTool?.pluginId}
            source={configTool?.source}
            showTitle={false}
            onChange={onChange}
          />
        );

        if (!hasSystemSecret) {
          return secretInputForm;
        }

        if (isExpanded) {
          return (
            <>
              {secretInputForm}
              <Button
                mt={2}
                size={'xs'}
                h={'24px'}
                variant={'transparentBase'}
                color={'myGray.600'}
                leftIcon={<MyIcon name={'core/chat/chevronUp'} w={'12px'} color={'myGray.600'} />}
                px={2}
                onClick={() => setIsExpanded(false)}
              >
                {t('workflow:Fold')}
              </Button>
            </>
          );
        }

        return (
          <>
            <Flex
              border={'1px solid'}
              borderColor={error ? 'red.500' : '#DFE2EA'}
              borderRadius={'8px'}
              p={'17px'}
              gap={2}
              cursor={'pointer'}
              onClick={() => setIsExpanded(true)}
            >
              <ActiveRadioIcon />
              <Box minW={0} flex={1}>
                <Box
                  color={'#24282C'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  fontWeight={'500'}
                  letterSpacing={'0.1px'}
                >
                  {display.title}
                </Box>
                <Box mt={2} color={'myGray.500'} fontSize={'12px'} lineHeight={'16px'}>
                  {display.desc}
                </Box>
              </Box>
            </Flex>
            <Button
              mt={2}
              size={'xs'}
              h={'24px'}
              variant={'transparentBase'}
              color={'myGray.600'}
              leftIcon={<MyIcon name={'core/chat/chevronDown'} w={'12px'} color={'myGray.600'} />}
              px={2}
              onClick={() => setIsExpanded(true)}
            >
              {t('workflow:Unfold')}
            </Button>
          </>
        );
      }}
    />
  );
};

const ConfigInputRow = ({
  input,
  control
}: {
  input: FlowNodeTemplateType['inputs'][number];
  control: Control<Record<string, any>>;
}) => {
  const { t } = useSafeTranslation();
  const canAgentGenerated = canInputBeAgentGenerated(input);
  const canManuallyConfigure = canInputBeManuallyConfigured(input);
  const developerInputType = canManuallyConfigure ? getToolInputManualRenderType(input) : undefined;
  const selectableRenderTypeList = canAgentGenerated
    ? [FlowNodeInputTypeEnum.agentGenerated, ...(developerInputType ? [developerInputType] : [])]
    : developerInputType
      ? [developerInputType]
      : [];

  return (
    <Box w={'full'}>
      <Flex alignItems={'center'} minH={'32px'} gap={2}>
        <Flex alignItems={'center'} minW={0}>
          <FormLabel required={input.required} color={'myGray.600'}>
            {t(input.label as any)}
          </FormLabel>
          {input.description && <QuestionTip ml={1} label={t(input.description as any)} />}
        </Flex>

        {selectableRenderTypeList.length > 1 && (
          <Controller
            control={control}
            name={inputTypeFormKey(input.key)}
            render={({ field: { value, onChange } }) => (
              <NodeInputSelect
                renderTypeList={selectableRenderTypeList}
                renderTypeIndex={Math.max(
                  0,
                  selectableRenderTypeList.findIndex((item) => item === value)
                )}
                onChange={(type) => onChange(type)}
                isAgentGeneratedMode
              />
            )}
          />
        )}
      </Flex>

      <Box mt={1.5}>
        <ConfigValueInput input={input} control={control} />
      </Box>
    </Box>
  );
};

const ConfigOutputRow = ({ output }: { output: FlowNodeTemplateType['outputs'][number] }) => {
  const { t } = useSafeTranslation();
  const valueTypeText = getOutputValueTypeText(output);

  return (
    <Flex alignItems={'center'} minH={'32px'} gap={2}>
      <Flex alignItems={'center'}>
        <FormLabel required={output.required} color={'myGray.600'}>
          {t(output.label as any)}
        </FormLabel>
        {output.description && <QuestionTip ml={1} label={t(output.description as any)} />}
      </Flex>
      {!!valueTypeText && (
        <MyTag colorSchema="gray" type="borderFill">
          {valueTypeText}
        </MyTag>
      )}
    </Flex>
  );
};

const SecretConfigSection = ({
  input,
  control,
  configTool
}: {
  input?: FlowNodeTemplateType['inputs'][number];
  control: Control<Record<string, any>>;
  configTool: FlowNodeTemplateType;
}) => {
  const { t } = useSafeTranslation();

  if (!input) return null;

  return (
    <CardSection>
      <Flex flexDirection={'column'} gap={4}>
        <SmallSectionLabel>{t('common:secret_key')}</SmallSectionLabel>
        <SecretInputControl input={input} control={control} configTool={configTool} />
      </Flex>
    </CardSection>
  );
};

const ToolSetListCard = ({ tool }: { tool: FlowNodeTemplateType }) => {
  const { t } = useSafeTranslation();
  const toolList = getNodeToolSetList(tool) as ToolSetListItemType[];

  if (toolList.length === 0) return null;

  return (
    <CardSection>
      <Flex flexDirection={'column'} gap={4}>
        <SmallSectionLabel>{t('app:MCP_tools_list')}</SmallSectionLabel>
        <Flex
          flexDirection={'column'}
          gap={2}
          maxH={'260px'}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          {toolList.map((item, index) => (
            <Flex
              key={`${item.name}-${index}`}
              gap={'10px'}
              alignItems={'flex-start'}
              pb={2}
              borderBottom={index === toolList.length - 1 ? 'none' : '1px solid'}
              borderColor={'myGray.200'}
            >
              <Flex
                w={'24px'}
                h={'24px'}
                alignItems={'center'}
                justifyContent={'center'}
                flexShrink={0}
                color={'myGray.500'}
                fontSize={'16px'}
                lineHeight={'24px'}
                fontWeight={'500'}
              >
                {index + 1 < 10 ? `0${index + 1}` : index + 1}
              </Flex>
              <Box minW={0} flex={1}>
                <Box
                  color={'#24282C'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  className="textEllipsis"
                >
                  {item.name}
                </Box>
                <Box
                  mt={1}
                  color={'myGray.500'}
                  fontSize={'12px'}
                  lineHeight={'16px'}
                  className="textEllipsis"
                >
                  {item.description || t('app:tools_no_description')}
                </Box>
              </Box>
            </Flex>
          ))}
        </Flex>
      </Flex>
    </CardSection>
  );
};

const InputConfigSection = ({
  inputs,
  control
}: {
  inputs: FlowNodeTemplateType['inputs'];
  control: Control<Record<string, any>>;
}) => {
  const { t } = useSafeTranslation();

  if (inputs.length === 0) return null;

  return (
    <Box
      bg={'myGray.25'}
      border={'1px solid'}
      borderColor={'myGray.150'}
      borderRadius={'8px'}
      p={4}
    >
      <Box mb={4}>
        <SectionTitle text={t('common:Input')} />
      </Box>

      {inputs.length > 0 && (
        <Flex flexDirection={'column'} gap={4}>
          {inputs.map((input) => (
            <ConfigInputRow key={input.key} input={input} control={control} />
          ))}
        </Flex>
      )}
    </Box>
  );
};

const OutputConfigSection = ({ outputs }: { outputs: FlowNodeTemplateType['outputs'] }) => {
  const { t } = useSafeTranslation();

  if (outputs.length === 0) return null;

  return (
    <Box
      bg={'myGray.25'}
      border={'1px solid'}
      borderColor={'myGray.150'}
      borderRadius={'8px'}
      p={4}
    >
      <SectionTitle text={t('common:Output')} />
      <Flex mt={4} flexDirection={'column'} gap={4}>
        {outputs.map((output) => (
          <ConfigOutputRow key={output.key} output={output} />
        ))}
      </Flex>
    </Box>
  );
};

const ToolVersionSelect = ({
  tool,
  reset,
  getValues,
  onChangeTool
}: {
  tool: SelectedToolItemType;
  reset: UseFormReset<Record<string, any>>;
  getValues: UseFormGetValues<Record<string, any>>;
  onChangeTool: (tool: SelectedToolItemType) => void;
}) => {
  const { t } = useSafeTranslation();
  const toolSource = useMemo(
    () => (tool.pluginId ? splitCombineToolId(tool.pluginId).source : undefined),
    [tool.pluginId]
  );

  const {
    runAsync: loadVersions,
    data: versionList = [],
    loading: isLoadingVersions
  } = useRequest(
    async () => {
      if (!tool.pluginId || !canShowVersionSelect(tool)) return [];

      const { authAppId } = splitCombineToolId(tool.pluginId);
      if (toolSource === AppToolSourceEnum.personal) {
        if (!authAppId) return [];

        const { list = [] } = await getAppVersionList({
          appId: authAppId,
          isPublish: true,
          offset: 0,
          pageSize: 100
        });

        return list.map<SystemToolVersionType>((item) => ({
          version: item._id,
          versionDescription: item.versionName
        }));
      }

      return getTeamToolVersions({
        toolId: tool.pluginId,
        source: 'system'
      });
    },
    {
      refreshDeps: [tool.pluginId, toolSource]
    }
  );

  const { runAsync: updateVersion, loading: isUpdatingVersion } = useRequest(
    async (versionId: string) => {
      if (!tool.pluginId) return;

      const nextTool = await getClientToolPreviewNode({
        appId: tool.pluginId,
        versionId,
        source: tool.source
      });
      const mergedTool = mergeConfiguredTool({
        nextTool,
        prevTool: tool,
        formValues: getValues()
      });

      reset(getConfigFormValues(mergedTool));
      onChangeTool(mergedTool);
    },
    {
      refreshDeps: [tool, getValues, onChangeTool, reset]
    }
  );

  const renderVersionList = useMemo(
    () => [
      {
        label: t('app:keep_the_latest'),
        value: ''
      },
      ...versionList.map((item) => ({
        label: item.versionDescription || item.version,
        value: item.version
      }))
    ],
    [t, versionList]
  );

  const valueLabel = useMemo(
    () => (
      <Flex alignItems={'center'} gap={0.5} minW={0} whiteSpace={'nowrap'}>
        {!tool.version ? t('app:keep_the_latest') : tool.versionLabel}
        {tool.isLatestVersion === false && (
          <MyTag type="fill" colorSchema={'adora'} fontSize={'mini'} borderRadius={'lg'}>
            {t('app:not_the_newest')}
          </MyTag>
        )}
      </Flex>
    ),
    [t, tool.isLatestVersion, tool.version, tool.versionLabel]
  );

  if (!canShowVersionSelect(tool)) {
    return getToolVersionText(tool) ? (
      <Button
        variant={'whiteBase'}
        size={'sm'}
        h={'36px'}
        minW={'79px'}
        px={3}
        whiteSpace={'nowrap'}
      >
        {getToolVersionText(tool)}
      </Button>
    ) : null;
  }

  return (
    <MySelect
      value={tool.version}
      onChange={updateVersion}
      isLoading={isUpdatingVersion || isLoadingVersions}
      customOnOpen={loadVersions}
      placeholder={tool.versionLabel}
      variant={'whitePrimaryOutline'}
      size={'sm'}
      width={'136px'}
      h={'36px'}
      minH={'36px'}
      borderRadius={'6px'}
      whiteSpace={'nowrap'}
      wordBreak={'keep-all'}
      list={renderVersionList}
      valueLabel={valueLabel}
    />
  );
};

const ConfigToolModal = ({
  configTool,
  onCloseConfigTool,
  onAddTool
}: {
  configTool: SelectedToolItemType;
  onCloseConfigTool: () => void;
  onAddTool: (tool: SelectedToolItemType) => void;
}) => {
  const { t } = useSafeTranslation();
  const [editingTool, setEditingTool] = useState(configTool);

  const visibleConfigInputs = useMemo(
    () => editingTool.inputs.filter(shouldRenderConfigInput),
    [editingTool.inputs]
  );
  const secretInput = useMemo(() => getSecretInput(editingTool), [editingTool]);
  const visibleOutputs = useMemo(
    () => editingTool.outputs.filter((output) => output.type !== FlowNodeOutputTypeEnum.hidden),
    [editingTool.outputs]
  );
  const isToolSet = hasToolSetConfig(editingTool);

  const { handleSubmit, control, reset, getValues } = useForm({
    defaultValues: getConfigFormValues(editingTool)
  });

  const onSubmit = handleSubmit((data) => {
    onAddTool({
      ...editingTool,
      inputs: editingTool.inputs.map((input) => {
        if (!shouldShowConfigInput(input)) {
          return stripToolInputDefaultMode(normalizeInputSelectedTypeIndex(input));
        }

        return stripToolInputDefaultMode({
          ...input,
          ...buildConfigInputTypeState({
            selectedInputType: data[inputTypeFormKey(input.key)],
            developerInputType: data[developerInputTypeFormKey(input.key)],
            renderTypeList: input.renderTypeList,
            canAgentGenerated: canInputBeAgentGenerated(input)
          }),
          value: data[input.key] ?? input.value
        });
      })
    });
    onCloseConfigTool();
  });

  return (
    <MyModal
      isOpen
      isCentered
      showCloseButton={false}
      overflow={'hidden'}
      w={['90vw', '560px']}
      maxW={['90vw', '560px']}
      maxH={'90vh'}
      borderRadius={'10px'}
      boxShadow={'0px 4px 10px rgba(19,51,107,0.1), 0px 0px 1px rgba(19,51,107,0.1)'}
      onClose={onCloseConfigTool}
    >
      <ModalBody p={0} overflow={'hidden'}>
        <Flex maxH={'90vh'} flexDirection={'column'} overflow={'hidden'}>
          <Box px={8} pt={8} position={'relative'} flexShrink={0}>
            <Box
              color={'black'}
              fontSize={'20px'}
              lineHeight={'26px'}
              fontWeight={'500'}
              letterSpacing={'0.15px'}
            >
              {t('app:tool_param_full_config')}
            </Box>
            <Flex
              position={'absolute'}
              top={'8px'}
              right={'8px'}
              w={'36px'}
              h={'36px'}
              alignItems={'center'}
              justifyContent={'center'}
              borderRadius={'4px'}
              cursor={'pointer'}
              _hover={{ bg: 'myGray.100' }}
              onClick={onCloseConfigTool}
            >
              <MyIcon name={'common/closeLight'} w={'20px'} color={'myGray.900'} />
            </Flex>
          </Box>

          <Flex
            px={8}
            mt={6}
            flex={1}
            minH={0}
            flexDirection={'column'}
            gap={6}
            overflowY={'auto'}
            overflowX={'hidden'}
          >
            <ToolHeaderCard
              tool={editingTool}
              reset={reset}
              getValues={getValues}
              onChangeTool={setEditingTool}
            />
            <SecretConfigSection input={secretInput} control={control} configTool={editingTool} />
            {isToolSet ? (
              <ToolSetListCard tool={editingTool} />
            ) : (
              <>
                <InputConfigSection inputs={visibleConfigInputs} control={control} />
                <OutputConfigSection outputs={visibleOutputs} />
              </>
            )}
          </Flex>

          <Flex flexShrink={0} justifyContent={'flex-end'} gap={3} px={8} pt={6} pb={8}>
            <Button w={'64px'} h={'32px'} variant={'whiteBase'} onClick={onCloseConfigTool}>
              {t('common:Cancel')}
            </Button>
            <Button w={'64px'} h={'32px'} variant={'primary'} onClick={onSubmit}>
              {t('common:Confirm')}
            </Button>
          </Flex>
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(ConfigToolModal);
