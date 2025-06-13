import React, { useCallback } from 'react';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import { Controller, useForm, type UseFormHandleSubmit } from 'react-hook-form';
import Markdown from '@/components/Markdown';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  type UserInputFormItemType,
  type UserInputInteractive,
  type UserSelectInteractive,
  type UserSelectOptionItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';

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
      <Flex flexDirection={'column'} gap={3} w={'250px'}>
        {userSelectOptions.map((option: UserSelectOptionItemType) => {
          const selected = option.value === userSelectedVal;

          return (
            <Button
              key={option.key}
              variant={'whitePrimary'}
              whiteSpace={'pre-wrap'}
              isDisabled={!!userSelectedVal}
              {...(selected
                ? {
                    _disabled: {
                      cursor: 'default',
                      borderColor: 'primary.300',
                      bg: 'primary.50 !important',
                      color: 'primary.600'
                    }
                  }
                : {})}
              onClick={() => onSelect(option.value)}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>
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

  const { register, setValue, handleSubmit, control } = useForm({
    defaultValues
  });

  const FormItemLabel = useCallback(
    ({
      label,
      required,
      description
    }: {
      label: string;
      required?: boolean;
      description?: string;
    }) => {
      return (
        <Flex mb={1} alignItems={'center'}>
          <FormLabel required={required} mb={0} fontWeight="medium" color="gray.700">
            {label}
          </FormLabel>
          {description && <QuestionTip ml={1} label={description} />}
        </Flex>
      );
    },
    []
  );

  const RenderFormInput = useCallback(
    ({ input }: { input: UserInputFormItemType }) => {
      const { type, label, required, maxLength, min, max, defaultValue, list } = input;

      switch (type) {
        case FlowNodeInputTypeEnum.input:
          return (
            <MyTextarea
              isDisabled={submitted}
              {...register(label, {
                required: required
              })}
              bg={'white'}
              autoHeight
              minH={40}
              maxH={100}
            />
          );
        case FlowNodeInputTypeEnum.textarea:
          return (
            <Textarea
              isDisabled={submitted}
              bg={'white'}
              {...register(label, {
                required: required
              })}
              rows={5}
              maxLength={maxLength || 4000}
            />
          );
        case FlowNodeInputTypeEnum.numberInput:
          return (
            <MyNumberInput
              min={min}
              max={max}
              defaultValue={defaultValue}
              isDisabled={submitted}
              register={register}
              name={label}
              isRequired={required}
              inputFieldProps={{ bg: 'white' }}
            />
          );
        case FlowNodeInputTypeEnum.select:
          return (
            <Controller
              key={label}
              control={control}
              name={label}
              rules={{ required: required }}
              render={({ field: { ref, value } }) => {
                if (!list) return <></>;
                return (
                  <MySelect
                    ref={ref}
                    width={'100%'}
                    list={list}
                    value={value}
                    isDisabled={submitted}
                    onChange={(e) => setValue(label, e)}
                  />
                );
              }}
            />
          );
        case FlowNodeInputTypeEnum.multipleSelect:
          return (
            <Controller
              key={label}
              control={control}
              name={label}
              rules={{ required: required }}
              render={({ field: { ref, value } }) => {
                if (!list) return <></>;
                return (
                  <MultipleSelect<string>
                    width={'100%'}
                    bg={'white'}
                    py={2}
                    list={list}
                    value={value}
                    isDisabled={submitted}
                    onSelect={(e) => setValue(label, e)}
                    isSelectAll={value.length === list.length}
                  />
                );
              }}
            />
          );
        default:
          return null;
      }
    },
    [control, register, setValue, submitted]
  );

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {inputForm.map((input) => (
          <Box key={input.label}>
            <FormItemLabel
              label={input.label}
              required={input.required}
              description={input.description}
            />
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
