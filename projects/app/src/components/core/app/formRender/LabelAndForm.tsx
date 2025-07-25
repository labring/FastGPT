import type { BoxProps } from '@chakra-ui/react';
import { Box, Flex } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import InputRender from '.';
import type { SpecificProps } from './type';

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
  formKey,
  label,
  required,
  placeholder,
  inputType,
  variablesForm,
  showValueType,
  ...props
}: {
  formKey: string;
  label: string | React.ReactNode;
  required?: boolean;
  placeholder?: string;
  variablesForm: UseFormReturn<any>;
  showValueType?: boolean;
} & SpecificProps &
  BoxProps) => {
  const { control } = variablesForm;

  return (
    <Box _notLast={{ mb: 4 }}>
      <Flex alignItems={'center'} mb={1}>
        {typeof label === 'string' ? <FormLabel required={required}>{label}</FormLabel> : label}
        {placeholder && <QuestionTip ml={1} label={placeholder} />}
      </Flex>

      <Controller
        control={control}
        name={formKey}
        rules={{
          required
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
