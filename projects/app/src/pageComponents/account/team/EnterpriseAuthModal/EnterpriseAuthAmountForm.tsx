import React from 'react';
import { Box, Flex, Input } from '@chakra-ui/react';
import type { UseFormReturn } from 'react-hook-form';
import type { TFunction } from 'next-i18next';
import type { GetEnterpriseAuthCurrentTaskDetailResponseType } from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { enterpriseAuthContactBusinessUrl } from '../utils';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import {
  AmountInfoRow,
  formatBankAccountForDisplay,
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
  const amountField = amountForm.register('amountFen', {
    required: true,
    pattern: /^[1-9]\d*$/
  });

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

      <Flex flexDirection={'column'} gap={'24px'}>
        <Flex flexDirection={'column'} gap={'16px'} w={'full'}>
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
          <Box h={'1px'} w={'full'} bg={'#E8EBF0'} />
        </Flex>

        <Box color={'#667085'} fontSize={'14px'} lineHeight={'20px'} letterSpacing={'0.25px'}>
          {t('account_team:enterprise_auth_amount_sent_prefix')}
          <Box
            as={'a'}
            href={enterpriseAuthContactBusinessUrl}
            target={'_blank'}
            rel={'noreferrer'}
            color={'#3370FF'}
            cursor={'pointer'}
            _hover={{ textDecoration: 'none' }}
            onClick={() => {
              webPushTrack.enterpriseAuthContactBusiness({
                source: 'amountStep'
              });
            }}
          >
            {t('account_team:enterprise_auth_contact_business')}
          </Box>
          {t('account_team:enterprise_auth_amount_sent_suffix')}
        </Box>

        <Flex alignItems={'flex-start'} gap={'16px'} w={'full'}>
          <Flex
            h={'32px'}
            alignItems={'center'}
            color={'#24282C'}
            fontSize={'14px'}
            lineHeight={'20px'}
            letterSpacing={'0.1px'}
            fontWeight={500}
            flexShrink={0}
            w={'57px'}
          >
            {t('account_team:enterprise_auth_amount_label')}
          </Flex>
          <Flex flexDirection={'column'} gap={'10px'} flex={'1 1 0'} minW={0}>
            <Input
              inputMode={'numeric'}
              pattern={'[0-9]*'}
              placeholder={t('account_team:enterprise_auth_amount_placeholder')}
              {...inputStyles}
              {...amountField}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '');
                void amountField.onChange(event);
                setShowAmountError(false);
              }}
            />
            <Box
              color={'#D92D20'}
              fontSize={'10px'}
              lineHeight={'14px'}
              letterSpacing={'0.2px'}
              fontWeight={500}
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
