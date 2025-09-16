/**
 * @file 数据库 - 数据配置
 */
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  VStack,
  HStack,
  Text,
  Checkbox,
  Switch,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Divider,
  Alert,
  UnorderedList,
  ListItem,
  Center,
  Link,
  useTheme
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import { useDataBaseConfig } from './hooks/useDataBaseConfig';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import IconTip from '@fastgpt/web/components/common/MyTooltip/IconTip';
import { ColumnStatusEnum, TableStatusEnum } from '@/web/core/dataset/temp.d';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { CurrentTableFormData } from './hooks/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTag from '@fastgpt/web/components/common/Tag/index';

const DataBaseConfig = () => {
  const { t } = useTranslation();
  const isEditMode = useContextSelector(DatasetImportContext, (v) => v.isEditMode);
  const datasetId = useContextSelector(DatasetImportContext, (v) => v.datasetId);

  const {
    register,
    getValues,
    setValue,
    handleSubmit,
    watch,
    reset,
    formState: { errors }
  } = useForm<CurrentTableFormData>({
    defaultValues: {
      description: '',
      columns: []
    }
  });

  const {
    currentTable,
    currentTableIndex,
    uiTables,
    tableInfos,
    loading,
    isCreating,
    changesSummary,
    problematicTableNames,
    handleTableSelect,
    handleChangeTab,
    handleChangeTableDesc,
    handleChangeColumnData,
    handleColumnToggle,
    onSubmit,
    tableChangeSummary,
    currentTableColumnChanges
  } = useDataBaseConfig(datasetId, isEditMode, { getValues, setValue, watch, reset });

  const [searchColumn, setSearchColumn] = useState('');
  const [searchTable, setSearchTable] = useState('');
  const theme = useTheme();

  // 计算属性
  const isOnlyRead = useMemo(() => {
    return !currentTable?.enabled;
  }, [currentTable?.enabled]);

  const showColumns = useMemo(() => {
    if (!currentTable) return [];
    return currentTable.columns.filter(
      (v) =>
        v.status !== ColumnStatusEnum.delete &&
        (!searchColumn || v.columnName.includes(searchColumn))
    );
  }, [searchColumn, currentTable]);

  const showTables = useMemo(() => {
    return tableInfos.filter(
      (tableInfo) =>
        tableInfo.tableData.status !== TableStatusEnum.delete &&
        (!searchTable || tableInfo.tableData.tableName.includes(searchTable))
    );
  }, [searchTable, tableInfos]);

  if (loading) {
    return <MyBox h="400px" isLoading={loading}></MyBox>;
  }

  if (!currentTable) {
    return (
      <Center h="400px">
        <Text color="myGray.600">{t('dataset:no_tables_found')}</Text>
      </Center>
    );
  }

  return (
    <Flex px={7} flexDirection={'column'} h="100%">
      {/* Edit Mode Warning Banner */}
      {isEditMode && tableChangeSummary.hasBannerTip && (
        <Alert bgColor={'yellow.50'} borderRadius="md" mb={4} color={'myGray.600'}>
          <Flex alignItems={'center'} fontSize="sm">
            <MyIcon name="common/info" w={4} h={4} color={'yellow.500'} mr={2} />
            <Text>{t('dataset:data_source_refreshed')}</Text>
            <Text>{t('dataset:found')}</Text>
            {tableChangeSummary.modifiedTables.count > 0 && (
              <Text>
                {t('dataset:tables_with_column_changes', {
                  modifiedTablesCount: tableChangeSummary.modifiedTables.count
                })}
              </Text>
            )}
            {tableChangeSummary.deletedTables.count > 0 && (
              <Text>
                <MyTooltip
                  label={
                    <>
                      {tableChangeSummary.deletedTables.tableNames.map((v) => (
                        <Text color={'gray.900'} key={v}>
                          {v}
                        </Text>
                      ))}
                    </>
                  }
                >
                  <Link>{tableChangeSummary.deletedTables.count}</Link>
                </MyTooltip>
                {t('dataset:tables_not_exist')}
              </Text>
            )}
            <Text>{t('dataset:please_check_latest_data')}</Text>
          </Flex>
        </Alert>
      )}

      {!isEditMode && (
        <Flex fontSize="14px" fontWeight="medium" color="myGray.600" mb={1}>
          {t('dataset:database_config_title')}
        </Flex>
      )}

      <Flex flex={'1 0 0'} gap={4} minH={0} h={0}>
        {/* Left Panel - Table Selection */}
        <Flex
          w="300px"
          bg="myGray.50"
          flexDirection={'column'}
          h="100%"
          align="stretch"
          p={1}
          border={theme.borders.sm}
          borderRadius="sm"
        >
          {/* Search Tables */}
          <Box>
            <MyInput
              flex={1}
              placeholder={t('dataset:search_tables')}
              value={searchTable}
              onChange={(e) => setSearchTable(e.target.value)}
              bg="white"
              size="sm"
              leftIcon={
                <MyIcon
                  name="common/searchLight"
                  position={'absolute'}
                  w={'16px'}
                  color={'myGray.500'}
                />
              }
            />
          </Box>
          <Divider orientation="horizontal" mb={1} mt={1} />
          {/* Table List */}
          <Flex flex={1} minH={0} h={0}>
            <VStack w="100%" spacing={2} align="stretch" overflowY="auto">
              {showTables.map((tableInfo) => {
                const originalIndex = tableInfos.findIndex(
                  (info) => info.tableData.tableName === tableInfo.tableData.tableName
                );
                return (
                  <HStack
                    key={tableInfo.tableData.tableName}
                    py={1}
                    px={3}
                    boxShadow={tableInfo.isCurrentTable ? '2' : '0'}
                    color={tableInfo.isCurrentTable ? 'blue.500' : 'black'}
                    bg={tableInfo.isCurrentTable ? 'white' : 'myGray.50'}
                    borderRadius="sm"
                    onClick={() => handleChangeTab(originalIndex)}
                    cursor="pointer"
                  >
                    <Checkbox
                      isChecked={tableInfo.tableData.enabled}
                      colorScheme="blue"
                      onChange={() => handleTableSelect(originalIndex)}
                    >
                      <HStack spacing={1}>
                        <Text>{tableInfo.tableData.tableName}</Text>
                      </HStack>
                    </Checkbox>
                    <Box ml="auto">
                      {problematicTableNames.includes(tableInfo.tableData.tableName) && (
                        <MyTooltip label={t('dataset:has_unfilled_content')}>
                          <IconTip iconSrc="common/error" w={4} h={4} color="red.500" />
                        </MyTooltip>
                      )}
                      {tableInfo.tableData.hasColumnChanges && (
                        <MyTooltip label={t('dataset:has_column_changes')}>
                          <IconTip ml={1} iconSrc="common/info" w={4} h={4} color="yellow.500" />
                        </MyTooltip>
                      )}
                    </Box>
                  </HStack>
                );
              })}
            </VStack>
          </Flex>
        </Flex>

        {/* Right Panel - Configuration */}
        <Flex
          border={theme.borders.sm}
          borderRadius={'md'}
          flex={1}
          bg="myGray.50"
          py={4}
          px={7}
          flexDirection="column"
        >
          {currentTableColumnChanges.hasColumnChanges && (
            <Alert bgColor={'yellow.50'} borderRadius="md" mb={4} color={'myGray.600'}>
              <Flex alignItems={'center'} fontSize="sm">
                <MyIcon name="common/info" w={4} h={4} mr={2} color={'yellow.500'} />
                <Text>{t('dataset:found')}</Text>
                {currentTableColumnChanges.addedColumns.count > 0 && (
                  <Text>
                    <MyTooltip
                      label={
                        <>
                          {currentTableColumnChanges.addedColumns.columnNames.map((v) => (
                            <Text color={'gray.900'} key={v}>
                              {v}
                            </Text>
                          ))}
                        </>
                      }
                    >
                      <Link>{currentTableColumnChanges.addedColumns.count}</Link>
                    </MyTooltip>
                    {t('dataset:new_columns_added_disabled')}
                  </Text>
                )}
                {currentTableColumnChanges.deletedColumns.count > 0 && (
                  <Text>
                    <MyTooltip
                      label={
                        <>
                          {currentTableColumnChanges.deletedColumns.columnNames.map((v) => (
                            <Text key={v}>{v}</Text>
                          ))}
                        </>
                      }
                    >
                      <Link>{currentTableColumnChanges.deletedColumns.count}</Link>
                    </MyTooltip>
                    {t('dataset:columns_no_longer_exist')}
                  </Text>
                )}
                <Text>{t('dataset:please_check_latest_data')}</Text>
              </Flex>
            </Alert>
          )}
          {/* Table Description */}
          <Box mb={4}>
            <FormLabel required color="myGray.900" mb={1}>
              <Text>{t('dataset:table_description')}</Text>
            </FormLabel>
            <Box
              flex={1}
              css={{
                '& > span': {
                  display: 'block'
                }
              }}
            >
              <MyTooltip w={'100%'} label={errors.description?.message || ''}>
                <MyInput
                  {...register('description', {
                    required: currentTable?.enabled,
                    validate: (value) => {
                      if (!currentTable?.enabled) return true;
                      return value?.trim();
                    }
                  })}
                  placeholder={t('dataset:table_description_placeholder')}
                  bg="white"
                  w={'100%'}
                  isDisabled={isOnlyRead}
                />
              </MyTooltip>
            </Box>
          </Box>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={4}>
            <FormLabel required color="myGray.900">
              <Text>{t('dataset:column_configuration')}</Text>
            </FormLabel>
            <Flex>
              <MyInput
                maxW={'250px'}
                flex={1}
                size={'sm'}
                bg="white"
                placeholder={t('dataset:search_columns')}
                value={searchColumn}
                leftIcon={
                  <MyIcon
                    name="common/searchLight"
                    position={'absolute'}
                    w={'16px'}
                    color={'myGray.500'}
                  />
                }
                onChange={(e) => setSearchColumn(e.target.value)}
              />
            </Flex>
          </Box>

          {/* Columns Table */}
          <Box flex={1} overflow="hidden">
            <TableContainer h="100%" overflowY="auto">
              <Table variant={'simple'} draggable={false}>
                <Thead>
                  <Tr>
                    <Th py={4} w="154px">
                      {t('dataset:column_name')}
                    </Th>
                    <Th py={4} w="120px">
                      {t('dataset:column_type')}
                    </Th>
                    <Th py={4}>
                      <HStack spacing={1}>
                        <Text>{t('dataset:column_description')}</Text>
                        <QuestionTip
                          label={
                            <UnorderedList>
                              <ListItem>{t('dataset:column_desc_accuracy_tip')}</ListItem>
                              <ListItem>{t('dataset:default_table_desc_tip')}</ListItem>
                            </UnorderedList>
                          }
                        />
                      </HStack>
                    </Th>
                    <Th py={4}>
                      <HStack spacing={1}>
                        <Text>{t('dataset:column_enabled')}</Text>
                        <QuestionTip label={<>{t('dataset:column_enabled_tip')}</>} />
                      </HStack>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {showColumns.map((column) => {
                    const originalIndex = currentTable.columns.findIndex(
                      (c) => c.columnName === column.columnName
                    );
                    return (
                      <Tr key={column.columnName} borderRadius="0" _hover={{ bg: 'myGray.50' }}>
                        <Td maxW={'154px'} bg="white">
                          {column.status === ColumnStatusEnum.add ? (
                            <Flex>
                              <MyTooltip
                                shouldWrapChildren={false}
                                placement={'auto'}
                                label={t(column.columnName)}
                              >
                                <Text maxW={'80px'} overflow={'hidden'}>
                                  {column.columnName}
                                </Text>
                              </MyTooltip>
                              <MyTag ml={2} colorSchema="red" borderRadius={'33px'}>
                                new
                              </MyTag>
                            </Flex>
                          ) : (
                            <MyTooltip
                              shouldWrapChildren={false}
                              placement={'auto'}
                              label={t(column.columnName)}
                            >
                              <Text maxW={'80px'} overflow={'hidden'}>
                                {column.columnName}
                              </Text>
                            </MyTooltip>
                          )}
                        </Td>
                        <Td maxW={'154px'} bg="white">
                          {column.columnType}
                        </Td>
                        <Td
                          bg="white"
                          css={{
                            '& > span': {
                              display: 'block'
                            }
                          }}
                        >
                          <MyTooltip
                            label={errors.columns?.[originalIndex]?.description?.message || ''}
                          >
                            <MyInput
                              {...register(`columns.${originalIndex}.description`, {
                                required: currentTable?.enabled && column.enabled,
                                validate: (value) => {
                                  if (!currentTable?.enabled || !column.enabled) return true;
                                  return value?.trim();
                                }
                              })}
                              size="sm"
                              w={'100%'}
                              isDisabled={isOnlyRead || !column.enabled}
                            />
                          </MyTooltip>
                        </Td>
                        <Td bg="white">
                          <Switch
                            disabled={isOnlyRead}
                            isChecked={column.enabled}
                            onChange={() => handleColumnToggle(originalIndex)}
                            colorScheme="blue"
                            size="md"
                          />
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </Flex>
      </Flex>
      <Flex justify="flex-end" mt={8}>
        <Button
          colorScheme="blue"
          onClick={handleSubmit(onSubmit)}
          px={8}
          size="md"
          isLoading={isCreating}
        >
          {t('dataset:confirm')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default DataBaseConfig;
