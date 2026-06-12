import { Button, Flex, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { childAppSystemKey } from '../FormComponent/ToolSelector/ToolSelectModal';
import { Controller, type Control, useForm, useWatch } from 'react-hook-form';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import SecretInputModal, {
  type ToolParamsFormType
} from '@/pageComponents/app/tool/SecretInputModal';
import { SystemToolSecretInputTypeMap } from '@fastgpt/global/core/app/tool/systemTool/constants';
import { useBoolean } from 'ahooks';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import {
  canInputBeAgentGenerated,
  isAgentGeneratedToolInput
} from '@fastgpt/global/core/app/formEdit/utils';

const inputTypeFormKey = (key: string) => `__input_type__${key}`;
const developerInputTypeFormKey = (key: string) => `__developer_input_type__${key}`;

const getDeveloperRenderTypeList = (renderTypeList: FlowNodeInputTypeEnum[]) => {
  const list = renderTypeList.filter((type) => type !== FlowNodeInputTypeEnum.agentGenerated);
  return list.length > 0 ? list : [FlowNodeInputTypeEnum.input];
};

const buildConfigRenderTypeList = ({
  selectedInputType,
  developerInputType
}: {
  selectedInputType?: FlowNodeInputTypeEnum;
  developerInputType?: FlowNodeInputTypeEnum;
}): FlowNodeInputTypeEnum[] => {
  const fallbackDeveloperType = developerInputType ?? FlowNodeInputTypeEnum.input;

  return selectedInputType === FlowNodeInputTypeEnum.agentGenerated
    ? [FlowNodeInputTypeEnum.agentGenerated, fallbackDeveloperType]
    : [fallbackDeveloperType];
};

const shouldShowConfigInput = (input: FlowNodeTemplateType['inputs'][number]) =>
  input.key === NodeInputKeyEnum.systemInputConfig ||
  (!childAppSystemKey.includes(input.key) &&
    !input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) &&
    !input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
    input.renderTypeList[0] !== FlowNodeInputTypeEnum.hidden);

