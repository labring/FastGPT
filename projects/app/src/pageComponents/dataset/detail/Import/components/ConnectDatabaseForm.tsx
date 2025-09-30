/**
 * @file 连接数据库配置表单
 */
import React, { useState, useEffect } from 'react';
import { Box, Flex, Input, VStack, HStack, Text, Alert } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import FormBottomButtons from './FormBottomButtons';
import { databaseAddrValidator } from '../utils';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyInput from '@/components/MyInput';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

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
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
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
    reset,
    formState: { errors, isValid }
  } = useForm<DatabaseFormData>({
    defaultValues,
    mode: 'onChange'
  });

  // 页面加载时重新执行一次loadDatasetDetail
  useEffect(() => {
    if (loadDatasetDetail) {
      loadDatasetDetail(datasetId).then((res) => {
        const databaseConfig = res.databaseConfig;
        const defaultValues = {
          client: databaseConfig?.client || 'mysql',
          host: databaseConfig?.host || '',
          port: databaseConfig?.port || 3306,
          database: databaseConfig?.database || '',
          user: databaseConfig?.user || '',
          password: databaseConfig?.password || '',
          poolSize: databaseConfig?.poolSize || 20
        };
        reset(defaultValues);
      });
    }
  }, []);

  const formData = watch();

  const handleSuccess = async (isGoNext = true) => {
    if (isGoNext) {
      !isEditMode ? goToNext() : setCurrentTab(1);
    }
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
          <Box>
            <FormLabel required fontSize="14px" fontWeight="medium" color="myGray.900" mb={4}>
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
          </Box>
        )}

        {/* Database Host */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:database_host')}
          </FormLabel>
          <Box
            css={{
              '& > span': {
                display: 'block'
              }
            }}
          >
            <MyTooltip label={t('dataset:database_host_tooltip')}>
              <Input
                placeholder={t('dataset:host_placeholder')}
                bg="myGray.50"
                isInvalid={Boolean(errors.host)}
                {...register('host', {
                  required: true,
                  validate: (v) => {
                    const res = databaseAddrValidator(v);
                    return res === true ? true : false;
                  }
                })}
              />
            </MyTooltip>
          </Box>
        </Box>

        {/* Port */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:port')}
          </FormLabel>
          <Box
            css={{
              '& > span': {
                display: 'block'
              }
            }}
          >
            <MyTooltip
              label={t('dataset:database_host_port_tip', {
                min: PORT_RANGE[0],
                max: PORT_RANGE[1]
              })}
            >
              <Input
                type="number"
                placeholder="3306"
                bg="myGray.50"
                isInvalid={Boolean(errors.port)}
                {...register('port', {
                  required: true,
                  min: PORT_RANGE[0],
                  max: PORT_RANGE[1],
                  valueAsNumber: true
                })}
              />
            </MyTooltip>
            {errors.port?.message}
          </Box>
        </Box>

        {/* Database Name */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:database_name')}
          </FormLabel>
          <Input
            bg="myGray.50"
            isInvalid={!!errors.database}
            {...register('database', {
              required: true
            })}
          />
        </Box>

        {/* Username */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:database_username')}
          </FormLabel>
          <Input
            bg="myGray.50"
            isInvalid={!!errors.user}
            {...register('user', {
              required: true
            })}
          />
        </Box>

        {/* Password */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:database_password')}
          </FormLabel>
          <MyInput
            rightIcon={
              <>
                <MyIcon
                  cursor={'pointer'}
                  onClick={() => setShowPassword((e) => !e)}
                  name={showPassword ? 'visible' : 'invisible'}
                  w={4}
                  h={4}
                ></MyIcon>
              </>
            }
            type={showPassword ? 'text' : 'password'}
            bg="myGray.50"
            maxLength={255}
            isInvalid={!!errors.password}
            {...register('password', {
              required: true
            })}
          />
        </Box>

        {/* Connection Pool Size */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:connection_pool_size')}
            <QuestionTip label={t('dataset:connection_pool_size_tooltip')} />
          </FormLabel>
          <MyNumberInput
            size={'sm'}
            isRequired
            min={1}
            max={100}
            step={1}
            isInvalid={!!errors.poolSize}
            register={register}
            name="poolSize"
          />
        </Box>
        <FormBottomButtons
          isEditMode={isEditMode}
          formData={formData}
          datasetId={datasetId}
          beforeSubmit={handleSubmit}
          onSuccess={handleSuccess}
          originalConfig={defaultValues}
        />
      </VStack>
    </Box>
  );
};

export default ConnectDatabaseConfig;
