import React, { useCallback } from 'react';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  Controller,
  useForm,
  type UseFormProps,
  type UseFormReturn,
  type FieldValues
} from 'react-hook-form';
import Markdown from '@/components/Markdown';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import MyIcon from '@fastgpt/web/components/common/Icon';
type IconNameType = 'core/workflow/debugNext' | 'common/loading' | 'core/chat/think';
export type SelectOptionType = {
  key: string;
  value: string;
};
export type SelectOptionsComponentPropsType = {
  options: SelectOptionType[];
  description?: string;
  selectedValue?: string;
  onSelectOption: (value: string) => void;
  isDisabled?: boolean;
  variant?: string;
};
const DescriptionBox = React.memo(function DescriptionBox({
  description
}: {
  description?: string;
}) {
  if (!description) return null;
  return (
    <Box
      mb={4}
      p={4}
      border="1px solid"
      borderColor="blue.200"
      bg="blue.50"
      borderRadius="md"
      boxShadow="sm"
      textAlign="center"
    >
      <Markdown source={description} />
    </Box>
  );
});
const inputBaseStyle = {
  bg: 'white',
  borderWidth: '1px',
  borderColor: 'gray.300',
  _hover: { borderColor: 'gray.400' },
  _focus: {
    borderColor: 'primary.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-primary-500)'
  },
  borderRadius: 'md'
};
export const SelectOptionsComponent = React.memo(function SelectOptionsComponent({
  options = [],
  description,
  selectedValue,
  onSelectOption,
  isDisabled = false,
  variant = 'outline'
}: SelectOptionsComponentPropsType) {
  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3} maxW={'400px'} mx="auto">
        {options.map((option: SelectOptionType) => {
          const selected = option.value === selectedValue;

          return (
            <Button
              key={option.key}
              variant={variant}
              height="auto"
              py={3}
              px={4}
              fontWeight="medium"
              borderWidth="1.5px"
              whiteSpace={'pre-wrap'}
              _hover={{
                bg: 'primary.50',
                borderColor: 'primary.300'
              }}
              isDisabled={isDisabled}
              {...(selected
                ? {
                    borderColor: 'primary.500',
                    bg: 'primary.50',
                    color: 'primary.700',
                    _disabled: {
                      cursor: 'default',
                      borderColor: 'primary.500',
                      bg: 'primary.50 !important',
                      color: 'primary.700',
                      opacity: 1
                    }
                  }
                : {})}
              onClick={() => onSelectOption(option.value)}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>
    </Box>
  );
});
export type FormItemType = {
  label: string;
  key?: string;
  type: FlowNodeInputTypeEnum;
  required?: boolean;
  description?: string;
  defaultValue?: any;
  value?: any;
  maxLength?: number;
  min?: number;
  max?: number;
  list?: Array<{
    label: string;
    value: string;
  }>;
};
export type FormInputComponentProps = {
  inputForm: FormItemType[];
  description?: string;
  onSubmit?: (data: Record<string, any>) => void;
  isDisabled?: boolean;
  defaultValues?: Record<string, any>;
  submitButtonText?: 'common:Submit' | string;
  showSubmitButton?: boolean;
  submitButtonIcon?: IconNameType;
  isCompact?: boolean;
};
const FormItemLabel = React.memo(function FormItemLabel({
  label,
  required,
  description
}: {
  label: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <Flex mb={2} alignItems={'center'}>
      <FormLabel required={required} mb={0} fontWeight="medium" color="gray.700">
        {label}
      </FormLabel>
      {description && <QuestionTip ml={1} label={description} />}
    </Flex>
  );
});
const renderFormInput = (
  input: FormItemType,
  register: any,
  control: any,
  setValue: any,
  isDisabled: boolean
) => {
  const { type, label, required, maxLength, min, max, defaultValue, list } = input;
  switch (type) {
    case FlowNodeInputTypeEnum.input:
      return (
        <MyTextarea
          isDisabled={isDisabled}
          {...register(label, { required })}
          {...inputBaseStyle}
          autoHeight
          minH={40}
          maxH={100}
          p={3}
        />
      );
    case FlowNodeInputTypeEnum.textarea:
      return (
        <Textarea
          isDisabled={isDisabled}
          {...register(label, { required })}
          {...inputBaseStyle}
          rows={5}
          maxLength={maxLength || 4000}
          p={3}
        />
      );
    case FlowNodeInputTypeEnum.numberInput:
      return (
        <Box position="relative">
          <MyNumberInput
            min={min}
            max={max}
            defaultValue={defaultValue}
            isDisabled={isDisabled}
            {...inputBaseStyle}
            register={register}
            name={label}
            isRequired={required}
            sx={{
              '& input': {
                width: '100%',
                height: '40px',
                px: 3,
                borderRadius: 'md',
                border: 'none',
                _focus: { outline: 'none' }
              },
              '& button': {
                border: 'none',
                bg: 'transparent',
                color: 'gray.500'
              }
            }}
          />
        </Box>
      );
    case FlowNodeInputTypeEnum.select:
      return (
        <Controller
          key={label}
          control={control}
          name={label}
          rules={{ required }}
          render={({ field: { ref, value } }) => {
            if (!list) return <></>;
            return (
              <MySelect
                ref={ref}
                width={'100%'}
                variant="outline"
                borderColor="gray.300"
                borderRadius="md"
                height="40px"
                bg="white"
                _hover={{ borderColor: 'gray.400' }}
                list={list}
                value={value}
                isDisabled={isDisabled}
                onChange={(e) => setValue(label, e)}
              />
            );
          }}
        />
      );
    default:
      return null;
  }
};
export const FormInputComponent = React.memo(function FormInputComponent({
  inputForm = [],
  description,
  onSubmit,
  isDisabled = false,
  defaultValues = {},
  submitButtonText = 'common:Submit',
  showSubmitButton = true,
  submitButtonIcon,
  isCompact = false
}: FormInputComponentProps) {
  const { t } = useTranslation();
  const { register, setValue, handleSubmit, control, reset, getValues } = useForm({
    defaultValues
  });
  const handleFormSubmit = useCallback(
    (data: Record<string, any>) => {
      if (onSubmit) {
        onSubmit(data);
      }
    },
    [onSubmit]
  );
  return (
    <Box>
      <DescriptionBox description={description} />
      <Box
        as="form"
        onSubmit={handleSubmit(handleFormSubmit)}
        maxW={isCompact ? 'auto' : '560px'}
        mx="auto"
        p={isCompact ? 0 : 4}
        borderRadius="md"
      >
        <Flex flexDirection={'column'} gap={5} w={'100%'}>
          {inputForm.map((input: FormItemType) => (
            <Box key={input.label} mb={2}>
              <FormItemLabel
                label={input.label}
                required={input.required}
                description={input.description}
              />
              {renderFormInput(input, register, control, setValue, isDisabled)}
            </Box>
          ))}

          {showSubmitButton && (
            <Flex w={'full'} justifyContent={'flex-end'} mt={3} gap={2}>
              <Button
                type="submit"
                size="sm"
                leftIcon={
                  submitButtonIcon ? <MyIcon name={submitButtonIcon} w={'16px'} /> : undefined
                }
                colorScheme="blue"
                variant="solid"
              >
                {t(submitButtonText as any)}
              </Button>
            </Flex>
          )}
        </Flex>
      </Box>
    </Box>
  );
});
export type UseFormHandlerReturnType<T extends FieldValues = Record<string, any>> = {
  register: UseFormReturn<T>['register'];
  setValue: UseFormReturn<T>['setValue'];
  handleSubmit: UseFormReturn<T>['handleSubmit'];
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  control: UseFormReturn<T>['control'];
  reset: UseFormReturn<T>['reset'];
  getValues: UseFormReturn<T>['getValues'];
};
export const useFormHandler = <T extends FieldValues = Record<string, any>>(
  formConfig: UseFormProps<T> = {},
  onSubmitCallback?: (data: T) => void
): UseFormHandlerReturnType<T> => {
  const methods = useForm<T>(formConfig);
  const { handleSubmit } = methods;
  const onSubmit = useCallback(
    (data: T) => {
      if (onSubmitCallback) {
        onSubmitCallback(data);
      }
    },
    [onSubmitCallback]
  );
  return {
    ...methods,
    onSubmit: handleSubmit(onSubmit)
  };
};
