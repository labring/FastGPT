import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

export type AmountFormType = {
  amountFen: string;
};

export type EnterpriseAuthBankOption = {
  label: string;
  value: string;
  alias: string;
};

export const UnifiedCreditCodePattern = /^[0-9A-HJ-NPQRTUWXY]{18}$/;
export const PositiveIntegerPattern = /^[1-9]\d*$/;
export const BankAccountPattern = /^\d{1,64}$/;

export const normalizeUnifiedCreditCode = (code: string) => code.trim().toUpperCase();
export const normalizeBankAccount = (account: string) => account.replace(/\s+/g, '');

export const formatBankAccountForDisplay = (account?: string) => {
  if (!account) return account;

  return normalizeBankAccount(account).replace(/(.{4})(?=.)/g, '$1 ');
};

/**
 * 将后端返回的“银行简称 -> 银行公司全称”映射转成下拉选项。
 * 下拉展示并提交银行简称，银行公司全称仅作为搜索别名；真正发起认证服务请求时再由后端转换。
 */
export const formatEnterpriseAuthBankOptions = (
  banks: Record<string, string>
): EnterpriseAuthBankOption[] =>
  Object.entries(banks).map(([bankName, companyName]) => ({
    label: bankName,
    value: bankName,
    alias: companyName
  }));

export const fieldRules = {
  enterpriseName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 100
  },
  unifiedCreditCode: {
    required: true,
    validate: (value: string) => UnifiedCreditCodePattern.test(normalizeUnifiedCreditCode(value))
  },
  legalPersonName: {
    required: true,
    validate: (value: string) => value.trim().length > 0 && value.trim().length <= 50
  },
  bankAccount: {
    required: true,
    validate: (value: string) => BankAccountPattern.test(normalizeBankAccount(value))
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
  color: '#24282C',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.5px',
  fontWeight: 500
};

export const formErrorTextStyles = {
  color: '#D92D20',
  fontSize: '10px',
  lineHeight: '14px',
  letterSpacing: '0.2px',
  fontWeight: 500
};

export const invalidInputStyles = {
  borderColor: '#D92D20',
  boxShadow: '0 0 0 1px #D92D20'
};

export const inputStyles = {
  h: '32px',
  borderColor: '#E8EBF0',
  borderRadius: '6px',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.048px',
  px: 3,
  _placeholder: {
    color: '#667085'
  },
  _focusVisible: {
    borderColor: '#3370ff',
    boxShadow: '0 0 0 1px #3370ff'
  }
};

export const textareaStyles = {
  ...inputStyles,
  h: '106px',
  minH: '106px',
  py: 2,
  resize: 'vertical' as const
};

export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Flex
    flexDirection={['column', 'row']}
    alignItems={'flex-start'}
    gap={['12px', '32px']}
    w={'full'}
  >
    <Box
      color={'#24282C'}
      fontSize={'14px'}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      fontWeight={500}
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
        <Box {...formErrorTextStyles} flexShrink={0}>
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
      color={'#24282C'}
      fontSize={'14px'}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      fontWeight={500}
      flexShrink={0}
      maxW={'160px'}
      minW={'57px'}
    >
      {label}
    </Box>
    <Box
      color={'#485264'}
      fontSize={'14px'}
      lineHeight={'20px'}
      letterSpacing={'0.1px'}
      fontWeight={500}
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
