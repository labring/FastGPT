import React from 'react';
import { Box, Input, VStack, type StackProps } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';

type Props = Omit<StackProps, 'onChange'> & {
  value: string;
  confirmText: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * 渲染删除等高风险操作中的输入确认区域。
 * 调用方负责根据 `value.trim() === confirmText.trim()` 控制确认按钮状态，
 * 组件只复用统一文案、可复制的确认文本和输入框视觉。
 */
const DeleteConfirmInput = ({ value, confirmText, onChange, placeholder, ...props }: Props) => {
  const { t } = useTranslation();

  return (
    <VStack align={'stretch'} spacing={'10px'} {...props}>
      <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
        <Trans
          i18nKey={'common:confirm_input_delete_tip'}
          values={{ confirmText }}
          components={{
            bold: <Box as={'span'} fontWeight={'500'} userSelect={'all'} />
          }}
        />
      </Box>
      <Input
        size={'sm'}
        h={'32px'}
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common:confirm_input_delete_placeholder', { confirmText })}
        fontSize={'12px'}
        lineHeight={'16px'}
        borderColor={'myGray.200'}
        _placeholder={{ color: 'myGray.500' }}
        _focus={{
          borderColor: 'primary.600',
          outline: 'none',
          boxShadow: 'inset 0 0 0 1px var(--chakra-colors-primary-600)'
        }}
        _focusVisible={{
          borderColor: 'primary.600',
          outline: 'none',
          boxShadow: 'inset 0 0 0 1px var(--chakra-colors-primary-600)'
        }}
        aria-label={t('common:confirm_input_delete_placeholder', { confirmText })}
      />
    </VStack>
  );
};

export default React.memo(DeleteConfirmInput);