const ConfigValueInput = ({
  input,
  control,
  isOpenSecretModal,
  setTrueSecretModal,
  setFalseSecretModal,
  configTool
}: {
  input: FlowNodeTemplateType['inputs'][number];
  control: Control<Record<string, any>>;
  isOpenSecretModal: boolean;
  setTrueSecretModal: () => void;
  setFalseSecretModal: () => void;
  configTool: FlowNodeTemplateType;
}) => {
  const { t } = useSafeTranslation();
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
    return (
      <Box fontSize={'sm'} color={'myGray.500'}>
        {t('app:tool_input_agent_generated_tip')}
      </Box>
    );
  }

  if (input.key === NodeInputKeyEnum.systemInputConfig && input.inputList) {
    return (
      <Controller
        control={control}
        name={input.key}
        rules={{
          required: true
        }}
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Box>
            <FormLabel mb={1} required>
              {t('common:secret_key')}
            </FormLabel>
            <Button
              variant={'whiteBase'}
              border={'base'}
              borderRadius={'md'}
              borderColor={error ? 'red.500' : 'borderColor.low'}
              leftIcon={<Box w={'6px'} h={'6px'} bg={'primary.600'} borderRadius={'md'} />}
              onClick={setTrueSecretModal}
            >
              {(() => {
                const val = value as ToolParamsFormType;
                if (!val) {
                  return t('workflow:tool_active_config');
                }

                return t('workflow:tool_active_config_type', {
                  type: t(SystemToolSecretInputTypeMap[val.type]?.text as any)
                });
              })()}
            </Button>

            {isOpenSecretModal && (
              <SecretInputModal
                isFolder={configTool?.isFolder}
                inputConfig={{
                  ...input,
                  value: value as ToolParamsFormType
                }}
                hasSystemSecret={configTool?.hasSystemSecret}
                secretCost={configTool?.systemKeyCost}
                courseUrl={configTool?.courseUrl}
                readmeUrl={configTool?.readmeUrl}
                parentId={configTool?.pluginId}
                onClose={setFalseSecretModal}
                onSubmit={(data) => {
                  onChange(data);
                  setFalseSecretModal();
                }}
              />
            )}
          </Box>
        )}
      />
    );
  }

  return (
    <Controller
      control={control}
      name={input.key}
      rules={{
        validate: (value) => {
          if (
            input.valueType === WorkflowIOValueTypeEnum.boolean ||
            input.valueType === WorkflowIOValueTypeEnum.number
          ) {
            return true;
          }
          if (!input.required) return true;

          return !!value;
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

const ConfigToolModal = ({
  configTool,
  onCloseConfigTool,
  onAddTool
}: {
  configTool: FlowNodeTemplateType;
  onCloseConfigTool: () => void;
  onAddTool: (tool: FlowNodeTemplateType) => void;
}) => {
  const { t } = useSafeTranslation();
  const [isOpenSecretModal, { setTrue: setTrueSecretModal, setFalse: setFalseSecretModal }] =
    useBoolean(false);

  const { handleSubmit, control } = useForm({
    defaultValues: configTool
      ? configTool.inputs.reduce(
          (acc, input) => {
            const developerInputType = getDeveloperRenderTypeList(input.renderTypeList)[0];
            acc[input.key] = input.value ?? input.defaultValue;
            acc[inputTypeFormKey(input.key)] = isAgentGeneratedToolInput(input)
              ? FlowNodeInputTypeEnum.agentGenerated
              : developerInputType;
            acc[developerInputTypeFormKey(input.key)] = developerInputType;
            return acc;
          },
          {} as Record<string, any>
        )
      : {}
  });

  return (
    <MyModal
      isOpen
      isCentered
      title={t('app:tool_param_config')}
      iconSrc="core/app/toolCall"
      overflow={'auto'}
    >
      <ModalBody>
        <HStack mb={4} spacing={1} fontSize={'sm'}>
          <MyIcon name={'common/info'} color={'primary.600'} w={'1.25rem'} />
          <Box flex={1}>{t('app:tool_input_param_tip')}</Box>
          {!!(configTool?.courseUrl || configTool?.readmeUrl || configTool?.userGuide) && (
            <UseGuideModal
              title={configTool?.name}
              iconSrc={configTool?.avatar}
              text={configTool?.userGuide}
              link={configTool?.courseUrl}
              readmeUrl={configTool?.readmeUrl}
            >
              {({ onClick }) => (
                <Box cursor={'pointer'} color={'primary.500'} onClick={onClick}>
                  {t('app:workflow.Input guide')}
                </Box>
              )}
            </UseGuideModal>
          )}
        </HStack>
        {configTool.inputs.filter(shouldShowConfigInput).map((input) => {
          const canAgentGenerated = canInputBeAgentGenerated(input);
          return (
            <Box key={input.key} _notLast={{ mb: 4 }}>
              <Flex alignItems={'center'} mb={1}>
                {input.required && <Box color={'red.500'}>*</Box>}
                <FormLabel>{t(input.label)}</FormLabel>
                {input.description && <QuestionTip ml={1} label={t(input.description)} />}
              </Flex>

              {canAgentGenerated && (
                <Controller
                  control={control}
                  name={inputTypeFormKey(input.key)}
                  render={({ field: { value, onChange } }) => (
                    <Flex gap={2} mb={2}>
                      <Button
                        size={'sm'}
                        variant={
                          value === FlowNodeInputTypeEnum.agentGenerated ? 'primary' : 'whiteBase'
                        }
                        onClick={() => onChange(FlowNodeInputTypeEnum.agentGenerated)}
                      >
                        {t('common:core.workflow.inputType.agentGenerated')}
                      </Button>
                      <Button
                        size={'sm'}
                        variant={
                          value !== FlowNodeInputTypeEnum.agentGenerated ? 'primary' : 'whiteBase'
                        }
                        onClick={() =>
                          onChange(getDeveloperRenderTypeList(input.renderTypeList)[0])
                        }
                      >
                        {t('app:developer_config')}
                      </Button>
                    </Flex>
                  )}
                />
              )}
              <ConfigValueInput
                input={input}
                control={control}
                isOpenSecretModal={isOpenSecretModal}
                setTrueSecretModal={setTrueSecretModal}
                setFalseSecretModal={setFalseSecretModal}
                configTool={configTool}
              />
            </Box>
          );
        })}
      </ModalBody>
      <ModalFooter gap={3}>
        <Button onClick={onCloseConfigTool} variant={'whiteBase'}>
          {t('common:Cancel')}
        </Button>
        <Button
          variant={'primary'}
          onClick={handleSubmit((data) => {
            onAddTool({
              ...configTool,
              inputs: configTool.inputs.map((input) => {
                if (!shouldShowConfigInput(input)) return input;

                return {
                  ...input,
                  renderTypeList: buildConfigRenderTypeList({
                    selectedInputType: data[inputTypeFormKey(input.key)],
                    developerInputType: data[developerInputTypeFormKey(input.key)]
                  }),
                  value: data[input.key] ?? input.value
                };
              })
            });
            onCloseConfigTool();
          })}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ConfigToolModal);
