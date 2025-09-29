import React, { useMemo, useState, useCallback } from 'react';
import { Box, Button, Flex, HStack, ModalBody, VStack, Text, Spinner } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  updateDatasetConfig,
  postCheckDatabaseConnection,
  postDetectDatabaseChanges
} from '@/web/core/dataset/api';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import type { DatabaseFormData } from './ConnectDatabaseForm';
import type { DetectChangesResponse } from '@fastgpt/global/core/dataset/database/api.d';
import { useToast } from '@fastgpt/web/hooks/useToast';

interface ConnectionTestResult {
  success: boolean;
  message: string;
}

interface DatabaseChangesInfo {
  hasChanges: boolean;
  addedTables: number;
  modifiedTables: number;
  deletedTables: number;
}

interface FormBottomButtonsProps {
  isEditMode?: boolean;
  disabled?: boolean;
  formData: DatabaseFormData;
  datasetId: string;
  onSuccess?: (isGoNext?: boolean) => void;
  originalConfig?: DatabaseFormData;
  beforeSubmit: (successCb: any) => any;
}

const iconMap = {
  success: {
    icon: 'checkCircle',
    color: 'green.600'
  },
  fail: {
    icon: 'common/error',
    color: 'red.600'
  }
};

const FormBottomButtons: React.FC<FormBottomButtonsProps> = ({
  isEditMode = false,
  disabled = false,
  formData,
  datasetId,
  onSuccess,
  originalConfig,
  beforeSubmit
}) => {
  const { t } = useTranslation();
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'success' | 'error' | null>(
    null
  );
  const [connectionMessage, setConnectionMessage] = useState('');

  // 连接测试状态
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult>({
    success: false,
    message: ''
  });

  // 数据库变更信息状态
  const [databaseChanges, setDatabaseChanges] = useState<DatabaseChangesInfo>({
    hasChanges: false,
    addedTables: 0,
    modifiedTables: 0,
    deletedTables: 0
  });

  // 检查是否有关键配置变更（除了连接池大小）
  const hasKeyConfigChanges = useMemo(() => {
    if (!isEditMode || !originalConfig) return false;

    return (
      formData.host !== originalConfig.host ||
      formData.port !== originalConfig.port ||
      formData.database !== originalConfig.database ||
      formData.user !== originalConfig.user ||
      formData.password !== originalConfig.password
    );
  }, [isEditMode, formData, originalConfig]);

  // 检查是否只有连接池大小变更
  const isOnlyPoolSizeChange = useMemo(() => {
    if (!isEditMode || !originalConfig) return false;

    const hasPoolSizeChange = formData.poolSize !== originalConfig.poolSize;
    return hasPoolSizeChange && !hasKeyConfigChanges;
  }, [isEditMode, formData, originalConfig, hasKeyConfigChanges]);

  const isModifyData = useMemo(
    () => !isEditMode || isOnlyPoolSizeChange || hasKeyConfigChanges,
    [isOnlyPoolSizeChange, hasKeyConfigChanges, isEditMode]
  );

  const formDataString = useMemo(() => JSON.stringify(formData), [formData]);

  const { toast } = useToast();

  React.useEffect(() => {
    if (connectionTest.message || connectionTest.success) {
      setConnectionTest({
        success: false,
        message: ''
      });
    }
    connectionMessage && setConnectionMessage('');
  }, [formDataString]);

  // 连接测试请求
  const { runAsync: testConnection, loading: isConnecting } = useRequest2(
    async () => {
      const databaseConfig: DatabaseConfig = {
        client: 'mysql',
        host: formData.host,
        port: formData.port,
        database: formData.database,
        user: formData.user,
        password: formData.password,
        poolSize: formData.poolSize
      };

      return await postCheckDatabaseConnection({
        datasetId,
        databaseConfig
      });
    },
    {
      onSuccess(res: any) {
        setConnectionTest({
          success: true,
          message: t('dataset:connection_success')
        });
      },
      onError(res: any) {
        setConnectionTest({
          success: false,
          message: t(res?.message) || t('dataset:connection_failed')
        });
      },
      errorToast: ''
    }
  );

  // 提交表单请求
  const { runAsync: onSubmitForm, loading: isSubmitting } = useRequest2(
    async (data: any) => {
      const databaseConfig: DatabaseConfig = {
        client: 'mysql',
        host: data.host,
        port: data.port,
        database: data.database,
        user: data.user,
        password: data.password,
        poolSize: data.poolSize
      };

      await updateDatasetConfig({
        id: datasetId,
        databaseConfig
      });

      // 如果有关键配置变更，需要检测数据库变更
      if (hasKeyConfigChanges) {
        return await postDetectDatabaseChanges({ datasetId });
      }
    },
    {
      onSuccess(res: DetectChangesResponse | undefined) {
        onSuccess?.(!isEditMode);
        if (!res) {
          if (isOnlyPoolSizeChange || !isModifyData) {
            toast({
              title: t('common:save_success'),
              status: 'success'
            });
            return;
          }
          setConnectionStatus('success');
          setConnectionMessage(t('dataset:reconnect_success'));
          return;
        }

        const { hasChanges, summary } = res;

        // 存储数据库变更信息
        const changesInfo: DatabaseChangesInfo = {
          hasChanges,
          addedTables: summary?.addedTables || 0,
          modifiedTables: summary?.modifiedTables || 0,
          deletedTables: summary?.deletedTables || 0
        };
        setDatabaseChanges(changesInfo);

        setConnectionStatus('success');
        setConnectionMessage(t('dataset:reconnect_success'));
      },
      onError(error) {
        setConnectionStatus('error');
        setConnectionMessage(error.message || t('dataset:connection_failed'));
      },
      errorToast: ''
    }
  );

  const handleConnectAndNext = async (data: any) => {
    if (hasKeyConfigChanges && isEditMode) {
      setShowConnectionModal(true);
      setConnectionStatus('loading');
      setConnectionMessage('');
    }

    await onSubmitForm(formData);
  };

  const handleCloseModal = () => {
    setShowConnectionModal(false);
    setConnectionStatus(null);
    setConnectionMessage('');
  };

  const renderModalContent = () => {
    switch (connectionStatus) {
      case 'loading':
        return (
          <VStack h={'100%'} justifyContent={'center'} alignItems={'center'}>
            <Spinner
              size="lg"
              emptyColor="gray.200"
              color="blue.500"
              thickness="4px"
              w={'48px'}
              h={'48px'}
            />
            <Text fontSize="12px" color="myGray.500">
              {t('dataset:reconnecting')}
            </Text>
          </VStack>
        );

      case 'success':
        const getSubTitle = () => {
          if (!databaseChanges.hasChanges) {
            return '';
          }

          const { modifiedTables, deletedTables } = databaseChanges;

          // 既有列变更又有表删除
          if (modifiedTables > 0 && deletedTables > 0) {
            return (
              t('dataset:tables_modified_and_deleted', {
                modifiedTables,
                deletedTables
              }) + t('dataset:please_check_latest_data')
            );
          }

          // 只有列变更
          if (modifiedTables > 0) {
            return (
              t('dataset:tables_modified', {
                modifiedTables
              }) + t('dataset:please_check_latest_data')
            );
          }

          // 只有表删除
          if (deletedTables > 0) {
            return (
              t('dataset:tables_deleted', {
                deletedTables
              }) + t('dataset:please_check_latest_data')
            );
          }
        };

        return (
          <ModalBody display={'flex'} justifyContent={'center'} alignItems={'center'}>
            <Flex direction="column" w="317px">
              <Flex mb={1} w={'100%'}>
                <MyIcon name="core/workflow/runSuccess" w={6} h={6} mr={3} />
                <Box fontSize="16px" fontWeight="medium" color="myGray.900">
                  {t('dataset:reconnect_success')}
                </Box>
              </Flex>
              <Text fontSize="14px" color="myGray.600" pl={9}>
                {getSubTitle()}
                {databaseChanges.hasChanges && (
                  <Text
                    as="span"
                    color="primary.500"
                    cursor="pointer"
                    ml={1}
                    onClick={() => {
                      onSuccess?.();
                    }}
                  >
                    {t('dataset:data_config')}
                  </Text>
                )}
              </Text>
            </Flex>
          </ModalBody>
        );

      case 'error':
        return (
          <ModalBody display={'flex'} justifyContent={'center'} alignItems={'center'}>
            <Flex direction="column" w="317px">
              <Flex mb={1} w={'100%'}>
                <MyIcon name="core/workflow/runError" w={6} h={6} mr={3} />
                <Box fontSize="16px" fontWeight="medium" color="myGray.900">
                  {t('dataset:connection_failed')}
                </Box>
              </Flex>
              <Text fontSize="14px" color="myGray.600" pl={9}>
                {t(connectionMessage)}
              </Text>
            </Flex>
          </ModalBody>
        );

      default:
        return null;
    }
  };

  const editModeBtns = useMemo(() => {
    const { icon, color } = iconMap[connectionTest.success ? 'success' : 'fail'];
    return (
      <>
        <HStack justifyContent={'flex-end'}>
          {connectionTest.message && (
            <>
              <MyIcon w={6} h={6} name={icon as any} color={color} />
              <Box color="black">{connectionTest.message}</Box>
            </>
          )}
          <Flex>
            <Button
              variant="outline"
              colorScheme="gray"
              isLoading={isConnecting}
              disabled={isSubmitting || isConnecting}
              loadingText={t('dataset:connecting')}
              onClick={beforeSubmit(() => testConnection())}
              px={3}
              mr={4}
            >
              {t('dataset:test_connectivity')}
            </Button>
            <Button
              isLoading={isSubmitting}
              colorScheme="blue"
              disabled={isSubmitting || isConnecting}
              onClick={beforeSubmit(handleConnectAndNext)}
              px={6}
            >
              {t('dataset:confirm')}
            </Button>
          </Flex>
        </HStack>
      </>
    );
  }, [connectionTest, handleConnectAndNext, t, isConnecting, isSubmitting, testConnection]);

  const createModeBtns = useMemo(() => {
    return (
      <>
        <HStack justifyContent={'flex-end'}>
          {connectionMessage && (
            <>
              <MyIcon w={4} h={4} name="common/circleAlert" />
              <Box color="black">{t(connectionMessage)}</Box>
            </>
          )}
          <Button
            colorScheme="blue"
            onClick={beforeSubmit(handleConnectAndNext)}
            isLoading={isSubmitting || isConnecting}
            loadingText={t('dataset:connecting')}
            disabled={isSubmitting || isConnecting}
            size="md"
          >
            {t('dataset:connect_and_next')}
          </Button>
        </HStack>
      </>
    );
  }, [handleConnectAndNext, isSubmitting, isConnecting, disabled, t, connectionTest]);

  return (
    <>
      {isEditMode ? editModeBtns : createModeBtns}

      {/* Connection Status Modal - Only show in edit mode with key config changes */}
      {isEditMode && hasKeyConfigChanges && (
        <MyModal
          isOpen={showConnectionModal}
          onClose={connectionStatus === 'loading' ? undefined : handleCloseModal}
          title={t('dataset:reconnect_database')}
          iconSrc="core/dataset/datasetLight"
          iconColor="primary.600"
          size="md"
          w="500px"
          h="300px"
          closeOnOverlayClick={connectionStatus !== 'loading'}
          showCloseButton={connectionStatus !== 'loading'}
        >
          {renderModalContent()}
        </MyModal>
      )}
    </>
  );
};

export default FormBottomButtons;
