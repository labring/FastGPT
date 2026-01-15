/**
 * @file 连接数据库配置表单
 */
import React, { useState, useEffect } from 'react';
import { Box, Flex, Input, VStack, HStack, Text, Alert } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import FormBottomButtons from './FormBottomButtons';
import { databaseAddrValidator } from '../utils';
import type { DatabaseConfig } from '@fastgpt/global/core/dataset/type';
import { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyInput from '@/components/MyInput';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import DatabaseTypeSelector from './DatabaseTypeSelector';
import { getDatabaseTypeConfig, getDefaultPort } from './databaseTypeConfig';

export type DatabaseFormData = {
  clientType: DatabaseConfig['clientType'];
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolSize: number;
  // PostgreSQL / MSSQL / Oracle specific
  schema?: string;
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
    clientType: databaseConfig?.clientType || DatabaseTypeEnum.mysql,
    host: databaseConfig?.host || '',
    port:
      databaseConfig?.port || getDefaultPort(databaseConfig?.clientType || DatabaseTypeEnum.mysql),
    database: databaseConfig?.database || '',
    user: databaseConfig?.user || '',
    password: databaseConfig?.password || '',
    poolSize: databaseConfig?.poolSize || 20,
    // PostgreSQL / MSSQL / Oracle specific
    schema: (databaseConfig as any)?.schema || ''
  };

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    control,
    setValue,
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
          clientType: databaseConfig?.clientType || DatabaseTypeEnum.mysql,
          host: databaseConfig?.host || '',
          port:
            databaseConfig?.port ||
            getDefaultPort(databaseConfig?.clientType || DatabaseTypeEnum.mysql),
          database: databaseConfig?.database || '',
          user: databaseConfig?.user || '',
          password: databaseConfig?.password || '',
          poolSize: databaseConfig?.poolSize || 20,
          schema: (databaseConfig as any)?.schema || ''
        };
        reset(defaultValues);
      });
    }
  }, []);

  const formData = watch();
  const currentClientType = watch('clientType');
  const currentTypeConfig = getDatabaseTypeConfig(currentClientType);

  // Handle database type change - update port and default database
  const handleDatabaseTypeChange = (type: DatabaseTypeEnum) => {
    setValue('clientType', type);
    setValue('port', getDefaultPort(type));
    // Oracle 默认数据库名为 XEPDB1
    const typeConfig = getDatabaseTypeConfig(type);
    if (typeConfig?.defaultDatabase && !getValues('database')) {
      setValue('database', typeConfig.defaultDatabase);
    }
  };

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
        <Box>
          <FormLabel required fontSize="14px" fontWeight="medium" color="myGray.900" mb={4}>
            {t('dataset:database_type')}
          </FormLabel>
          {isEditMode ? (
            <Box>
              <Flex alignItems="center">
                <MyIcon
                  name={currentTypeConfig?.icon as any}
                  w="16px"
                  h="16px"
                  mr={1}
                  flexShrink={0}
                />
                <Text fontSize="sm" color="#24282C" lineHeight="20px">
                  {currentTypeConfig?.name}
                </Text>
              </Flex>
            </Box>
          ) : (
            <Controller
              name="clientType"
              control={control}
              render={({ field }) => (
                <DatabaseTypeSelector
                  value={field.value}
                  onChange={handleDatabaseTypeChange}
                  isDisabled={isEditMode}
                />
              )}
            />
          )}
        </Box>

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
                placeholder={String(getDefaultPort(currentClientType))}
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

        {/* Database Name / Oracle ServiceName */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:database_name')}
            {currentTypeConfig?.databaseTooltipKey && (
              <QuestionTip label={t(currentTypeConfig.databaseTooltipKey)} />
            )}
          </FormLabel>
          <Input
            placeholder={
              currentTypeConfig?.databasePlaceholderKey
                ? t(currentTypeConfig.databasePlaceholderKey) || ''
                : ''
            }
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
            maxLength={255}
            isInvalid={!!errors.password}
            {...register('password', {
              required: true
            })}
          />
        </Box>

        {/* Schema - for PostgreSQL, MSSQL, Oracle */}
        {currentTypeConfig?.hasSchema && (
          <Box>
            <FormLabel mb={1}>
              {t('dataset:database_schema')}
              <QuestionTip
                label={t(currentTypeConfig?.schemaTooltipKey || 'dataset:database_schema_tooltip')}
              />
            </FormLabel>
            <Input
              placeholder={
                t(
                  currentTypeConfig?.schemaPlaceholderKey || 'dataset:database_schema_placeholder'
                ) || ''
              }
              {...register('schema')}
            />
          </Box>
        )}

        {/* Connection Pool Size */}
        <Box>
          <FormLabel required mb={1}>
            {t('dataset:connection_pool_size')}
            <QuestionTip label={t('dataset:connection_pool_size_tooltip')} />
          </FormLabel>
          <Box
            css={{
              '& > span': {
                display: 'block'
              }
            }}
          >
            <MyTooltip label={t('dataset:connection_pool_range_tip')}>
              <Input
                type="number"
                placeholder="20"
                isInvalid={!!errors.poolSize}
                {...register('poolSize', {
                  required: true,
                  min: 1,
                  max: 100,
                  valueAsNumber: true,
                  validate: (value) => Number.isInteger(value)
                })}
              />
            </MyTooltip>
          </Box>
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
