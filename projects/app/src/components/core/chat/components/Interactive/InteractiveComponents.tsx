import React, { useEffect } from 'react';
import { Box, Flex, FormControl, FormErrorMessage } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type UserInputInteractive,
  type UserSelectInteractive,
  type UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { getPresignedChatFileGetUrl } from '@/web/common/file/api';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';
import { useTranslation } from 'next-i18next';

const DescriptionBox = React.memo(function DescriptionBox({
  description
}: {
  description?: string;
}) {
  if (!description) return null;
  return (
    <Box mb={4}>
      <Markdown source={description} />
    </Box>
  );
});

export const SelectOptionsComponent = React.memo(function SelectOptionsComponent({
  interactiveParams,
  onSelect
}: {
  interactiveParams: UserSelectInteractive['params'];
  onSelect: (value: string) => void;
}) {
  const { description, userSelectOptions, userSelectedVal } = interactiveParams;

  return (
    <Box maxW={'100%'}>
      <DescriptionBox description={description} />
      <Box w={'250px'}>
        <LeftRadio<string>
          py={3.5}
          gridGap={3}
          align={'center'}
          list={userSelectOptions.map((option: UserSelectOptionItemType) => ({
            title: (
              <Box fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
                {option.value}
              </Box>
            ),
            value: option.value
          }))}
          value={userSelectedVal || ''}
          defaultBg={'white'}
          activeBg={'white'}
          onChange={(val) => onSelect(val)}
          isDisabled={!!userSelectedVal}
        />
      </Box>
    </Box>
  );
});

export const FormInputComponent = React.memo(function FormInputComponent({
  interactiveParams: { description, inputForm, submitted },
  defaultValues = {},
  chatItemDataId,
  SubmitButton
}: {
  interactiveParams: UserInputInteractive['params'];
  defaultValues?: Record<string, any>;
  chatItemDataId?: string;
  SubmitButton: (e: {
    onSubmit: UseFormHandleSubmit<Record<string, any>>;
    isFileUploading: boolean;
  }) => React.JSX.Element;
}) {
  const { t } = useTranslation();
  const savedFormData = React.useMemo(() => {
    const saved = sessionStorage.getItem(`interactiveForm_${chatItemDataId}`);
    if (saved) {
      try {
        const parsedData = JSON.parse(saved);
        inputForm?.forEach((item) => {
          if (
            item.type === 'fileSelect' &&
            Array.isArray(parsedData[item.key]) &&
            parsedData[item.key].length > 0
          ) {
            const files = parsedData[item.key];
            if (files[0]?.url && !files[0]?.id) {
              parsedData[item.key] = files.map((file: any) => ({
                id: file.key || `${Date.now()}-${Math.random()}`,
                type: file.type || 'file',
                name: file.name || 'file',
                url: file.url,
                key: file.key,
                icon: file.type === 'image' ? file.url : 'common/file',
                status: 1
              }));
            }
          }
        });
        return parsedData;
      } catch (e) {}
    }
    return defaultValues;
  }, [chatItemDataId, defaultValues, inputForm]);

  const { handleSubmit, control, watch, reset, setValue } = useForm({
    defaultValues: savedFormData
  });

  const appId = useContextSelector(WorkflowRuntimeContext, (v) => v.appId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  React.useEffect(() => {
    reset(savedFormData);
  }, [savedFormData, reset]);

  // 刷新文件 URL（处理 TTL 过期）
  useEffect(() => {
    if (!submitted || !inputForm) return;

    const refreshFileUrls = async () => {
      for (const item of inputForm) {
        if (item.type === 'fileSelect' && savedFormData[item.key]) {
          const files = savedFormData[item.key];
          if (Array.isArray(files) && files.length > 0 && files[0]?.key) {
            try {
              const refreshedFiles = await Promise.all(
                files.map(async (file: any) => {
                  if (file.key) {
                    try {
                      const newUrl = await getPresignedChatFileGetUrl({
                        key: file.key,
                        appId,
                        outLinkAuthData
                      });
                      return {
                        ...file,
                        url: newUrl,
                        icon: file.type === 'image' ? newUrl : file.icon
                      };
                    } catch (e) {}
                  }
                  return file;
                })
              );
              setValue(item.key, refreshedFiles);
            } catch (e) {}
          }
        }
      }
    };

    refreshFileUrls();
  }, [submitted, inputForm, savedFormData, appId, outLinkAuthData, setValue]);

  const formValues = watch();
  useEffect(() => {
    if (typeof window !== 'undefined' && chatItemDataId && !submitted) {
      sessionStorage.setItem(`interactiveForm_${chatItemDataId}`, JSON.stringify(formValues));
    }
  }, [formValues, chatItemDataId, submitted]);

  const isFileUploading = React.useMemo(() => {
    return inputForm.some((input) => {
      if (input.type === 'fileSelect') {
        const files = formValues[input.key];
        if (Array.isArray(files)) {
          return files.some((file: any) => !file.url && !file.error);
        }
      }
      return false;
    });
  }, [inputForm, formValues]);

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {inputForm.map((input) => {
          const inputType = nodeInputTypeToInputType([input.type]);

          return (
            <Controller
              key={input.key}
              control={control}
              name={input.key}
              rules={{
                required: input.required,
                validate: (value) => {
                  if (input.type === 'password' && input.minLength) {
                    if (!value || typeof value !== 'object' || !value.value) {
                      return false;
                    }
                    if (value.value.length < input.minLength) {
                      return t('common:min_length', { minLenth: input.minLength });
                    }
                  }
                  if (input.type === 'fileSelect' && input.required) {
                    if (!value || !Array.isArray(value) || value.length === 0) {
                      return t('common:required');
                    }
                  }
                  return true;
                }
              }}
              render={({ field: { onChange, value }, fieldState: { error } }) => {
                return (
                  <FormControl isInvalid={!!error}>
                    <Flex alignItems={'center'} mb={1}>
                      {input.required && <Box color={'red.500'}>*</Box>}
                      <FormLabel>{input.label}</FormLabel>
                      {input.description && <QuestionTip ml={1} label={input.description} />}
                    </Flex>
                    <InputRender
                      {...input}
                      inputType={inputType}
                      value={value}
                      onChange={onChange}
                      isDisabled={submitted}
                      isInvalid={!!error}
                      isRichText={false}
                    />
                    {error && <FormErrorMessage>{error.message}</FormErrorMessage>}
                  </FormControl>
                );
              }}
            />
          );
        })}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <SubmitButton onSubmit={handleSubmit} isFileUploading={isFileUploading} />
        </Flex>
      )}
    </Box>
  );
});
