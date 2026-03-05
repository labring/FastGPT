import React, { useCallback } from 'react';
import {
  Box,
  Flex,
  HStack,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  MenuButton,
  Switch,
  Text
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import StatusFilter from '../RefinedCollectionCard/StatusFilter';

const EmptyCollectionTip = dynamic(() => import('./EmptyCollectionTip'));

interface DatabaseListTableProps {
  formatCollections: any[];
  total: number;
  onUpdateCollection: (params: { id: string; forbid: boolean }) => void;
  onTrainingStatesClick: (collectionId: string) => void;
  onDataConfigClick: (databaseName: string, activeStep: number) => void;
  onRemoveClick: (collectionId: string) => void;
}

const DatabaseListTable: React.FC<DatabaseListTableProps> = ({
  formatCollections,
  total,
  onUpdateCollection,
  onTrainingStatesClick,
  onDataConfigClick,
  onRemoveClick
}) => {
  const { t } = useTranslation();

  const { sortBy, setSortBy, sortOrder, setSortOrder, statusFilter, setStatusFilter } =
    useContextSelector(CollectionPageContext, (v) => v);

  const handleSort = useCallback(
    (field: 'name' | 'updateTime' | 'createTime') => {
      setSortBy((prev) => {
        if (prev === field) {
          setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
          return field;
        }
        setSortOrder('asc');
        return field;
      });
    },
    [setSortBy, setSortOrder]
  );

  const renderSortIcon = useCallback(
    (field: 'name' | 'updateTime' | 'createTime') => {
      if (sortBy !== field) {
        return (
          <MyIcon
            name={'common/table/sort'}
            w={'12px'}
            cursor={'pointer'}
            _hover={{ color: 'primary.600' }}
          />
        );
      }
      return (
        <MyIcon
          name={sortOrder === 'asc' ? 'common/table/asc' : 'common/table/desc'}
          w={'12px'}
          cursor={'pointer'}
        />
      );
    },
    [sortBy, sortOrder]
  );

  return (
    <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
      <Table variant={'simple'} draggable={false}>
        <Thead draggable={false}>
          <Tr>
            <Th py={4}>
              <HStack spacing={1} cursor={'pointer'} onClick={() => handleSort('name')}>
                <Box>{t('common:Name')}</Box>
                {renderSortIcon('name')}
              </HStack>
            </Th>
            <Th py={4}>{t('dataset:description')}</Th>
            <Th py={4} w="100px">
              <HStack spacing={1}>
                <Box>{t('common:Status')}</Box>
                <StatusFilter value={statusFilter} onChange={setStatusFilter} />
              </HStack>
            </Th>
            <Th py={4} w="150px">
              <HStack spacing={1} cursor={'pointer'} onClick={() => handleSort('createTime')}>
                <Box>{t('common:create_time')}</Box>
                {renderSortIcon('createTime')}
              </HStack>
            </Th>
            <Th py={4} w="150px">
              <HStack spacing={1} cursor={'pointer'} onClick={() => handleSort('updateTime')}>
                <Box>{t('common:update_time')}</Box>
                {renderSortIcon('updateTime')}
              </HStack>
            </Th>
            <Th py={4} w="100px">
              {t('dataset:Enable')}
            </Th>
            <Th py={4} w="100px" />
          </Tr>
        </Thead>
        <Tbody>
          <Tr h={'5px'} />
          {formatCollections.map((collection) => (
            <Tr key={collection._id} _hover={{ bg: 'myGray.50' }} cursor={'pointer'}>
              <Td py={2} maxW={'250px'}>
                <MyTooltip label={collection.name} shouldWrapChildren={false}>
                  <Box fontSize={'xs'} color={'myWhite.1000'} className="textEllipsis">
                    {collection.name}
                  </Box>
                </MyTooltip>
              </Td>
              <Td py={2} minW={'200px'} maxW={'400px'}>
                <MyTooltip label={collection.tableSchema?.description} shouldWrapChildren={false}>
                  <Text fontSize={'xs'} color={'myWhite.1000'} className={'textEllipsis'}>
                    {collection.tableSchema?.description}
                  </Text>
                </MyTooltip>
              </Td>
              <Td py={2} w="100px">
                {collection.statusKey === 'error' ? (
                  <MyTooltip label={t('common:Click_to_expand')}>
                    <MyTag
                      colorSchema={collection.colorSchema as any}
                      type={'fill'}
                      h={'28px'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrainingStatesClick(collection._id);
                      }}
                    >
                      <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                        {t(collection.statusText as any)}
                        <MyIcon name={'common/maximize'} w={'11px'} />
                      </Flex>
                    </MyTag>
                  </MyTooltip>
                ) : (
                  <MyTag colorSchema={collection.colorSchema as any} type={'fill'} h={'28px'}>
                    <Flex fontWeight={'medium'} alignItems={'center'} gap={1}>
                      {t(collection.statusText as any)}
                    </Flex>
                  </MyTag>
                )}
              </Td>
              <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                {formatTime2YMDHM(collection.createTime)}
              </Td>
              <Td fontSize={'xs'} py={2} color={'myWhite.1000'} w="150px">
                {formatTime2YMDHM(collection.updateTime)}
              </Td>
              <Td py={2} onClick={(e) => e.stopPropagation()} w="100px">
                <Switch
                  isChecked={!collection.forbid}
                  size={'sm'}
                  disabled={collection.statusKey === 'notExist'}
                  onChange={(e) =>
                    onUpdateCollection({
                      id: collection._id,
                      forbid: !e.target.checked
                    })
                  }
                />
              </Td>
              <Td py={2} onClick={(e) => e.stopPropagation()} w="100px">
                {collection.permission.hasWritePer && (
                  <MyMenu
                    width={100}
                    offset={[-70, 5]}
                    Button={
                      <MenuButton
                        w={'1.5rem'}
                        h={'1.5rem'}
                        borderRadius={'md'}
                        _hover={{
                          color: 'primary.500',
                          '& .icon': {
                            bg: 'myGray.200'
                          }
                        }}
                      >
                        <MyIcon
                          className="icon"
                          name={'more'}
                          h={'1rem'}
                          w={'1rem'}
                          px={1}
                          py={1}
                          borderRadius={'md'}
                          cursor={'pointer'}
                        />
                      </MenuButton>
                    }
                    menuList={[
                      ...(collection.statusKey === 'ready'
                        ? [
                            {
                              children: [
                                {
                                  icon: 'common/setting',
                                  label: t('dataset:data_config'),
                                  onClick: () => {
                                    onDataConfigClick(collection.name, 1);
                                  }
                                }
                              ]
                            }
                          ]
                        : []),
                      {
                        children: [
                          {
                            icon: 'delete',
                            label: t('dataset:remove'),
                            type: 'danger',
                            onClick: () => {
                              onRemoveClick(collection._id);
                            }
                          }
                        ]
                      }
                    ]}
                  />
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {total === 0 && <EmptyCollectionTip />}
    </TableContainer>
  );
};

export default React.memo(DatabaseListTable);
