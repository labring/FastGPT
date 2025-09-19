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
  Alert
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import FormBottomButtons from './FormBottomButtons';
import { databaseAddrValidator } from '../utils';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

export type DatabaseFormData = {
  client: DatabaseConfig['client'];
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize: number;
};

const PORT_RANGE = [1, 65535];

const ConnectDatabaseConfig = () => {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);
  const setCurrentTab = useContextSelector(DatasetImportContext, (v) => v.setTab);
  const isEditMode = useContextSelector(DatasetImportContext, (v) => v.isEditMode);
  const datasetId = useContextSelector(DatasetImportContext, (v) => v.datasetId);
  const databaseConfig = useContextSelector(
    DatasetPageContext,
    (v) => v.datasetDetail?.databaseConfig
  );

  const defaultValues = {
    client: databaseConfig?.client || 'mysql',
    host: databaseConfig?.host || '',
    port: databaseConfig?.port || 3306,
    database: databaseConfig?.database || '',
    user: databaseConfig?.user || '',
    password: databaseConfig?.password || '',
    poolSize: databaseConfig?.poolSize || 20
  };

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors, isValid }
  } = useForm<DatabaseFormData>({
    defaultValues
  });

  const formData = watch();

  const handleSuccess = () => {
    console.log(goToNext);
    !isEditMode ? goToNext() : setCurrentTab(1);
  };

  return (
    <Box w="full" maxW="800px" mx="auto" p={2}>
      {/* Edit Mode Warning Banner */}
      {isEditMode && (
        <Alert status="warning" borderRadius="md" mb={4} py={3} px={4} bgColor={'yellow.50'}>
          <HStack>
            <MyIcon name="common/info" w={4} h={4} color="yellow.500"></MyIcon>
            <Text color="myGray.600" fontSize="sm">
              {t('dataset:edit_database_warning')}
            </Text>
          </HStack>
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
            type="number"
            placeholder="3306"
            bg="myGray.50"
            {...register('port', {
              required: t('dataset:port_required'),
              valueAsNumber: true,
              validate: (val) => {
                if (typeof val !== 'number' || isNaN(val)) {
                  return t('dataset:port_invalid');
                }
                return val >= PORT_RANGE[0] && val <= PORT_RANGE[1]
                  ? true
                  : t('dataset:port_range_error');
              }
            })}
          />
          {errors.port && <FormErrorMessage>{errors.port.message}</FormErrorMessage>}
        </FormControl>

        {/* Database Name */}
        <FormControl isRequired isInvalid={!!errors.database}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_name')}
          </FormLabel>
          <Input
            placeholder={t('dataset:database_name_placeholder')}
            bg="myGray.50"
            {...register('database', {
              required: t('dataset:database_name_required')
            })}
          />
          {errors.database && <FormErrorMessage>{errors.database.message}</FormErrorMessage>}
        </FormControl>

        {/* Username */}
        <FormControl isRequired isInvalid={!!errors.user}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:database_username')}
          </FormLabel>
          <Input
            placeholder={t('dataset:username_placeholder')}
            bg="myGray.50"
            {...register('user', {
              required: t('dataset:username_required')
            })}
          />
          {errors.user && <FormErrorMessage>{errors.user.message}</FormErrorMessage>}
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
        <FormControl isRequired isInvalid={!!errors.poolSize}>
          <FormLabel fontSize="14px" fontWeight="medium" color="myGray.900">
            {t('dataset:connection_pool_size')}
          </FormLabel>
          <Input
            type="number"
            placeholder="20"
            bg="myGray.50"
            {...register('poolSize', {
              required: t('dataset:connection_pool_required'),
              valueAsNumber: true,
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
          {errors.poolSize && <FormErrorMessage>{errors.poolSize.message}</FormErrorMessage>}
        </FormControl>
        <FormBottomButtons
          isEditMode={isEditMode}
          disabled={!isValid}
          formData={formData}
          datasetId={datasetId}
          onSuccess={handleSuccess}
          originalConfig={defaultValues}
        />
      </VStack>
    </Box>
  );
};

export default ConnectDatabaseConfig;
