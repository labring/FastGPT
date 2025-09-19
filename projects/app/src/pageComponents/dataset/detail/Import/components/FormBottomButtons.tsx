import React, { useMemo, useState, useCallback } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  ModalBody,
  VStack,
  Text,
  Spinner,
  Circle
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
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
import type { DetectChangesResponse } from '@/pages/api/core/dataset/database/detectChanges';

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
  onSuccess?: () => void;
  originalConfig?: DatabaseFormData;
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
  originalConfig
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

  React.useEffect(() => {
    if (connectionTest.message || connectionTest.success) {
      setConnectionTest({
        success: false,
        message: ''
      });
    }
  }, [formData]);

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
          success: res?.success || false,
          message: res?.message || t('连接成功')
        });
      }
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

      // 如果只是连接池大小变更，不需要检测数据库变更
      if (!isEditMode || isOnlyPoolSizeChange) {
        return await updateDatasetConfig({
          id: datasetId,
          databaseConfig
        });
      }

      // 如果有关键配置变更，需要检测数据库变更
      if (hasKeyConfigChanges) {
        return await postDetectDatabaseChanges({ datasetId });
      }
    },
    {
      onSuccess(res: DetectChangesResponse | undefined) {
        if (!res) {
          if (isOnlyPoolSizeChange) {
            // 只是连接池变更，直接成功回调
            onSuccess?.();
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
      }
    }
  );

  const handleConnectAndNext = useCallback(async () => {
    if (!isEditMode || isOnlyPoolSizeChange) {
      await onSubmitForm(formData);
    } else if (hasKeyConfigChanges) {
      setShowConnectionModal(true);
      setConnectionStatus('loading');
      setConnectionMessage('');
      await onSubmitForm(formData);
    }

    !isEditMode && onSuccess?.();
  }, [isEditMode, formData, onSubmitForm, isOnlyPoolSizeChange, hasKeyConfigChanges, onSuccess]);

  const handleCloseModal = () => {
    setShowConnectionModal(false);
    setConnectionStatus(null);
    setConnectionMessage('');
  };

  const renderModalContent = () => {
    switch (connectionStatus) {
      case 'loading':
        return (
          <VStack h={'100%'} justifyContent={'center'}>
            <Spinner size="lg" color="blue.500" thickness="4px" w={'48px'} h={'48px'} />
            <Text fontSize="sm" color="myGray.600">
              {t('dataset:reconnecting')}
            </Text>
          </VStack>
        );

      case 'success':
        const getSubTitle = () => {
          if (!databaseChanges.hasChanges) {
            return t('未出现信息变更');
          }

          const parts = [];
          if (databaseChanges.addedTables > 0) {
            parts.push(
              t('新增 {{addedTables}} 个数据表', { addedTables: databaseChanges.addedTables })
            );
          }
          if (databaseChanges.modifiedTables > 0) {
            parts.push(
              t('{{modifiedTables}} 个数据表存在列的变更', {
                modifiedTables: databaseChanges.modifiedTables
              })
            );
          }
          if (databaseChanges.deletedTables > 0) {
            parts.push(
              t('{{deletedTables}} 个数据表已不存在', {
                deletedTables: databaseChanges.deletedTables
              })
            );
          }

          if (parts.length > 0) {
            parts.push(t('请核查最新数据。'));
          }

          return t('发现') + parts.join('，');
        };

        return (
          <ModalBody display={'flex'} justifyContent={'center'} alignItems={'center'}>
            <Flex direction="column" h={'70px'} w="317px">
              <Flex mb={1} w={'100%'}>
                <Circle size="20px" bg="green.500" color="white" mt={0.5}>
                  <MyIcon name="check" w="12px" h="12px" />
                </Circle>
                <Box fontSize="16px" fontWeight="medium" color="myGray.900" ml={1}>
                  {t('dataset:reconnect_success')}
                </Box>
              </Flex>
              <Text fontSize="14px" color="myGray.600" pl={6}>
                {getSubTitle()}
                {databaseChanges.hasChanges && (
                  <Text
                    as="span"
                    color="blue.500"
                    cursor="pointer"
                    textDecoration="underline"
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
            <Flex direction="column" h={'70px'} w="317px">
              <Flex mb={1} w={'100%'}>
                <Circle size="20px" bg="red.500" color="white" mt={0.5}>
                  <CloseIcon boxSize={2.5} />
                </Circle>
                <Box fontSize="16px" fontWeight="medium" color="myGray.900" ml={1}>
                  {t('dataset:connection_failed')}
                </Box>
              </Flex>
              <Text fontSize="14px" color="myGray.600" pl={6}>
                {t('dataset:auth_failed')}
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
    console.log(connectionTest);
    return (
      <>
        <HStack justifyContent={'flex-end'}>
          {connectionTest.message && (
            <>
              <MyIcon w="16px" h="16px" name={icon as any} color={color} />
              <Box>{connectionTest.message}</Box>
            </>
          )}
          <Flex>
            <Button
              variant="outline"
              colorScheme="gray"
              isLoading={isConnecting}
              disabled={isSubmitting || isConnecting}
              loadingText={t('dataset:connecting')}
              onClick={testConnection}
              px={3}
              mr={4}
            >
              {t('dataset:test_connectivity')}
            </Button>
            <Button
              isLoading={isSubmitting}
              colorScheme="blue"
              disabled={isSubmitting || isConnecting || !isModifyData}
              onClick={handleConnectAndNext}
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
          {!connectionTest.success && connectionTest.message && (
            <>
              <MyIcon w="16px" h="16px" name="common/circleAlert" />
              <Box>{connectionTest.message}</Box>
            </>
          )}
          <Button
            colorScheme="blue"
            onClick={handleConnectAndNext}
            isLoading={isSubmitting || isConnecting}
            loadingText={t('dataset:connecting')}
            disabled={disabled || isSubmitting || isConnecting}
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
          iconSrc="/imgs/modal/database.svg"
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
