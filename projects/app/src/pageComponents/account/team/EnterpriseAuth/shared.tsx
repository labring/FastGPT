import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import {
  isBankAccount,
  isUnifiedCreditCode,
  normalizeBankAccount,
  normalizeUnifiedCreditCode
} from '@fastgpt/global/support/user/team/enterpriseAuth/utils';

export { normalizeBankAccount, normalizeUnifiedCreditCode };

export type AmountFormType = {
  amountYuan: string;
};

export type EnterpriseAuthBankOption = {
  label: string;
  value: string;
};

export const EnterpriseAuthAmountMaxCent = 10000 * 100;
export const AmountYuanPattern = /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d*(?:\.\d{1,2})?)$/;

/**
 * 将用户输入的元转换为服务端需要的分，避免 `0.28 * 100` 这类浮点计算误差。
 */
export const parseEnterpriseAuthAmountCent = (amountYuan: string) => {
  const normalized = amountYuan.trim();
  if (!AmountYuanPattern.test(normalized)) return;

  const [yuan, cent = ''] = normalized.split('.');
  const yuanNumber = Number(yuan);
  const centNumber = Number(cent.padEnd(2, '0'));
  if (!Number.isSafeInteger(yuanNumber) || !Number.isSafeInteger(centNumber)) return;

  const amountCent = yuanNumber * 100 + centNumber;
  if (!Number.isSafeInteger(amountCent) || amountCent > EnterpriseAuthAmountMaxCent) return;

  return amountCent;
};

export const formatBankAccountForDisplay = (account?: string) => {
  if (!account) return account;

  return normalizeBankAccount(account).replace(/(.{4})(?=.)/g, '$1 ');
};

/**
 * 将后端返回的“银行简称 -> 银行公司全称”映射转成下拉选项。
 * 下拉只展示并提交银行简称；公司全称由后端在发起认证服务请求时转换。
 */
export const formatEnterpriseAuthBankOptions = (
  banks: Record<string, string>
): EnterpriseAuthBankOption[] =>
  Object.keys(banks).map((bankName) => ({
    label: bankName,
    value: bankName
  }));

export const fieldRules = {
  enterpriseName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 100
  },
  unifiedCreditCode: {
    required: true,
    validate: isUnifiedCreditCode
  },
  legalPersonName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 50
  },
  bankAccount: {
    required: true,
    validate: isBankAccount
  },
  bankName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 80
  },
  contactName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 50
  },
  contactTitle: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 50
  },
  contactPhone: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 30
  },
  demand: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 500
  }
};

export const formLabelStyles = {
  color: 'myGray.800',
  fontSize: '10px',
  fontWeight: 500,
  lineHeight: '16px',
  letterSpacing: '0.5px'
};

export const formErrorTextStyles = {
  ...formLabelStyles,
  color: 'red.600'
};

export const fieldErrorTextStyles = {
  ...formErrorTextStyles,
  fontSize: '10px',
  lineHeight: '16px'
};

export const invalidInputStyles = {
  borderColor: 'red.600'
};

export const inputStyles = {
  size: 'sm' as const,
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.048px'
};

export const textareaStyles = {
  ...inputStyles,
  minH: '106px',
  resize: 'vertical' as const
};

export const enterpriseAuthFooterButtonStyles = {
  h: '32px',
  minH: '32px',
  px: '14px',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.5px'
};

export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Flex
    flexDirection={['column', 'row']}
    alignItems={'flex-start'}
    gap={['12px', '32px']}
    w={'full'}
  >
    <Box
      color={'myGray.800'}
      fontSize={'sm'}
      fontWeight={500}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      w={['full', '160px']}
      flexShrink={0}
    >
      {title}
    </Box>
    <Box flex={'1 1 0'} minW={0} w={'full'}>
      {children}
    </Box>
  </Flex>
);

export const Field = ({
  label,
  errorText,
  children,
  colSpan = 1
}: {
  label: string;
  errorText?: string;
  children: React.ReactNode;
  colSpan?: number;
}) => (
  <Box gridColumn={['span 1', `span ${colSpan}`]} minW={0}>
    <Flex mb={'8px'} alignItems={'center'} justifyContent={'space-between'} gap={'8px'}>
      <Box {...formLabelStyles}>{label}</Box>
      {errorText && (
        <Box {...fieldErrorTextStyles} flexShrink={0}>
          {errorText}
        </Box>
      )}
    </Flex>
    {children}
  </Box>
);

export const AmountInfoRow = ({ label, value }: { label: string; value?: string }) => (
  <Flex alignItems={'center'} gap={'32px'} w={'full'} minW={0}>
    <Box
      color={'myGray.800'}
      fontSize={'sm'}
      fontWeight={500}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      flexShrink={0}
      maxW={'160px'}
      minW={'57px'}
    >
      {label}
    </Box>
    <Box
      color={'myGray.600'}
      fontSize={'sm'}
      fontWeight={500}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      minW={0}
      noOfLines={1}
    >
      {value || '-'}
    </Box>
  </Flex>
);

export const getErrorCode = (error: unknown) => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';

  const err = error as {
    statusText?: string;
    message?: string;
    response?: {
      data?: {
        statusText?: string;
        message?: string;
      };
      statusText?: string;
      message?: string;
    };
  };

  return (
    err.response?.data?.statusText ||
    err.statusText ||
    err.response?.data?.message ||
    err.response?.message ||
    err.message ||
    ''
  );
};
