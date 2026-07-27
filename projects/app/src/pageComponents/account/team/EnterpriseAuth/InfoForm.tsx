import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, Input, Text, Textarea } from '@chakra-ui/react';
import {
  get,
  type FieldPath,
  type RegisterOptions,
  type UseFormReturn,
  useController,
  useFormState,
  useWatch
} from 'react-hook-form';
import type { TFunction } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import type { StartEnterpriseAuthBodyType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import {
  isBankAccount,
  isUnifiedCreditCode
} from '@fastgpt/global/support/user/team/enterpriseAuth/utils';
import {
  Field,
  Section,
  fieldRules,
  formErrorTextStyles,
  invalidInputStyles,
  inputStyles,
  normalizeBankAccount,
  normalizeUnifiedCreditCode,
  textareaStyles,
  type EnterpriseAuthBankOption
} from './shared';

type EnterpriseAuthInfoFormProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  bankOptions: EnterpriseAuthBankOption[];
  hasSubmittedStartForm: boolean;
  hasBankLoadError: boolean;
  isBankLoading: boolean;
  reloadBanks: () => void;
};

type EnterpriseAuthFieldName = FieldPath<StartEnterpriseAuthBodyType>;

type EnterpriseAuthFieldOptions<TFieldName extends EnterpriseAuthFieldName> = {
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  name: TFieldName;
  rules: RegisterOptions<StartEnterpriseAuthBodyType, TFieldName>;
};

/**
 * 为单个字段订阅值和校验状态，避免其他字段变化时触发表单布局组件重渲染。
 */
const useEnterpriseAuthField = <TFieldName extends EnterpriseAuthFieldName>({
  startForm,
  name,
  rules
}: EnterpriseAuthFieldOptions<TFieldName>) => {
  const value = useWatch<StartEnterpriseAuthBodyType, TFieldName>({
    control: startForm.control,
    name
  });
  const { errors, isSubmitted } = useFormState<StartEnterpriseAuthBodyType>({
    control: startForm.control,
    name
  });
  const fieldRegister = useMemo(() => startForm.register(name, rules), [name, rules, startForm]);

  return {
    value: String(value ?? ''),
    error: get(errors, name),
    isSubmitted,
    fieldRegister
  };
};

type EnterpriseAuthInputFieldProps<TFieldName extends EnterpriseAuthFieldName> =
  EnterpriseAuthFieldOptions<TFieldName> & {
    label: string;
    placeholder: string;
    hasSubmittedStartForm: boolean;
    colSpan?: number;
  };

const EnterpriseAuthInputField = <TFieldName extends EnterpriseAuthFieldName>({
  startForm,
  name,
  rules,
  label,
  placeholder,
  hasSubmittedStartForm,
  colSpan
}: EnterpriseAuthInputFieldProps<TFieldName>) => {
  const { value, error, fieldRegister } = useEnterpriseAuthField({
    startForm,
    name,
    rules
  });
  const isInvalid = hasSubmittedStartForm && !value.trim();

  return (
    <Field label={label} colSpan={colSpan}>
      <Input
        placeholder={placeholder}
        {...inputStyles}
        isInvalid={isInvalid || !!error}
        _invalid={invalidInputStyles}
        {...fieldRegister}
      />
    </Field>
  );
};

type EnterpriseAuthUnifiedCreditCodeFieldProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  hasSubmittedStartForm: boolean;
};

const enterpriseAuthUnifiedCreditCodeRules = {
  ...fieldRules.unifiedCreditCode,
  setValueAs: normalizeUnifiedCreditCode
};

