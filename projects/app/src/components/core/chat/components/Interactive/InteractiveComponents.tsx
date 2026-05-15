import React from 'react';
import { Box, Flex, FormControl, FormErrorMessage } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type {
  UserInputInteractive,
  UserSelectInteractive,
  UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '@/components/core/chat/ChatContainer/context/workflowRuntimeContext';

type FormFileValue = {
  key?: unknown;
  url?: unknown;
  error?: unknown;
};

const isPendingFileValue = (file: unknown) => {
  if (!file || typeof file !== 'object') return false;

  const { key, url, error } = file as FormFileValue;
  return !key && !url && !error;
};

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
  SubmitButton
}: {
  interactiveParams: UserInputInteractive['params'];
  defaultValues?: Record<string, any>;
  SubmitButton: (e: {
    onSubmit: UseFormHandleSubmit<Record<string, any>>;
    isFileUploading: boolean;
  }) => React.JSX.Element;
}) {
  const { t } = useTranslation();

  const { handleSubmit, control, watch, reset } = useForm({
    defaultValues
  });

  const runtimeFileUploading = useContextSelector(WorkflowRuntimeContext, (v) => v.fileUploading);
  const formValues = watch();

  React.useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const isFileUploading = React.useMemo(() => {
    if (runtimeFileUploading) return true;

    return inputForm.some((input) => {
      if (input.type === 'fileSelect') {
        const files = formValues[input.key];
        if (Array.isArray(files)) {
          return files.some(isPendingFileValue);
        }
      }
      return false;
    });
  }, [inputForm, formValues, runtimeFileUploading]);

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
                      return t('common:required');
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
                    {error && error.message && <FormErrorMessage>{error.message}</FormErrorMessage>}
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
