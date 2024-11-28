import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray } from 'react-hook-form';
import RenderPluginInput from './renderPluginInput';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import Markdown from '@/components/Markdown';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useFileUpload } from '../../ChatBox/hooks/useFileUpload';
import FilePreview from '../../components/FilePreview';
import { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { ChatBoxInputFormType } from '../../ChatBox/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';

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
  const appId = useContextSelector(PluginRunContext, (v) => v.appId);
  const chatId = useContextSelector(PluginRunContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(PluginRunContext, (v) => v.outLinkAuthData);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors }
  } = variablesForm;

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
  const isDisabledInput = histories.length > 0;

  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData]
  });
  /* Global files(abandon) <=== */

  const [restartData, setRestartData] = useState<ChatBoxInputFormType>();
  const onClickNewChat = useCallback(
    (e: ChatBoxInputFormType) => {
      setRestartData(e);
      onNewChat?.();
    },
    [onNewChat, setRestartData]
  );

  // Get plugin input components
  const formatPluginInputs = useMemo(() => {
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

  // Reset input value
  useEffect(() => {
    // Set config default value
    if (histories.length === 0) {
      if (restartData) {
        reset(restartData);
        setRestartData(undefined);
        return;
      }

      const defaultFormValues = formatPluginInputs.reduce(
        (acc, input) => {
          acc[input.key] = input.defaultValue;
          return acc;
        },
        {} as Record<string, any>
      );

      reset({
        files: [],
        variables: defaultFormValues
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histories]);

  const [uploading, setUploading] = useState(false);

  const fileUploading = uploading || hasFileUploading;

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
      {formatPluginInputs.map((input) => {
        return (
          <Controller
            key={`variables.${input.key}`}
            control={control}
            name={`variables.${input.key}`}
            rules={{
              validate: (value) => {
                if (!input.required) return true;
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
                  onChange={onChange}
                  isDisabled={isDisabledInput}
                  isInvalid={errors && Object.keys(errors).includes(input.key)}
                  input={input}
                  setUploading={setUploading}
                />
              );
            }}
          />
        );
      })}
      {/* Run Button */}
      {onStartChat && onNewChat && (
        <Flex justifyContent={'end'} mt={8}>
          <Button
            isLoading={isChatting}
            isDisabled={fileUploading}
            onClick={() => {
              handleSubmit((e) => {
                if (isDisabledInput) {
                  onClickNewChat(e);
                } else {
                  onSubmit(e);
                }
              })();
            }}
          >
            {isDisabledInput ? t('common:common.Restart') : t('common:common.Run')}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default RenderInput;
