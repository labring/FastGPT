import React, { useEffect, useMemo } from 'react';
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
    outLinkAuthData
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
    selectFileLabel,
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

  const defaultFormValues = useMemo(() => {
    return pluginInputs.reduce(
      (acc, input) => {
        acc[input.key] = input.defaultValue;
        return acc;
      },
      {} as Record<string, any>
    );
  }, [pluginInputs]);

  const historyFormValues = useMemo(() => {
    if (histories.length === 0) return undefined;
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
  }, [histories]);

  const historyFileList = useMemo(() => {
    if (histories.length === 0) return [];
    const historyValue = histories[0].value as UserChatItemValueItemType[];
    return historyValue.filter((item) => item.type === 'file').map((item) => item.file);
  }, [histories]);
  console.log('historyFileList', historyFileList);

  useEffect(() => {
    reset(historyFormValues || defaultFormValues);
    replaceFiles(historyFileList as any);
  }, [defaultFormValues, getValues, historyFormValues, reset]);

  const isDisabledInput = histories.length > 0;

  useRequest2(
    async () => {
      uploadFiles();
    },
    {
      manual: false,
      errorToast: t('common:upload_file_error'),
      refreshDeps: [fileList, outLinkAuthData, chatId]
    }
  );

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
        <Box>
          <Flex alignItems={'center'}>
            {histories.length === 0 && (
              <>
                <FormLabel fontSize={'14px'} fontWeight={'medium'}>
                  {selectFileLabel}
                </FormLabel>
                <Box flex={1} />
                <Button
                  leftIcon={<MyIcon name={selectFileIcon as any} w={'16px'} />}
                  variant={'whiteBase'}
                  onClick={() => {
                    onOpenSelectFile();
                  }}
                >
                  {t('chat:upload')}
                </Button>
              </>
            )}
            <File onSelect={(files) => onSelectFile({ files, fileList })} />
          </Flex>
        </Box>
      )}
      <FilePreview
        fileList={fileList}
        removeFiles={histories.length > 0 ? undefined : removeFiles}
      />
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
      {onStartChat && onNewChat && (
        <Flex justifyContent={'end'} mt={8}>
          <Button
            isLoading={isChatting}
            onClick={() => {
              if (histories.length > 0) {
                return onNewChat();
              }
              handleSubmit(onSubmit)();
              replaceFiles && replaceFiles([]);
            }}
          >
            {histories.length > 0 ? t('common:common.Restart') : t('common:common.Run')}
          </Button>
        </Flex>
      )}
    </>
  );
};

export default RenderInput;
