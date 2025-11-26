import React, { useCallback, useState } from 'react';
import { Controller, useFieldArray } from 'react-hook-form';
import { Box, Button, Flex, FormControl, FormErrorMessage } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useFileUpload } from '../../ChatBox/hooks/useFileUpload';
import FilePreview from '../../components/FilePreview';
import { type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { type ChatBoxInputFormType } from '../../ChatBox/type';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useDeepCompareEffect } from 'ahooks';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';

const RenderInput = () => {
  const { t } = useTranslation();

  const pluginInputs = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.pluginInputs);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);

  const histories = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  const onStartChat = useContextSelector(PluginRunContext, (v) => v.onStartChat);
  const onNewChat = useContextSelector(PluginRunContext, (v) => v.onNewChat);
  const onSubmit = useContextSelector(PluginRunContext, (v) => v.onSubmit);
  const isChatting = useContextSelector(PluginRunContext, (v) => v.isChatting);
  const fileSelectConfig = useContextSelector(PluginRunContext, (v) => v.fileSelectConfig);
  const instruction = useContextSelector(PluginRunContext, (v) => v.instruction);
  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const { llmModelList } = useSystemStore();

  const { control, handleSubmit, reset } = variablesForm;

  /* ===> Global files(abandon) */
  const fileCtrl = useFieldArray({
    control,
    name: 'files'
  });
  const {
    File,
    onOpenSelectFile,
    fileList,
    onSelectFile,
    uploadFiles,
    selectFileIcon,
    showSelectFile,
    showSelectImg,
    removeFiles,
    hasFileUploading
  } = useFileUpload({
    fileSelectConfig,
    fileCtrl,
    outLinkAuthData,
    appId,
    chatId
  });
  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData]
  });
  /* Global files(abandon) <=== */

  // Get plugin input components
  const formatPluginInputs = useMemoEnhance(() => {
    if (histories.length === 0) return pluginInputs;
    try {
      const historyValue = histories[0]?.value as UserChatItemValueItemType[];
      const inputValueString = historyValue.find((item) => item.type === 'text')?.text?.content;

      if (!inputValueString) return pluginInputs;
      return JSON.parse(inputValueString) as FlowNodeInputItemType[];
    } catch (error) {
      console.error('Failed to parse input value:', error);
      return pluginInputs;
    }
  }, [histories, pluginInputs]);

  const [restartData, setRestartData] = useState<ChatBoxInputFormType>();
  const onClickNewChat = useCallback(
    (e: ChatBoxInputFormType) => {
      setRestartData(e);
      onNewChat?.();
    },
    [onNewChat]
  );

  const onResetDefault = useCallback(() => {
    reset({
      files: [],
      variables: formatPluginInputs.reduce(
        (acc, input) => {
          acc[input.key] = input.defaultValue;
          return acc;
        },
        {} as Record<string, any>
      )
    });
  }, [reset, formatPluginInputs]);

  // Reset input value
  useDeepCompareEffect(() => {
    // Set config default value
    if (histories.length === 0) {
      if (restartData) {
        reset(restartData);
        setRestartData(undefined);
        return;
      }

      onResetDefault();
      return;
    }

    // Set history to default value
    const historyVariables = (() => {
      const historyValue = histories[0]?.value as UserChatItemValueItemType[];
      if (!historyValue) return undefined;

      try {
        const inputValueString = historyValue.find((item) => item.type === 'text')?.text?.content;
        return (
          inputValueString &&
          JSON.parse(inputValueString).reduce(
            (
              acc: Record<string, any>,
              {
                key,
                value
              }: {
                key: string;
                value: any;
              }
            ) => ({ ...acc, [key]: value }),
            {}
          )
        );
      } catch (error) {
        console.error('Failed to parse input value:', error);
        return undefined;
      }
    })();
    // Parse history file
    const historyFileList = (() => {
      const historyValue = histories[0]?.value as UserChatItemValueItemType[];
      return historyValue?.filter((item) => item.type === 'file').map((item) => item.file);
    })();

    reset({
      variables: historyVariables,
      files: historyFileList
    });
  }, [histories, formatPluginInputs]);

  const formFileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);

  const fileUploading = formFileUploading || hasFileUploading;
  const hasHistory = histories.length > 0;
  const isDisabledInput = !!hasHistory;

  return (
    <Box>
      {/* instruction */}
      {instruction && (
        <Box
          border={'1px solid'}
          borderColor={'myGray.250'}
          p={4}
          rounded={'md'}
          fontSize={'sm'}
          color={'myGray.600'}
          mb={4}
        >
          <Markdown source={instruction} />
        </Box>
      )}
      {/* file select(Abandoned) */}
      {(showSelectFile || showSelectImg) && (
        <Box mb={5}>
          <Flex alignItems={'center'}>
            <FormLabel fontSize={'md'} fontWeight={'medium'}>
              {t('chat:file_input')}
            </FormLabel>
            <QuestionTip ml={1} label={t('chat:file_input_tip')} />
            <Box flex={1} />
            {histories.length === 0 && (
              <Button
                leftIcon={<MyIcon name={selectFileIcon as any} w={'16px'} />}
                variant={'whiteBase'}
                isDisabled={isChatting || fileUploading}
                onClick={() => {
                  onOpenSelectFile();
                }}
              >
                {t('chat:select')}
              </Button>
            )}
            <File onSelect={(files) => onSelectFile({ files })} />
          </Flex>
          <FilePreview
            fileList={fileList}
            removeFiles={isDisabledInput ? undefined : removeFiles}
          />
        </Box>
      )}
      {/* Filed */}
      {formatPluginInputs
        .filter((input) => {
          const inputType = input.renderTypeList[0];
          const isOutLink = outLinkAuthData && Object.keys(outLinkAuthData).length > 0;

          if (isOutLink) {
            return (
              inputType !== FlowNodeInputTypeEnum.customVariable &&
              inputType !== FlowNodeInputTypeEnum.hidden
            );
          }

          if (inputType === FlowNodeInputTypeEnum.hidden) {
            return false;
          }

          return true;
        })
        .map((input) => {
          const inputType = input.renderTypeList[0];
          const inputKey = `variables.${input.key}` as const;
          const isOutLink = outLinkAuthData && Object.keys(outLinkAuthData).length > 0;

          return (
            <Box _notLast={{ mb: 4 }} key={inputKey}>
              <Flex alignItems={'center'} mb={1}>
                {input.required && <Box color={'red.500'}>*</Box>}
                <FormLabel>{input.label}</FormLabel>
                {input.description && <QuestionTip ml={1} label={input.description} />}
                {isOutLink && inputType === FlowNodeInputTypeEnum.customVariable && (
                  <Flex
                    color={'primary.600'}
                    bg={'primary.100'}
                    px={2}
                    py={1}
                    gap={1}
                    ml={2}
                    fontSize={'mini'}
                    rounded={'sm'}
                  >
                    <MyIcon name={'common/info'} color={'primary.600'} w={4} />
                    {t('chat:variable_invisable_in_share')}
                  </Flex>
                )}
              </Flex>
              <Controller
                key={inputKey}
                control={control}
                name={inputKey}
                rules={{
                  validate: (value) => {
                    if (isDisabledInput) return true;
                    if (
                      input.renderTypeList.includes(FlowNodeInputTypeEnum.password) &&
                      input.minLength
                    ) {
                      if (!value || typeof value !== 'object' || !value.value) return false;
                      if (value.value.length < input.minLength) {
                        return t('common:min_length', { minLenth: input.minLength });
                      }
                      return true;
                    }
                    if (typeof value === 'number' || typeof value === 'boolean') return true;
                    if (!input.required) return true;

                    if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)) {
                      if (!value || !Array.isArray(value) || value.length === 0) {
                        return t('common:required');
                      }
                      return true;
                    }

                    return !!value;
                  }
                }}
                render={({ field: { onChange, value }, fieldState: { error } }) => {
                  return (
                    <FormControl isInvalid={!!error}>
                      <InputRender
                        {...input}
                        key={inputKey}
                        value={value}
                        onChange={onChange}
                        isDisabled={isDisabledInput}
                        isInvalid={!!error}
                        inputType={nodeInputTypeToInputType(input.renderTypeList)}
                        form={variablesForm}
                        fieldName={inputKey}
                        modelList={llmModelList}
                        isRichText={false}
                        canLocalUpload={input.canLocalUpload ?? true}
                      />
                      {error && <FormErrorMessage>{error.message}</FormErrorMessage>}
                    </FormControl>
                  );
                }}
              />
            </Box>
          );
        })}
      {/* Run Button */}
      {onStartChat && onNewChat && (
        <Flex justifyContent={'end'} mt={8} gap={4}>
          <PopoverConfirm
            content={t('chat:confirm_clear_input_value')}
            onConfirm={onResetDefault}
            Trigger={<Button variant={'whiteBase'}>{t('chat:clear_input_value')}</Button>}
          />

          <Button
            isLoading={isChatting}
            isDisabled={fileUploading}
            onClick={() => {
              handleSubmit((e) => {
                if (hasHistory) {
                  console.log(e);
                  onClickNewChat(e);
                } else {
                  onSubmit(e);
                }
              })();
            }}
          >
            {hasHistory ? t('common:Restart') : t('common:Run')}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default RenderInput;
