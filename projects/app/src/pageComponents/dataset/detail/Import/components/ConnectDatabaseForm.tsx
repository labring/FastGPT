/**
 * @file 连接数据库配置表单
 */
import React, { useState } from 'react';
import {
  Box,
  Flex,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Input,
  VStack,
  HStack,
  Text,
  Alert,
  AlertIcon,
  Spinner,
  ModalBody,
  Circle
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import FormBottomButtons from './FormBottomButtons';
import { useConnectionTest } from './hooks/useConnectTest';
import { databaseAddrValidator } from '../utils';

type DatabaseFormData = {
  dbType: string;
  host: string;
  port: string;
  dbName: string;
  username: string;
  password: string;
  connectionPoolSize: number;
};

const PORT_RANGE = [1, 65535];

const ConnectDatabaseConfig = () => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'success' | 'error' | null>(
    null
  );
  const [connectionMessage, setConnectionMessage] = useState('');

  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);
  const isEditMode = useContextSelector(DatasetImportContext, (v) => v.isEditMode);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<DatabaseFormData>({
    defaultValues: {
      dbType: 'MySQL',
      host: '',
      port: '',
      dbName: '',
      username: '',
      password: '',
      connectionPoolSize: 20
    }
  });

  const onSubmit = async (data: DatabaseFormData) => {
    setShowConnectionModal(true);
    setConnectionStatus('loading');
    setConnectionMessage('');
    try {
      const result = await testConnection(data);

      if (result.success) {
        setConnectionStatus('success');
        setConnectionMessage(t('dataset:reconnect_success'));

        // 延迟关闭弹窗并跳转
        setTimeout(() => {
          setShowConnectionModal(false);
          goToNext();
        }, 2000);
      } else {
        setConnectionStatus('success');
        setConnectionMessage(result.message || t('dataset:auth_failed'));
      }
    } catch (error) {
      setConnectionStatus('success');
      setConnectionMessage(t('dataset:connection_failed'));
    }
  };

  const { isConnecting, connectionError, connectionSuccess, testConnection } = useConnectionTest();

  const handleTestConnection = async () => {
    // const formData = getValues();
    await testConnection({});
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
          <VStack h={'100%'} justifyContent={'center'}>
            <Spinner size="lg" color="blue.500" thickness="4px" w={'48px'} h={'48px'} />
            <Text fontSize="sm" color="myGray.600">
              {t('dataset:reconnecting')}
            </Text>
          </VStack>
        );

      case 'success':
        return (
          <ModalBody display={'flex'} justifyContent={'center'} alignItems={'center'}>
            <Flex direction="column" h={'70px'} w="317px">
              <Flex mb={1} w={'100%'}>
                <Circle size="20px" bg="green.500" color="white" mt={0.5}>
                  <MyIcon name="check" w="12px" h="12px" />
                </Circle>
                <Box fontSize="16px" fontWeight="medium" color="myGray.900" ml={1}>
                  {t('dataset:reconnect_success_detail')}
                </Box>
              </Flex>
              <Text fontSize="14px" color="myGray.600" pl={6}>
                {t('dataset:table_changes_notice', { changedCount: 2, deletedCount: 2 })}
                <Text as="span" color="blue.500" cursor="pointer" textDecoration="underline" ml={1}>
                  {t('dataset:data_config')}
                </Text>
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

  return (
    <Box w="full" maxW="800px" mx="auto" p={2}>
      {/* Edit Mode Warning Banner */}
      {isEditMode && (
        <Alert status="warning" borderRadius="md" mb={4}>
          <AlertIcon />
          <Text fontSize="sm">{t('dataset:edit_database_warning')}</Text>
        </Alert>
      )}

      {/* Form */}
      <VStack spacing={6} align="stretch">
        {/* Database Type */}
        {!isEditMode && (
          <FormControl isRequired>
            <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900" mb={3}>
              {t('dataset:database_type')}
            </FormLabel>
            <Box
              border="1px solid"
              borderColor="blue.200"
              borderRadius="md"
              p={3}
              bg="blue.50"
              cursor="pointer"
            >
              <HStack spacing={3}>
                <Flex
                  w={'18px'}
                  h={'18px'}
                  borderWidth={'1px'}
                  borderColor={'primary.600'}
                  bg={'primary.1'}
                  borderRadius={'50%'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <Box w={'5px'} h={'5px'} borderRadius={'50%'} bg={'primary.600'}></Box>
                </Flex>
                <MyIcon name="mysql" w="40px" h="40px" color="blue.500" />
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="myGray.900">
                    MySQL
                  </Text>
                  <Text fontSize="xs" color="myGray.600">
                    {t('dataset:mysql_description')}
                  </Text>
                </Box>
              </HStack>
            </Box>
          </FormControl>
        )}

        {/* Database Host */}
        <FormControl isRequired isInvalid={!!errors.host}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_host')}
          </FormLabel>
          <Input
            placeholder={t('dataset:host_placeholder')}
            bg="myGray.50"
            {...register('host', {
              required: t('dataset:host_required'),
              validate: databaseAddrValidator
            })}
          />
          <Text fontSize="xs" color="myGray.500" mt={1}>
            {t('dataset:host_tips')}
          </Text>
          {errors.host && <FormErrorMessage>{errors.host.message}</FormErrorMessage>}
        </FormControl>

        {/* Port */}
        <FormControl isRequired isInvalid={!!errors.port}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:port')}
          </FormLabel>
          <Input
            placeholder="3306"
            bg="myGray.50"
            {...register('port', {
              required: t('dataset:port_required'),
              validate: (val) => {
                const number = Number(val);
                if (typeof number !== 'number' || isNaN(number)) {
                  return t('dataset:port_invalid');
                }
                return number >= PORT_RANGE[0] && number <= PORT_RANGE[1]
                  ? true
                  : t('dataset:port_range_error');
              }
            })}
          />
          {errors.port && <FormErrorMessage>{errors.port.message}</FormErrorMessage>}
        </FormControl>

        {/* Database Name */}
        <FormControl isRequired isInvalid={!!errors.dbName}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_name')}
          </FormLabel>
          <Input
            placeholder={t('dataset:database_name_placeholder')}
            bg="myGray.50"
            {...register('dbName', {
              required: t('dataset:database_name_required')
            })}
          />
          {errors.dbName && <FormErrorMessage>{errors.dbName.message}</FormErrorMessage>}
        </FormControl>

        {/* Username */}
        <FormControl isRequired isInvalid={!!errors.username}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_username')}
          </FormLabel>
          <Input
            placeholder={t('dataset:username_placeholder')}
            bg="myGray.50"
            {...register('username', {
              required: t('dataset:username_required')
            })}
          />
          {errors.username && <FormErrorMessage>{errors.username.message}</FormErrorMessage>}
        </FormControl>

        {/* Password */}
        <FormControl isRequired isInvalid={!!errors.password}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_password')}
          </FormLabel>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder={t('dataset:password_placeholder')}
            bg="myGray.50"
            {...register('password', {
              required: t('dataset:password_required')
            })}
          />
          {errors.password && <FormErrorMessage>{errors.password.message}</FormErrorMessage>}
        </FormControl>

        {/* Connection Pool Size */}
        <FormControl isRequired isInvalid={!!errors.connectionPoolSize}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:connection_pool_size')}
          </FormLabel>
          <Input
            type="number"
            placeholder="20"
            bg="myGray.50"
            {...register('connectionPoolSize', {
              required: t('dataset:connection_pool_required'),
              min: {
                value: 1,
                message: t('dataset:connection_pool_min_error')
              },
              max: {
                value: 100,
                message: t('dataset:connection_pool_max_error')
              }
            })}
          />
          {errors.connectionPoolSize && (
            <FormErrorMessage>{errors.connectionPoolSize.message}</FormErrorMessage>
          )}
        </FormControl>
        <FormBottomButtons
          isEditMode={isEditMode}
          isConnecting={isConnecting}
          connectionError={connectionError}
          connectionSuccess={connectionSuccess}
          onTestConnection={handleTestConnection}
          onConnectAndNext={handleSubmit(onSubmit)}
        />
      </VStack>

      {/* Connection Status Modal */}
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
    </Box>
  );
};

export default ConnectDatabaseConfig;
