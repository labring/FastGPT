import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

export type AmountFormType = {
  amountFen: string;
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
  mb: '8px',
  color: '#24282C',
  fontSize: '12px',
  lineHeight: '16px',
  letterSpacing: '0.5px',
  fontWeight: 500
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
  children,
  colSpan = 1
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: number;
}) => (
  <Box gridColumn={['span 1', `span ${colSpan}`]} minW={0}>
    <Box {...formLabelStyles}>{label}</Box>
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
