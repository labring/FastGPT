import React from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import type { UseFormReturn } from 'react-hook-form';
import type { TFunction } from 'next-i18next';
import type { GetEnterpriseAuthCurrentTaskDetailResponseType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { enterpriseAuthContactBusinessUrl } from './utils';
import {
  AmountInfoRow,
  AmountYuanPattern,
  formatBankAccountForDisplay,
  formErrorTextStyles,
  inputStyles,
  type AmountFormType
} from './shared';

type EnterpriseAuthAmountFormProps = {
  t: TFunction;
  amountForm: UseFormReturn<AmountFormType>;
  taskDetail?: GetEnterpriseAuthCurrentTaskDetailResponseType;
  shouldShowAmountError: boolean;
  setShowAmountError: (show: boolean) => void;
};

const EnterpriseAuthAmountForm = ({
  t,
  amountForm,
  taskDetail,
  shouldShowAmountError,
  setShowAmountError
}: EnterpriseAuthAmountFormProps) => {
  const amountField = amountForm.register('amountYuan', {
    required: true,
    pattern: AmountYuanPattern
  });

  return (
    <Flex flexDirection={'column'} gap={6}>
      <Flex flexDirection={'column'} gap={6}>
        <Flex flexDirection={'column'} gap={4} w={'full'}>
          <AmountInfoRow
            label={t('account_team:enterprise_auth_enterprise_name')}
            value={taskDetail?.enterpriseName}
          />
          <AmountInfoRow
            label={t('account_team:enterprise_auth_bank_account')}
            value={formatBankAccountForDisplay(taskDetail?.bankAccount)}
          />
          <AmountInfoRow
            label={t('account_team:enterprise_auth_bank_name')}
            value={taskDetail?.bankName}
          />
        </Flex>

        <Flex h={'4px'} alignItems={'center'}>
          <Box h={'1px'} w={'full'} bg={'myGray.200'} />
        </Flex>

        <Box color={'myGray.500'}>
          {t('account_team:enterprise_auth_amount_sent_prefix')}
          <Box
            as={'a'}
            href={enterpriseAuthContactBusinessUrl}
            target={'_blank'}
            rel={'noreferrer'}
            color={'primary.600'}
            cursor={'pointer'}
            _hover={{ textDecoration: 'none' }}
          >
            {t('account_team:enterprise_auth_contact_business')}
          </Box>
          {t('account_team:enterprise_auth_amount_sent_suffix')}
        </Box>

        <Flex alignItems={'flex-start'} gap={'16px'} w={'full'}>
          <Flex
            h={'32px'}
            alignItems={'center'}
            color={'myGray.800'}
            fontSize={'sm'}
            fontWeight={500}
            lineHeight={'20px'}
            letterSpacing={'0.1px'}
            flexShrink={0}
            w={'72px'}
          >
            {t('account_team:enterprise_auth_amount_label')}
          </Flex>
          <Flex flexDirection={'column'} gap={'10px'} flex={['1 1 0', '0 0 647px']} minW={0}>
            <Input
              inputMode={'decimal'}
              pattern={'[0-9]+(\\.[0-9]{0,2})?'}
              {...inputStyles}
              {...amountField}
              onChange={(event) => {
                const [yuan = '', ...centParts] = event.target.value
                  .replace(/[^\d.]/g, '')
                  .split('.');
                event.target.value = centParts.length
                  ? `${yuan}.${centParts.join('').slice(0, 2)}`
                  : yuan;
                void amountField.onChange(event);
                setShowAmountError(false);
              }}
            />
            <Box
              {...formErrorTextStyles}
              minH={'14px'}
              visibility={shouldShowAmountError ? 'visible' : 'hidden'}
            >
              {t('account_team:enterprise_auth_amount_error_tip')}
            </Box>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default React.memo(EnterpriseAuthAmountForm);
