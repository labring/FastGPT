import type { BoxProps } from '@chakra-ui/react';
import { Box, Flex, FormControl, FormErrorMessage } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import InputRender from '.';
import type { SpecificProps } from './type';
import { InputTypeEnum } from './constant';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

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

  isDisabled?: boolean;
  minLength?: number;
} & SpecificProps &
  BoxProps) => {
  const { t } = useSafeTranslation();
  const { control } = props.form;

  return (
    <Box _notLast={{ mb: 4 }}>
      <Flex alignItems={'center'} mb={1}>
        {typeof label === 'string' ? <FormLabel required={required}>{t(label)}</FormLabel> : label}
        {placeholder && <QuestionTip ml={1} label={placeholder} />}
      </Flex>

      <Controller
        control={control}
        name={props.fieldName}
        rules={{
          validate: (value) => {
            if (typeof value === 'number' || typeof value === 'boolean') return true;
            if (inputType === InputTypeEnum.password && props.minLength) {
              if (!value || typeof value !== 'object' || !value.value) return false;
              if (value.value.length < props.minLength) {
                return t(`common:min_length`, { minLenth: props.minLength });
              }
              return true;
            }
            if (!required) return true;

            if (inputType === InputTypeEnum.fileSelect) {
              if (!value || !Array.isArray(value) || value.length === 0) {
                return t('common:required');
              }
              return true;
            }

            return !!value;
          },
          ...(!!props?.minLength
            ? {
                minLength: {
                  value: props.minLength,
                  message: t(`common:min_length`, { minLenth: props.minLength })
                }
              }
            : {})
        }}
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          return (
            <FormControl isInvalid={!!error}>
              <InputRender
                inputType={inputType}
                isRichText={false}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                isInvalid={!!error}
                {...props}
              />
              {error && <FormErrorMessage>{error.message}</FormErrorMessage>}
            </FormControl>
          );
        }}
      />
    </Box>
  );
};

export default LabelAndFormRender;
