import React, { useState } from 'react';
import { Box, Flex, IconButton, Input, type InputProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

type SecretValueInputProps = {
  value: string;
  isConfigured: boolean;
  onChange?: (value: string) => void;
  multiline?: boolean;
  rows?: number;
} & Omit<InputProps, 'value' | 'onChange' | 'type' | 'onBlur' | 'onFocus'>;

/**
 * 明文首次填写直接更新表单；已保存密钥使用独立的空草稿替换。
 * 草稿只有点击确认才提交，取消和失焦均不改变原值，每次编辑都重新清空。
 */
const SecretValueInput = ({
  value,
  isConfigured,
  onChange,
  multiline = false,
  rows = 5,
  isDisabled,
  h = 9,
  borderLeftRadius,
  isInvalid,
  ...inputProps
}: SecretValueInputProps) => {
  const { t } = useSafeTranslation();
  const [draft, setDraft] = useState<string>();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const isEditing = draft !== undefined;
  const showConfigured = isConfigured || (isConfirmed && value !== '');

  return (
    <Flex w={'full'} minW={0} alignItems={'center'} gap={1}>
      {showConfigured && !isEditing ? (
        <Flex
          flex={1}
          minW={0}
          borderRadius={'6px'}
          borderLeftRadius={borderLeftRadius}
          border={'0.5px solid'}
          borderColor={isInvalid ? 'red.500' : 'primary.200'}
          aria-invalid={isInvalid || undefined}
          bg={'primary.50'}
          h={h}
          px={3}
          alignItems={'center'}
          gap={1}
          opacity={isDisabled ? 0.6 : 1}
        >
          <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
          <Box fontSize={'sm'} fontWeight={'medium'} color={'primary.600'}>
            {t('common:had_auth_value')}
          </Box>
        </Flex>
      ) : (
        <Input
          {...inputProps}
          isInvalid={isInvalid}
          as={multiline ? 'textarea' : 'input'}
          {...(multiline ? { rows } : {})}
          flex={1}
          minW={0}
          h={multiline ? 'auto' : h}
          resize={multiline ? 'vertical' : undefined}
          borderLeftRadius={borderLeftRadius}
          type={multiline ? undefined : 'text'}
          autoFocus={isEditing}
          autoComplete="off"
          data-form-type="other"
          data-lpignore="true"
          isDisabled={isDisabled}
          value={isEditing ? draft : value}
          onChange={(event) => {
            if (isEditing) {
              setDraft(event.target.value);
            } else {
              onChange?.(event.target.value);
            }
          }}
        />
      )}
      {!isDisabled && (showConfigured || isEditing) && (
        <>
          <IconButton
            type="button"
            aria-label={isEditing ? t('common:Save') : t('common:Edit')}
            icon={<MyIcon name={isEditing ? 'check' : 'edit'} w={'16px'} />}
            size="sm"
            flexShrink={0}
            variant="ghost"
            color={'primary.600'}
            onClick={() => {
              if (isEditing) {
                onChange?.(draft);
                setIsConfirmed(draft !== '');
                setDraft(undefined);
              } else {
                // 不把已有明文或密文带入替换草稿，也不提前清除原值。
                setDraft('');
              }
            }}
          />
          {isEditing && (
            <IconButton
              type="button"
              aria-label={t('common:Close')}
              icon={<MyIcon name="close" w={'16px'} />}
              size="sm"
              flexShrink={0}
              variant="ghost"
              color={'myGray.500'}
              onClick={() => setDraft(undefined)}
            />
          )}
        </>
      )}
    </Flex>
  );
};

export default SecretValueInput;
