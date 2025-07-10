import { Button, Flex, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { childAppSystemKey } from './ToolSelectModal';
import { Controller, useForm } from 'react-hook-form';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import InputRender from '@/components/InputRender';
import { formatInputType } from '@/components/InputRender/utils';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import SecretInputModal, {
  type ToolParamsFormType
} from '@/pageComponents/app/plugin/SecretInputModal';
import { SystemToolInputTypeMap } from '@fastgpt/global/core/app/systemTool/constants';
import { useBoolean } from 'ahooks';

const ConfigToolModal = ({
  configTool,
  onCloseConfigTool,
  onAddTool
}: {
  configTool: AppSimpleEditFormType['selectedTools'][number];
  onCloseConfigTool: () => void;
  onAddTool: (tool: AppSimpleEditFormType['selectedTools'][number]) => void;
}) => {
  const { t } = useTranslation();
  const [isOpenSecretModal, { setTrue: setTrueSecretModal, setFalse: setFalseSecretModal }] =
    useBoolean(false);

  const {
    handleSubmit,
    control,
    formState: { errors }
  } = useForm({
    defaultValues: configTool
      ? configTool.inputs.reduce(
          (acc, input) => {
            acc[input.key] = input.value || input.defaultValue;
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
      title={t('common:core.app.ToolCall.Parameter setting')}
      iconSrc="core/app/toolCall"
      overflow={'auto'}
    >
      <ModalBody>
        <HStack mb={4} spacing={1} fontSize={'sm'}>
          <MyIcon name={'common/info'} color={'primary.600'} w={'1.25rem'} />
          <Box flex={1}>{t('app:tool_input_param_tip')}</Box>
          {!!(configTool?.courseUrl || configTool?.userGuide) && (
            <UseGuideModal
              title={configTool?.name}
              iconSrc={configTool?.avatar}
              text={configTool?.userGuide}
              link={configTool?.courseUrl}
            >
              {({ onClick }) => (
                <Box cursor={'pointer'} color={'primary.500'} onClick={onClick}>
                  {t('app:workflow.Input guide')}
                </Box>
              )}
            </UseGuideModal>
          )}
        </HStack>
        {configTool.inputs
          .filter(
            (input) =>
              !input.toolDescription &&
              !childAppSystemKey.includes(input.key) &&
              !input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) &&
              !input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
          )
          .map((input) => {
            return (
              <Box key={input.key} _notLast={{ mb: 4 }}>
                <Flex alignItems={'center'} mb={1}>
                  {input.required && <Box color={'red.500'}>*</Box>}
                  <FormLabel>{input.label}</FormLabel>
                  {input.description && <QuestionTip ml={1} label={input.description} />}
                </Flex>

                {input.key === NodeInputKeyEnum.systemInputConfig && input.inputList ? (
                  <Controller
                    control={control}
                    name={input.key}
                    render={({ field: { onChange, value } }) => (
                      <Box>
                        <FormLabel mb={1}>{t('common:secret_key')}</FormLabel>
                        <Button
                          variant={'whiteBase'}
                          border={'base'}
                          borderRadius={'md'}
                          leftIcon={
                            <Box w={'6px'} h={'6px'} bg={'primary.600'} borderRadius={'md'} />
                          }
                          onClick={setTrueSecretModal}
                        >
                          {(() => {
                            const val = value as ToolParamsFormType;
                            if (!val) {
                              return t('workflow:tool_active_config');
                            }

                            return t('workflow:tool_active_config_type', {
                              type: t(SystemToolInputTypeMap[val.type]?.text as any)
                            });
                          })()}
                        </Button>

                        {isOpenSecretModal && (
                          <SecretInputModal
                            inputConfig={{
                              ...input,
                              value: value as ToolParamsFormType
                            }}
                            hasSystemSecret={configTool?.hasSystemSecret}
                            secretCost={configTool?.currentCost}
                            courseUrl={configTool?.courseUrl}
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
                ) : (
                  <Controller
                    control={control}
                    name={input.key}
                    rules={{
                      validate: (value) => {
                        if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
                          return value !== undefined;
                        }
                        if (input.required) {
                          return !!value;
                        }
                        return true;
                      }
                    }}
                    render={({ field: { onChange, value } }) => {
                      return (
                        <InputRender
                          {...input}
                          isInvalid={errors && Object.keys(errors).includes(input.key)}
                          inputType={formatInputType({
                            inputType: input.renderTypeList[0],
                            valueType: input.valueType
                          })}
                          value={value}
                          onChange={onChange}
                        />
                      );
                    }}
                  />
                )}
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
              inputs: configTool.inputs.map((input) => ({
                ...input,
                value: data[input.key] ?? input.value
              }))
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
