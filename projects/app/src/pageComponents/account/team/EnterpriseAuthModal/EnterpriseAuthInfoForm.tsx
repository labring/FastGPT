import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, Grid, Input, Text, Textarea } from '@chakra-ui/react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import type { TFunction } from 'next-i18next';
import MySelect from '@fastgpt/web/components/common/MySelect';
import type { StartEnterpriseAuthBodyType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import {
  Field,
  Section,
  BankAccountPattern,
  UnifiedCreditCodePattern,
  fieldRules,
  inputStyles,
  normalizeBankAccount,
  normalizeUnifiedCreditCode,
  textareaStyles
} from './shared';

type EnterpriseAuthInfoFormProps = {
  t: TFunction;
  startForm: UseFormReturn<StartEnterpriseAuthBodyType>;
  bankOptions: {
    label: string;
    value: string;
    alias: string;
  }[];
  canSelectBank: boolean;
  hasBankLoadError: boolean;
  isBankLoading: boolean;
  reloadBanks: () => void;
};

const EnterpriseAuthInfoForm = ({
  t,
  startForm,
  bankOptions,
  canSelectBank,
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
    hasBlurredUnifiedCreditCode &&
    !UnifiedCreditCodePattern.test(normalizeUnifiedCreditCode(unifiedCreditCode || ''));
  const shouldShowBankAccountError =
    hasBlurredBankAccount && !BankAccountPattern.test(normalizeBankAccount(bankAccount || ''));

  return (
    <Flex flexDirection={'column'} gap={'24px'}>
      <Box>
        <Box
          color={'#000'}
          fontSize={'20px'}
          lineHeight={'26px'}
          letterSpacing={'0.15px'}
          fontWeight={500}
        >
          {t('account_team:enterprise_auth_title')}
        </Box>
        <Box
          mt={'10px'}
          color={'#667085'}
          fontSize={'14px'}
          lineHeight={'20px'}
          letterSpacing={'0.25px'}
        >
          {t('account_team:enterprise_auth_modal_desc')}
        </Box>
      </Box>

      <Section title={t('account_team:enterprise_auth_enterprise_info')}>
        <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={'16px'}>
          <Field label={t('account_team:enterprise_auth_enterprise_name')}>
            <Input
              placeholder={t('account_team:enterprise_auth_enterprise_name_placeholder')}
              {...inputStyles}
              {...startForm.register('enterpriseName', fieldRules.enterpriseName)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_unified_credit_code')}>
            <Input
              placeholder={t('account_team:enterprise_auth_unified_credit_code_placeholder')}
              {...inputStyles}
              isInvalid={shouldShowUnifiedCreditCodeError}
              _invalid={{
                borderColor: '#D92D20',
                boxShadow: '0 0 0 1px #D92D20'
              }}
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
              {...startForm.register('legalPersonName', fieldRules.legalPersonName)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_bank_account')}>
            <Input
              placeholder={t('account_team:enterprise_auth_bank_account_placeholder')}
              {...inputStyles}
              isInvalid={shouldShowBankAccountError}
              _invalid={{
                borderColor: '#D92D20',
                boxShadow: '0 0 0 1px #D92D20'
              }}
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
                  showAliasInValue={false}
                  list={bankOptions}
                  isSearch
                  isDisabled={!canSelectBank || hasBankLoadError}
                  isLoading={isBankLoading}
                  placeholder={
                    !canSelectBank
                      ? t('account_team:enterprise_auth_bank_account_first_placeholder')
                      : hasBankLoadError
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
                    bg: '#FBFBFC',
                    borderColor: '#F4F4F7',
                    color: '#8A95A7'
                  }}
                  _hover={
                    canSelectBank
                      ? {
                          borderColor: 'primary.300'
                        }
                      : {
                          borderColor: '#F4F4F7'
                        }
                  }
                  h={'32px'}
                  borderRadius={'6px'}
                  fontSize={'12px'}
                  lineHeight={'16px'}
                  letterSpacing={'0.048px'}
                  borderColor={'#E8EBF0'}
                  onChange={(value) => field.onChange(value)}
                />
              )}
            />
            {hasBankLoadError && (
              <Flex mt={2} alignItems={'center'} gap={2}>
                <Text
                  color={'#D92D20'}
                  fontSize={'10px'}
                  lineHeight={'14px'}
                  letterSpacing={'0.2px'}
                  fontWeight={500}
                >
                  {t('account_team:enterprise_auth_bank_load_failed')}
                </Text>
                <Button
                  size={'xs'}
                  variant={'link'}
                  color={'#3370FF'}
                  fontSize={'10px'}
                  lineHeight={'14px'}
                  minW={0}
                  h={'14px'}
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
        <Box h={'1px'} w={'full'} bg={'#E8EBF0'} />
      </Flex>

      <Section title={t('account_team:enterprise_auth_contact_info')}>
        <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={'16px'}>
          <Field label={t('account_team:enterprise_auth_contact_name')}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_name_placeholder')}
              {...inputStyles}
              {...startForm.register('contactName', fieldRules.contactName)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_contact_title')}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_title_placeholder')}
              {...inputStyles}
              {...startForm.register('contactTitle', fieldRules.contactTitle)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_contact_phone')} colSpan={2}>
            <Input
              placeholder={t('account_team:enterprise_auth_contact_phone_placeholder')}
              {...inputStyles}
              {...startForm.register('contactPhone', fieldRules.contactPhone)}
            />
          </Field>
          <Field label={t('account_team:enterprise_auth_demand')} colSpan={2}>
            <Textarea
              {...textareaStyles}
              placeholder={t('account_team:enterprise_auth_demand_placeholder')}
              {...startForm.register('demand', fieldRules.demand)}
            />
          </Field>
        </Grid>
      </Section>
    </Flex>
  );
};

export default React.memo(EnterpriseAuthInfoForm);