const EnterpriseAuthUnifiedCreditCodeField = ({
  t,
  startForm,
  hasSubmittedStartForm
}: EnterpriseAuthUnifiedCreditCodeFieldProps) => {
  const [hasBlurred, setHasBlurred] = useState(false);
  const { value, error, isSubmitted, fieldRegister } = useEnterpriseAuthField({
    startForm,
    name: 'unifiedCreditCode',
    rules: enterpriseAuthUnifiedCreditCodeRules
  });
  const shouldShowFormatError =
    !!value.trim() && (hasBlurred || isSubmitted) && !isUnifiedCreditCode(value);
  const shouldShowEmptyError = (hasSubmittedStartForm || !!error) && !value.trim();

  return (
    <Field
      label={t('account_team:enterprise_auth_unified_credit_code')}
      errorText={
        shouldShowFormatError ? t('account_team:enterprise_auth_invalid_format_tip') : undefined
      }
    >
      <Input
        placeholder={t('account_team:enterprise_auth_unified_credit_code_placeholder')}
        {...inputStyles}
        isInvalid={shouldShowEmptyError}
        _invalid={invalidInputStyles}
        {...fieldRegister}
        onBlur={(event) => {
          setHasBlurred(true);
          fieldRegister.onBlur(event);
        }}
      />
    </Field>
  );
};

type EnterpriseAuthBankAccountFieldProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  hasSubmittedStartForm: boolean;
};

const enterpriseAuthBankAccountRules = {
  ...fieldRules.bankAccount,
  setValueAs: normalizeBankAccount
};

const EnterpriseAuthBankAccountField = ({
  t,
  startForm,
  hasSubmittedStartForm
}: EnterpriseAuthBankAccountFieldProps) => {
  const [hasBlurred, setHasBlurred] = useState(false);
  const { value, error, isSubmitted, fieldRegister } = useEnterpriseAuthField({
    startForm,
    name: 'bankAccount',
    rules: enterpriseAuthBankAccountRules
  });
  const shouldShowFormatError =
    !!value.trim() && (hasBlurred || isSubmitted) && !isBankAccount(value);
  const shouldShowEmptyError = (hasSubmittedStartForm || !!error) && !value.trim();

  return (
    <Field
      label={t('account_team:enterprise_auth_bank_account')}
      errorText={
        shouldShowFormatError ? t('account_team:enterprise_auth_invalid_format_tip') : undefined
      }
    >
      <Input
        placeholder={t('account_team:enterprise_auth_bank_account_placeholder')}
        {...inputStyles}
        isInvalid={shouldShowEmptyError}
        _invalid={invalidInputStyles}
        {...fieldRegister}
        onBlur={(event) => {
          setHasBlurred(true);
          fieldRegister.onBlur(event);
        }}
      />
    </Field>
  );
};

type EnterpriseAuthBankNameFieldProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  bankOptions: EnterpriseAuthBankOption[];
  hasSubmittedStartForm: boolean;
  hasBankLoadError: boolean;
  isBankLoading: boolean;
  reloadBanks: () => void;
};

const EnterpriseAuthBankNameField = ({
  t,
  startForm,
  bankOptions,
  hasSubmittedStartForm,
  hasBankLoadError,
  isBankLoading,
  reloadBanks
}: EnterpriseAuthBankNameFieldProps) => {
  const { field, fieldState } = useController({
    control: startForm.control,
    name: 'bankName',
    rules: fieldRules.bankName
  });
  const value = String(field.value ?? '');
  const shouldShowEmptyError = (hasSubmittedStartForm || !!fieldState.error) && !value.trim();

  return (
    <Field label={t('account_team:enterprise_auth_bank_name')}>
      <MySelect<string>
        value={field.value}
        list={bankOptions}
        isSearch
        isDisabled={hasBankLoadError}
        isInvalid={shouldShowEmptyError}
        isLoading={isBankLoading}
        placeholder={
          hasBankLoadError
            ? t('account_team:enterprise_auth_bank_load_failed')
            : bankOptions.length
              ? t('account_team:enterprise_auth_bank_name_placeholder')
              : isBankLoading
                ? t('account_team:enterprise_auth_bank_loading_placeholder')
                : t('account_team:enterprise_auth_bank_name_placeholder')
        }
        opacity={1}
        _disabled={{
          opacity: 1,
          cursor: 'not-allowed',
          bg: 'myWhite.300',
          borderColor: 'myGray.100',
          color: 'myGray.400'
        }}
        _hover={shouldShowEmptyError ? { borderColor: 'red.500' } : { borderColor: 'primary.300' }}
        size={'sm'}
        h={'32px'}
        borderColor={shouldShowEmptyError ? 'red.500' : 'borderColor.low'}
        onChange={(value) => {
          field.onChange(value);
          startForm.clearErrors('bankName');
        }}
      />
      {hasBankLoadError && (
        <Flex mt={2} alignItems={'center'} gap={2}>
          <Text {...formErrorTextStyles}>{t('account_team:enterprise_auth_bank_load_failed')}</Text>
          <Button
            size={'xs'}
            variant={'link'}
            color={'primary.600'}
            minW={0}
            isLoading={isBankLoading}
            onClick={() => reloadBanks()}
          >
            {t('account_team:enterprise_auth_bank_retry')}
          </Button>
        </Flex>
      )}
    </Field>
  );
};

type EnterpriseAuthDemandFieldProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  hasSubmittedStartForm: boolean;
};

const EnterpriseAuthDemandField = ({
  t,
  startForm,
  hasSubmittedStartForm
}: EnterpriseAuthDemandFieldProps) => {
  const { value, error, fieldRegister } = useEnterpriseAuthField({
    startForm,
    name: 'demand',
    rules: fieldRules.demand
  });

  return (
    <Field label={t('account_team:enterprise_auth_demand')} colSpan={2}>
      <Textarea
        {...textareaStyles}
        placeholder={t('account_team:enterprise_auth_demand_placeholder')}
        isInvalid={(hasSubmittedStartForm && !value.trim()) || !!error}
        _invalid={invalidInputStyles}
        {...fieldRegister}
      />
    </Field>
  );
};

const EnterpriseAuthInfoForm = ({
  t,
  startForm,
  bankOptions,
  hasSubmittedStartForm,
  hasBankLoadError,
  isBankLoading,
  reloadBanks
}: EnterpriseAuthInfoFormProps) => (
  <Flex flexDirection={'column'} gap={6}>
    <Section title={t('account_team:enterprise_auth_enterprise_info')}>
      <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
        <EnterpriseAuthInputField
          startForm={startForm}
          name={'enterpriseName'}
          rules={fieldRules.enterpriseName}
          label={t('account_team:enterprise_auth_enterprise_name')}
          placeholder={t('account_team:enterprise_auth_enterprise_name_placeholder')}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthUnifiedCreditCodeField
          t={t}
          startForm={startForm}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthInputField
          startForm={startForm}
          name={'legalPersonName'}
          rules={fieldRules.legalPersonName}
          label={t('account_team:enterprise_auth_legal_person')}
          placeholder={t('account_team:enterprise_auth_legal_person_placeholder')}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthBankAccountField
          t={t}
          startForm={startForm}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthBankNameField
          t={t}
          startForm={startForm}
          bankOptions={bankOptions}
          hasSubmittedStartForm={hasSubmittedStartForm}
          hasBankLoadError={hasBankLoadError}
          isBankLoading={isBankLoading}
          reloadBanks={reloadBanks}
        />
      </Grid>
    </Section>

    <Flex h={'4px'} alignItems={'center'}>
      <Box h={'1px'} w={'full'} bg={'myGray.200'} />
    </Flex>

    <Section title={t('account_team:enterprise_auth_contact_info')}>
      <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
        <EnterpriseAuthInputField
          startForm={startForm}
          name={'contactName'}
          rules={fieldRules.contactName}
          label={t('account_team:enterprise_auth_contact_name')}
          placeholder={t('account_team:enterprise_auth_contact_name_placeholder')}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthInputField
          startForm={startForm}
          name={'contactTitle'}
          rules={fieldRules.contactTitle}
          label={t('account_team:enterprise_auth_contact_title')}
          placeholder={t('account_team:enterprise_auth_contact_title_placeholder')}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
        <EnterpriseAuthInputField
          startForm={startForm}
          name={'contactPhone'}
          rules={fieldRules.contactPhone}
          label={t('account_team:enterprise_auth_contact_phone')}
          placeholder={t('account_team:enterprise_auth_contact_phone_placeholder')}
          hasSubmittedStartForm={hasSubmittedStartForm}
          colSpan={2}
        />
        <EnterpriseAuthDemandField
          t={t}
          startForm={startForm}
          hasSubmittedStartForm={hasSubmittedStartForm}
        />
      </Grid>
    </Section>
  </Flex>
);

export default React.memo(EnterpriseAuthInfoForm);
