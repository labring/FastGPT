import type { KeyboardEvent } from 'react';
import { Button, FormControl, FormErrorMessage, Input, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { UseFormReturn } from 'react-hook-form';
import { checkPasswordRule } from '@fastgpt/global/common/string/password';

export type PasswordFormType = {
  newPassword: string;
  confirmPassword: string;
};

const invalidInputStyles = {
  borderColor: 'red.500',
  _focus: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  },
  _focusVisible: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  }
};

/** 「新密码 + 确认密码」表单块：强制改密与常规改密共用同一套校验、提示与样式，表单实例和提交流程仍由调用方持有。 */
const PasswordForm = ({
  form,
  submitting,
  onSubmit,
  onKeyDown
}: {
  form: UseFormReturn<PasswordFormType>;
  submitting: boolean;
  onSubmit: () => void;
  /** 透传到表单容器，供调用方拦截 Enter 提交。 */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) => {
  const { t } = useTranslation();
  const {
    register,
    getValues,
    formState: { errors }
  } = form;

  return (
    <VStack align="stretch" spacing={6} mt={6} onKeyDown={onKeyDown}>
      <FormControl isInvalid={!!errors.newPassword}>
        <Input
          size="lg"
          type="password"
          bg="myGray.50"
          _invalid={invalidInputStyles}
          placeholder={t('common:password_new_placeholder')}
          aria-label={t('common:password_new_placeholder')}
          {...register('newPassword', {
            required: t('common:password_new_placeholder'),
            validate: (value) => checkPasswordRule(value) || t('common:password_tip')
          })}
        />
        <Text
          mt={2}
          color={errors.newPassword ? 'red.500' : 'myGray.400'}
          fontSize="mini"
          fontWeight="medium"
          lineHeight={4}
        >
          {t('common:password_tip')}
        </Text>
      </FormControl>
      <FormControl isInvalid={!!errors.confirmPassword}>
        <Input
          size="lg"
          type="password"
          bg="myGray.50"
          _invalid={invalidInputStyles}
          placeholder={t('common:password_confirm_placeholder')}
          aria-label={t('common:password_confirm_placeholder')}
          {...register('confirmPassword', {
            required: t('common:password_confirm_placeholder'),
            validate: (value) =>
              value === getValues('newPassword') || t('common:password_not_match')
          })}
        />
        {errors.confirmPassword?.message && (
          <FormErrorMessage mt={2} fontSize="mini" lineHeight={4}>
            {errors.confirmPassword.message}
          </FormErrorMessage>
        )}
      </FormControl>
      <Button size="lg" w="100%" fontSize="sm" isLoading={submitting} onClick={onSubmit}>
        {t('common:password_confirm_action')}
      </Button>
    </VStack>
  );
};

export default PasswordForm;
