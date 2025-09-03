import React, { useMemo } from 'react';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface FormBottomButtonsProps {
  isEditMode?: boolean;
  isLoading?: boolean;
  isConnecting?: boolean;
  connectionError?: string;
  connectionSuccess?: boolean;
  onTestConnection: () => void;
  onConnectAndNext: () => void;
  disabled?: boolean;
}

const FormBottomButtons: React.FC<FormBottomButtonsProps> = ({
  isEditMode = false,
  isLoading = false,
  isConnecting = false,
  connectionError,
  connectionSuccess = false,
  onTestConnection,
  onConnectAndNext,
  disabled = false
}) => {
  const { t } = useTranslation();

  const editModeBtns = useMemo(
    () => (
      <>
        <HStack justifyContent={'flex-end'}>
          {connectionError && (
            <>
              <MyIcon w="16px" h="16px" name="common/circleAlert" />
              <Box>{connectionError}</Box>
            </>
          )}
          <Flex>
            <Button
              variant="outline"
              colorScheme="gray"
              isLoading={isLoading || isConnecting}
              loadingText={t('dataset:connecting')}
              onClick={onConnectAndNext}
              px={3}
              mr={4}
            >
              {t('dataset:test_connectivity')}
            </Button>
            <Button
              isLoading={isLoading || isConnecting}
              colorScheme="blue"
              onClick={onConnectAndNext}
              px={6}
            >
              {t('dataset:confirm')}
            </Button>
          </Flex>
        </HStack>
      </>
    ),
    [connectionError, onConnectAndNext, t, isConnecting, isLoading]
  );

  const createModeBtns = useMemo(() => {
    return (
      <HStack justifyContent={'flex-end'}>
        {connectionError && (
          <>
            <MyIcon w="16px" h="16px" name="common/circleAlert" />
            <Box>{connectionError}</Box>
          </>
        )}
        <Button
          colorScheme="blue"
          onClick={onConnectAndNext}
          isLoading={isLoading || isConnecting}
          loadingText={t('dataset:connecting')}
          disabled={disabled}
          size="md"
        >
          {t('dataset:connect_and_next')}
        </Button>
      </HStack>
    );
  }, [onConnectAndNext, isLoading, isConnecting, disabled, t, connectionError]);

  return isEditMode ? editModeBtns : createModeBtns;
};

export default FormBottomButtons;
