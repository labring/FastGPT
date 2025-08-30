import type { BoxProps } from '@chakra-ui/react';
import { Box, Flex } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import InputRender from '.';
import type { SpecificProps } from './type';
import { InputTypeEnum } from './constant';

// Helper function to flatten error object keys
const getFlattenedErrorKeys = (errors: any, prefix = ''): string[] => {
  const keys: string[] = [];

  if (!errors || typeof errors !== 'object') return keys;

  Object.keys(errors).forEach((key) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);

    // If the error value is an object (nested errors), recursively flatten
    if (errors[key] && typeof errors[key] === 'object' && !errors[key].message) {
      keys.push(...getFlattenedErrorKeys(errors[key], fullKey));
    }
  });

  return keys;
};

const LabelAndFormRender = ({
  label,
  required,
  placeholder,
  inputType,
  showValueType,
  ...props
}: {
  label: string | React.ReactNode;
  required?: boolean;
  placeholder?: string;
  showValueType?: boolean;
  form: UseFormReturn<any>;
  fieldName: string;
} & SpecificProps &
  BoxProps) => {
  const { control } = props.form;

  const minLength = inputType === InputTypeEnum.password ? (props as any).minLength : undefined;

  return (
    <Box _notLast={{ mb: 4 }}>
      <Flex alignItems={'center'} mb={1}>
        {typeof label === 'string' ? <FormLabel required={required}>{label}</FormLabel> : label}
        {placeholder && <QuestionTip ml={1} label={placeholder} />}
      </Flex>

      <Controller
        control={control}
        name={props.fieldName}
        rules={{
          required,
          ...(minLength && {
            minLength: {
              value: minLength
            }
          })
        }}
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          return (
            <InputRender
              inputType={inputType}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              isInvalid={!!error}
              {...props}
            />
          );
        }}
      />
    </Box>
  );
};

export default LabelAndFormRender;
