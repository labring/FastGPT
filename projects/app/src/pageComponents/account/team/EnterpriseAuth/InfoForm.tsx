import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, Input, Text, Textarea } from '@chakra-ui/react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
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

const EnterpriseAuthInfoForm = ({
  t,
  startForm,
  bankOptions,
  hasSubmittedStartForm,
  hasBankLoadError,
  isBankLoading,
  reloadBanks
}: EnterpriseAuthInfoFormProps) => {
  const [hasBlurredUnifiedCreditCode, setHasBlurredUnifiedCreditCode] = useState(false);
  const [hasBlurredBankAccount, setHasBlurredBankAccount] = useState(false);
  const unifiedCreditCode = useWatch({
    control: startForm.control,
    name: 'unifiedCreditCode'
  });
  const bankAccount = useWatch({
    control: startForm.control,
    name: 'bankAccount'
  });
  const watchedFields = useWatch({
    control: startForm.control
  });
  const unifiedCreditCodeRegister = useMemo(
    () =>
      startForm.register('unifiedCreditCode', {
        ...fieldRules.unifiedCreditCode,
        setValueAs: normalizeUnifiedCreditCode
      }),
    [startForm]
  );
  const bankAccountRegister = useMemo(
    () =>
      startForm.register('bankAccount', {
        ...fieldRules.bankAccount,
        setValueAs: normalizeBankAccount
      }),
    [startForm]
  );
  const shouldShowUnifiedCreditCodeError =
    !!unifiedCreditCode?.trim() &&
    (hasBlurredUnifiedCreditCode || startForm.formState.isSubmitted) &&
    !isUnifiedCreditCode(unifiedCreditCode);
  const shouldShowBankAccountError =
    !!bankAccount?.trim() &&
    (hasBlurredBankAccount || startForm.formState.isSubmitted) &&
    !isBankAccount(bankAccount);
  const fieldErrors = startForm.formState.errors;
  const isEmptyAfterSubmit = (value?: string) => hasSubmittedStartForm && !value?.trim();
  const shouldShowUnifiedCreditCodeEmptyError =
    isEmptyAfterSubmit(unifiedCreditCode) ||
    (!!fieldErrors.unifiedCreditCode && !unifiedCreditCode?.trim());
  const shouldShowBankAccountEmptyError =
    isEmptyAfterSubmit(bankAccount) || (!!fieldErrors.bankAccount && !bankAccount?.trim());
  const shouldShowBankNameEmptyError =
    isEmptyAfterSubmit(watchedFields.bankName) ||
    (!!fieldErrors.bankName && !watchedFields.bankName?.trim());

  return (
    <Flex flexDirection={'column'} gap={6}>
      <Section title={t('account_team:enterprise_auth_enterprise_info')}>
        <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
          <Field label={t('account_team:enterprise_auth_enterprise_name')}>
            <Input
              placeholder={t('account_team:enterprise_auth_enterprise_name_placeholder')}
              {...inputStyles}
              isInvalid={
                isEmptyAfterSubmit(watchedFields.enterpriseName) || !!fieldErrors.enterpriseName
              }
              _invalid={invalidInputStyles}
              {...startForm.register('enterpriseName', fieldRules.enterpriseName)}
            />
          </Field>
          <Field
            label={t('account_team:enterprise_auth_unified_credit_code')}
            errorText={
              shouldShowUnifiedCreditCodeError
                ? t('account_team:enterprise_auth_invalid_format_tip')
                : undefined
            }
          >
            <Input
              placeholder={t('account_team:enterprise_auth_unified_credit_code_placeholder')}
              {...inputStyles}
              isInvalid={shouldShowUnifiedCreditCodeEmptyError}
              _invalid={invalidInputStyles}
              {...unifiedCreditCodeRegister}
              onBlur={(event) => {
                setHasBlurredUnifiedCreditCode(true);
                unifiedCreditCodeRegister.onBlur(event);
              }}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_legal_person')}>
            <Input
              placeholder={t('account_team:enterprise_auth_legal_person_placeholder')}
              {...inputStyles}
              isInvalid={
                isEmptyAfterSubmit(watchedFields.legalPersonName) || !!fieldErrors.legalPersonName
              }
              _invalid={invalidInputStyles}
              {...startForm.register('legalPersonName', fieldRules.legalPersonName)}
            />
          </Field>
          <Field
            label={t('account_team:enterprise_auth_bank_account')}
            errorText={
              shouldShowBankAccountError
                ? t('account_team:enterprise_auth_invalid_format_tip')
                : undefined
            }
          >
            <Input
              placeholder={t('account_team:enterprise_auth_bank_account_placeholder')}
              {...inputStyles}
              isInvalid={shouldShowBankAccountEmptyError}
              _invalid={invalidInputStyles}
              {...bankAccountRegister}
              onBlur={(event) => {
                setHasBlurredBankAccount(true);
                bankAccountRegister.onBlur(event);
              }}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_bank_name')}>
            <Controller
              control={startForm.control}
              name={'bankName'}
              rules={fieldRules.bankName}
              render={({ field }) => (
                <MySelect<string>
                  value={field.value}
                  list={bankOptions}
                  isSearch
                  isDisabled={hasBankLoadError}
                  isInvalid={shouldShowBankNameEmptyError}
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
                  _hover={
                    shouldShowBankNameEmptyError
                      ? { borderColor: 'red.500' }
                      : { borderColor: 'primary.300' }
                  }
                  size={'sm'}
                  h={'32px'}
                  borderColor={shouldShowBankNameEmptyError ? 'red.500' : 'borderColor.low'}
                  onChange={(value) => {
                    field.onChange(value);
                    startForm.clearErrors('bankName');
                  }}
                />
              )}
            />
            {hasBankLoadError && (
              <Flex mt={2} alignItems={'center'} gap={2}>
                <Text {...formErrorTextStyles}>
                  {t('account_team:enterprise_auth_bank_load_failed')}
                </Text>
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
        </Grid>
      </Section>

      <Flex h={'4px'} alignItems={'center'}>
        <Box h={'1px'} w={'full'} bg={'myGray.200'} />
      </Flex>

      <Section title={t('account_team:enterprise_auth_contact_info')}>
        <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
          <Field label={t('account_team:enterprise_auth_contact_name')}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_name_placeholder')}
              {...inputStyles}
              isInvalid={isEmptyAfterSubmit(watchedFields.contactName) || !!fieldErrors.contactName}
              _invalid={invalidInputStyles}
              {...startForm.register('contactName', fieldRules.contactName)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_contact_title')}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_title_placeholder')}
              {...inputStyles}
              isInvalid={
                isEmptyAfterSubmit(watchedFields.contactTitle) || !!fieldErrors.contactTitle
              }
              _invalid={invalidInputStyles}
              {...startForm.register('contactTitle', fieldRules.contactTitle)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_contact_phone')} colSpan={2}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_phone_placeholder')}
              {...inputStyles}
              isInvalid={
                isEmptyAfterSubmit(watchedFields.contactPhone) || !!fieldErrors.contactPhone
              }
              _invalid={invalidInputStyles}
              {...startForm.register('contactPhone', fieldRules.contactPhone)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_demand')} colSpan={2}>
            <Textarea
              {...textareaStyles}
              placeholder={t('account_team:enterprise_auth_demand_placeholder')}
              isInvalid={isEmptyAfterSubmit(watchedFields.demand) || !!fieldErrors.demand}
              _invalid={invalidInputStyles}
              {...startForm.register('demand', fieldRules.demand)}
            />
          </Field>
        </Grid>
      </Section>
    </Flex>
  );
};

export default React.memo(EnterpriseAuthInfoForm);
