import React, { useCallback, useEffect, useMemo } from 'react';
import { Controller } from 'react-hook-form';
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
import { ChatBoxInputFormType, UserInputFileItemType } from '../../ChatBox/type';

const RenderInput = () => {
  const { t } = useTranslation();

  const {
    pluginInputs,
    variablesForm,
    histories,
    onStartChat,
    onNewChat,
    onSubmit,
    isChatting,
    chatConfig,
    chatId,
    outLinkAuthData,
    restartInputStore,
    setRestartInputStore
  } = useContextSelector(PluginRunContext, (v) => v);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { errors }
  } = variablesForm;

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
    replaceFiles
  } = useFileUpload({
    outLinkAuthData,
    chatId: chatId || '',
    fileSelectConfig: chatConfig?.fileSelectConfig,
    control
  });
  const isDisabledInput = histories.length > 0;

  const onClickNewChat = useCallback(
    (e: ChatBoxInputFormType, files: UserInputFileItemType[] = []) => {
      setRestartInputStore({
        ...e,
        files
      });
      onNewChat?.();
    },
    [onNewChat, setRestartInputStore]
  );

  useEffect(() => {
    // Set last run value
    if (!isDisabledInput && restartInputStore) {
      reset(restartInputStore);
      return;
    }

    // Set history to default value

    const defaultFormValues = pluginInputs.reduce(
      (acc, input) => {
        acc[input.key] = input.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    );

    const historyFormValues = (() => {
      if (!isDisabledInput) return undefined;
      const historyValue = histories[0].value;
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
      if (!isDisabledInput) return [];
      const historyValue = histories[0].value as UserChatItemValueItemType[];
      return historyValue.filter((item) => item.type === 'file').map((item) => item.file);
    })();

    reset({
      ...(historyFormValues || defaultFormValues),
      files: historyFileList
    });
  }, [getValues, histories, isDisabledInput, pluginInputs, replaceFiles, reset, restartInputStore]);

  const hasFileUploading = useMemo(() => {
    return fileList.some((item) => !item.url);
  }, [fileList]);

  useRequest2(uploadFiles, {
    manual: false,
    errorToast: t('common:upload_file_error'),
    refreshDeps: [fileList, outLinkAuthData, chatId]
  });

  return (
    <>
      {/* instruction */}
      {chatConfig?.instruction && (
        <Box
          border={'1px solid'}
          borderColor={'myGray.250'}
          p={4}
          rounded={'md'}
          fontSize={'sm'}
          color={'myGray.600'}
          mb={4}
        >
          <Markdown source={chatConfig.instruction} />
        </Box>
      )}
      {/* file select */}
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
            <File onSelect={(files) => onSelectFile({ files, fileList })} />
          </Flex>
          <FilePreview
            fileList={fileList}
            removeFiles={isDisabledInput ? undefined : removeFiles}
          />
        </Box>
      )}
      {/* Filed */}
      {pluginInputs.map((input) => {
        return (
          <Controller
            key={input.key}
            control={control}
            name={input.key}
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
            isLoading={isChatting || hasFileUploading}
            onClick={() => {
              handleSubmit((e) => {
                if (isDisabledInput) {
                  onClickNewChat(e, fileList);
                } else {
                  onSubmit(e, fileList);
                }
              })();
            }}
          >
            {isDisabledInput ? t('common:common.Restart') : t('common:common.Run')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export default RenderInput;
