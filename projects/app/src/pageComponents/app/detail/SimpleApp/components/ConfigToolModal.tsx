import { Button, HStack, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import React from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { childAppSystemKey } from './ToolSelectModal';
import { Controller, useForm } from 'react-hook-form';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import RenderPluginInput from '@/components/core/chat/ChatContainer/PluginRunBox/components/renderPluginInput';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';

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
          <MyIcon name={'common/info'} w={'1.25rem'} />
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
              <Controller
                key={input.key}
                control={control}
                name={input.key}
                rules={{
                  validate: (value) => {
                    if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
                      return value !== undefined;
                    }
                    return !!value;
                  }
                }}
                render={({ field: { onChange, value } }) => {
                  return (
                    <RenderPluginInput
                      value={value}
                      isInvalid={errors && Object.keys(errors).includes(input.key)}
                      onChange={onChange}
                      input={input}
                      setUploading={() => {}}
                    />
                  );
                }}
              />
            );
          })}
      </ModalBody>
      <ModalFooter gap={6}>
        <Button onClick={onCloseConfigTool} variant={'whiteBase'}>
          {t('common:common.Cancel')}
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
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ConfigToolModal);
