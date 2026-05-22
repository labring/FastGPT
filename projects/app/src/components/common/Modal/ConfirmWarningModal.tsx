import React, { useState } from 'react';
import { Box, Button, Flex, HStack, type ButtonProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DeleteConfirmInput from '@fastgpt/web/components/common/DeleteConfirmInput';

type Props = {
  isOpen: boolean;
  title: React.ReactNode;
  content: React.ReactNode;
  onClose: () => void;
  onConfirm?: () => Promise<unknown> | unknown;
  confirmText?: React.ReactNode;
  cancelText?: React.ReactNode;
  showCancel?: boolean;
  confirmButtonVariant?: ButtonProps['variant'];
  inputConfirmText?: string;
};

const ConfirmWarningModal = ({
  isOpen,
  title,
  content,
  onClose,
  onConfirm,
  confirmText,
  cancelText,
  showCancel = true,
  confirmButtonVariant = 'primary',
  inputConfirmText
}: Props) => {
  const { t } = useTranslation();
  const [requesting, setRequesting] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const isInputConfirm = !!inputConfirmText;
  const isInputConfirmValid = !isInputConfirm || inputValue.trim() === inputConfirmText.trim();

  const handleClose = () => {
    setInputValue('');
    onClose();
  };

  return (
    <MyModal
      isOpen={isOpen}
      onClose={handleClose}
      isCentered
      size={'sm'}
      contentPx={'32px'}
      contentPy={'32px'}
      borderRadius={'10px'}
    >
      <Flex direction={'column'} gap={'24px'}>
        <HStack spacing={'12px'} align={'center'}>
          <Flex
            bg={'yellow.100'}
            borderRadius={'full'}
            p={'4px'}
            align={'center'}
            justify={'center'}
            flexShrink={0}
          >
            <MyIcon name={'common/exclamationMark'} w={'16px'} h={'16px'} color={'yellow.700'} />
          </Flex>
          <Box
            flex={'1 0 0'}
            minW={0}
            fontSize={'20px'}
            fontWeight={'500'}
            lineHeight={'26px'}
            color={'myGray.900'}
          >
            {title}
          </Box>
        </HStack>

        <Flex direction={'column'} gap={'16px'}>
          <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
            {content}
          </Box>
          {isInputConfirm && (
            <DeleteConfirmInput
              value={inputValue}
              confirmText={inputConfirmText}
              placeholder={inputConfirmText}
              onChange={setInputValue}
            />
          )}
        </Flex>

        <HStack spacing={'12px'} justify={'flex-end'}>
          {showCancel && (
            <Button
              size={'sm'}
              variant={'whiteBase'}
              onClick={handleClose}
              isDisabled={requesting}
              px={'14px'}
            >
              {cancelText ?? t('common:Cancel')}
            </Button>
          )}
          <Button
            size={'sm'}
            variant={confirmButtonVariant}
            isDisabled={!isInputConfirmValid}
            isLoading={requesting}
            px={'14px'}
            onClick={async () => {
              setRequesting(true);
              try {
                await onConfirm?.();
                handleClose();
              } catch (err) {
                console.error('[ConfirmWarningModal] onConfirm error:', err);
              }
              setRequesting(false);
            }}
          >
            {confirmText ?? t('common:Confirm')}
          </Button>
        </HStack>
      </Flex>
    </MyModal>
  );
};

export default React.memo(ConfirmWarningModal);
