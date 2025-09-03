/**
 * @file 数据库 - 数据配置
 */
import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
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
  AlertIcon,
  UnorderedList,
  ListItem
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import { DatasetImportContext } from '../Context';
import { useContextSelector } from 'use-context-selector';
import { useDataBaseConfig } from './hooks/useDataBaseConfig';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const DataBaseConfig = () => {
  const { t } = useTranslation();
  const isEditMode = useContextSelector(DatasetImportContext, (v) => v.isEditMode);

  const {
    currentTable,
    tableInfos,
    handleTableSelect,
    handleChangeTab,
    handleChangeTableDesc,
    handleChangeColumnData,
    handleColumnToggle,
    handleConfirm
  } = useDataBaseConfig();

  const [searchColumn, setSearchColumn] = useState('');
  const [searchTable, setSearchTable] = useState('');

  // 计算属性
  const isOnlyRead = useMemo(() => {
    return !currentTable.enabled;
  }, [currentTable.enabled]);

  const showColumns = useMemo(() => {
    return currentTable.columns.filter((v) => !searchColumn || v.columnName.includes(searchColumn));
  }, [searchColumn, currentTable]);

  const showTables = useMemo(() => {
    return tableInfos.filter(
      (tableInfo) => !searchTable || tableInfo.tableData.tableName.includes(searchTable)
    );
  }, [searchTable, tableInfos]);

  return (
    <Flex px={7} flexDirection={'column'} h="100%">
      {/* Edit Mode Warning Banner */}
      {isEditMode && (
        <Alert status="warning" borderRadius="md" mb={4} mt={4}>
          <AlertIcon />
          <Text fontSize="sm">
            {t('dataset:edit_database_config_warning', { changedCount: 2, deletedCount: 2 })}
          </Text>
        </Alert>
      )}
      <Flex fontSize="14px" fontWeight="medium" color="myGray.600" mb={1}>
        {t('dataset:database_config_title')}
      </Flex>

      <Flex flex={'1 0 0'} gap={4} minH={0} h={0}>
        {/* Left Panel - Table Selection */}
        <Flex
          w="300px"
          bg="myGray.50"
          flexDirection={'column'}
          h="100%"
          align="stretch"
          p={1}
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
                    key={originalIndex}
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
                      {tableInfo.tableData.tableName}
                    </Checkbox>
                  </HStack>
                );
              })}
            </VStack>
          </Flex>
        </Flex>

        {/* Right Panel - Configuration */}
        <Box flex={1} bg="myGray.50" py={4} px={7} overflowY="auto">
          <VStack spacing={4} align="stretch">
            {/* Table Description */}
            <FormControl>
              <FormLabel color="myGray.900" mb={3}>
                <HStack spacing={1}>
                  <Text color="red.500">*</Text>
                  <Text>{t('dataset:table_description')}</Text>
                </HStack>
              </FormLabel>
              <Input
                value={currentTable.description}
                onChange={(e) => handleChangeTableDesc(e.target.value)}
                placeholder={t('dataset:table_description_placeholder')}
                bg="white"
                disabled={isOnlyRead}
              />
            </FormControl>

            {/* Column Configuration */}
            <FormControl>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb="2">
                <Flex color="myGray.900">
                  <HStack spacing={1}>
                    <Text color="red.500">*</Text>
                    <Text>{t('dataset:column_configuration')}</Text>
                  </HStack>
                </Flex>
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
              <TableContainer>
                <Table variant={'simple'} draggable={false}>
                  <Thead>
                    <Tr>
                      <Th py={4}>{t('dataset:column_name')}</Th>
                      <Th py={4}>{t('dataset:column_type')}</Th>
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
                        <Tr key={originalIndex} borderRadius="0" _hover={{ bg: 'myGray.50' }}>
                          <Td bg="white">
                            <Text>{column.columnName}</Text>
                          </Td>
                          <Td bg="white">
                            <Text>{column.columnType}</Text>
                          </Td>
                          <Td bg="white">
                            <Input
                              value={column.description}
                              onChange={(e) =>
                                handleChangeColumnData('description', originalIndex, e.target.value)
                              }
                              size="sm"
                              disabled={isOnlyRead}
                              border="1px solid"
                              borderColor="myGray.200"
                            />
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
            </FormControl>
          </VStack>
        </Box>
      </Flex>
      <Flex justify="flex-end" mt={8}>
        <Button colorScheme="blue" onClick={handleConfirm} px={8} size="md">
          {t('dataset:confirm')}
        </Button>
      </Flex>
    </Flex>
  );
};

export default DataBaseConfig;
