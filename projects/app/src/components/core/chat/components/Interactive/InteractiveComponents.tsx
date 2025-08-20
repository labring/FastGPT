import React, { useCallback } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import {
  type UserInputFormItemType,
  type UserInputInteractive,
  type UserSelectInteractive,
  type UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import InputRender from '@/components/core/app/formRender';
import { nodeInputTypeToInputType } from '@/components/core/app/formRender/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';

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
          fontSize={'sm'}
          // px={4}
          py={3.5}
          sx={{
            '&': { gridGap: '12px' },
            '& > * > div:first-of-type': {
              alignItems: 'flex-start'
            },
            '& > * > div:first-of-type > div:first-of-type': {
              marginTop: '0.1em'
            }
          }}
          list={userSelectOptions.map((option: UserSelectOptionItemType) => ({
            title: (
              <Box
                fontSize={'inherit'}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-word'}
                sx={{ overflowWrap: 'anywhere' }}
              >
                {option.value}
              </Box>
            ),
            value: option.value
          }))}
          value={(userSelectedVal as any) ?? ('' as any)}
          defaultBg={'white'}
          activeBg={'white'}
          onChange={(val) => {
            if (userSelectedVal) return;
            onSelect(val);
          }}
        />
      </Box>
    </Box>
  );
});

export const FormInputComponent = React.memo(function FormInputComponent({
  interactiveParams,
  defaultValues = {},
  SubmitButton
}: {
  interactiveParams: UserInputInteractive['params'];
  defaultValues?: Record<string, any>;
  SubmitButton: (e: { onSubmit: UseFormHandleSubmit<Record<string, any>> }) => React.JSX.Element;
}) {
  const { description, inputForm, submitted } = interactiveParams;

  const { handleSubmit, control } = useForm({
    defaultValues
  });

  const RenderFormInput = useCallback(
    ({ input }: { input: UserInputFormItemType }) => {
      return (
        <Controller
          key={input.label}
          control={control}
          name={input.label}
          rules={{ required: input.required }}
          render={({ field: { onChange, value }, fieldState: { error } }) => {
            const inputType = nodeInputTypeToInputType([input.type]);

            return (
              <InputRender
                inputType={inputType}
                value={value}
                onChange={onChange}
                placeholder={input.description}
                isDisabled={submitted}
                isInvalid={!!error}
                maxLength={input.maxLength}
                min={input.min}
                max={input.max}
                list={input.list}
              />
            );
          }}
        />
      );
    },
    [control, submitted]
  );

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {inputForm.map((input) => (
          <Box key={input.label}>
            <Flex alignItems={'center'} mb={1}>
              {input.required && <Box color={'red.500'}>*</Box>}
              <FormLabel>{input.label}</FormLabel>
              {input.description && <QuestionTip ml={1} label={input.description} />}
            </Flex>
            <RenderFormInput input={input} />
          </Box>
        ))}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <SubmitButton onSubmit={handleSubmit} />
        </Flex>
      )}
    </Box>
  );
});
