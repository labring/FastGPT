import type { BoxProps } from '@chakra-ui/react';
import { Box, Flex } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import React, { useMemo } from 'react';
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
  ...props
}: {
  formKey: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  variablesForm: UseFormReturn<any>;
} & SpecificProps &
  BoxProps) => {
  const {
    control,
    formState: { errors }
  } = variablesForm;

  // Extract all ref.name values from errors for validation checking
  const flattenedErrorKeys = useMemo(() => {
    const keys: Record<string, boolean> = {};

    // Helper function to extract ref.name from nested error structure
    const extractRefNames = (errorObj: any): void => {
      if (!errorObj || typeof errorObj !== 'object') return;

      Object.values(errorObj).forEach((error: any) => {
        if (error?.ref?.name) {
          keys[error.ref.name] = true;
        }
        // Recursively check nested objects
        if (error && typeof error === 'object' && !error.ref) {
          extractRefNames(error);
        }
      });
    };

    extractRefNames(errors);
    return keys;
  }, [errors]);

  return (
    <Box _notLast={{ mb: 4 }} px={1}>
      <Flex alignItems={'center'} mb={1}>
        <FormLabel required={required}>{label}</FormLabel>
        {placeholder && <QuestionTip ml={1} label={placeholder} />}
      </Flex>

      <Controller
        key={formKey}
        control={control}
        name={formKey}
        rules={{
          required
        }}
        render={({ field: { onChange, value } }) => {
          return (
            <InputRender
              inputType={inputType}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              isInvalid={flattenedErrorKeys[formKey]}
              {...props}
            />
          );
        }}
      />
    </Box>
  );
};

export default LabelAndFormRender;
