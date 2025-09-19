import React from 'react';
import {
  Box,
  Flex,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  MenuButton,
  Switch
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';

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

  return (
    <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
      <Table variant={'simple'} draggable={false}>
        <Thead draggable={false}>
          <Tr>
            <Th py={4}>{t('common:Name')}</Th>
            <Th py={4}>{t('dataset:description')}</Th>
            <Th py={4}>{t('dataset:collection.Create update time')}</Th>
            <Th py={4}>{t('common:Status')}</Th>
            <Th py={4}>{t('dataset:Enable')}</Th>
            <Th py={4} />
          </Tr>
        </Thead>
        <Tbody>
          <Tr h={'5px'} />
          {formatCollections.map((collection) => (
            <Tr key={collection._id} _hover={{ bg: 'myGray.50' }} cursor={'pointer'}>
              <Td minW={'150px'} maxW={['200px', '300px']} draggable py={2}>
                <Box color={'myGray.900'} fontWeight={'500'} className="textEllipsis">
                  {collection.name}
                </Box>
              </Td>
              <Td py={2}>{collection.name} Mock-差描述字段</Td>
              <Td fontSize={'xs'} py={2} color={'myGray.500'}>
                <Box>{formatTime2YMDHM(collection.createTime)}</Box>
                <Box>{formatTime2YMDHM(collection.updateTime)}</Box>
              </Td>
              <Td py={2}>
                <MyTooltip label={t('common:Click_to_expand')}>
                  <MyTag
                    showDot
                    colorSchema={collection.colorSchema as any}
                    type={'fill'}
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
              </Td>
              <Td py={2} onClick={(e) => e.stopPropagation()}>
                <Switch
                  isChecked={!collection.forbid}
                  size={'sm'}
                  onChange={(e) =>
                    onUpdateCollection({
                      id: collection._id,
                      forbid: !e.target.checked
                    })
                  }
                />
              </Td>
              <Td py={2} onClick={(e) => e.stopPropagation()}>
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
                                  label: t('dataset:data_config'),
                                  icon: 'common/setting',
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
                            label: (
                              <Flex alignItems={'center'}>
                                <MyIcon
                                  mr={1}
                                  name={'delete'}
                                  w={'0.9rem'}
                                  _hover={{ color: 'red.600' }}
                                />
                                {t('dataset:remove')}
                              </Flex>
                            ),
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
