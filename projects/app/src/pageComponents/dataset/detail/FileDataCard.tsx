/**
 * @file - 文件数据详情组件
 * 用于展示文件数据库类型知识库的数据详情，包括表格形式的数据展示和右侧信息面板
 */
import React, { useMemo } from 'react';
import { Box, Flex, TableContainer, Table, Thead, Tbody, Tr, Th, Td, Text } from '@chakra-ui/react';
import { getStructureCollectionPreview, getDatasetCollectionById } from '@/web/core/dataset/api';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const FileDataCard = () => {
  const router = useRouter();
  const { isPc } = useSystem();

  const { collectionId = '', datasetId = '' } = router.query as {
    collectionId: string;
    datasetId: string;
  };

  const { t } = useTranslation();

  // Get collection info
  const { data: collection } = useRequest2(() => getDatasetCollectionById(collectionId), {
    refreshDeps: [collectionId],
    manual: false,
    onError: () => {
      router.replace({
        query: {
          datasetId
        }
      });
    }
  });

  // 获取预览数据
  const { data: previewData, loading: isLoading } = useRequest2(
    () => getStructureCollectionPreview({ collectionId }),
    {
      refreshDeps: [collectionId],
      manual: false,
      onError: () => {
        router.replace({
          query: {
            datasetId
          }
        });
      }
    }
  );

  // 处理预览数据
  const tableData = useMemo(() => {
    if (!previewData?.cols || !previewData?.data) {
      return { cols: [], rows: [], totalRows: 0, totalCols: 0 };
    }

    const cols = previewData.cols;
    const rows = previewData.data;

    // 只显示前20行
    return {
      cols,
      rows: rows.slice(0, 20),
      totalCols: previewData.columnCount,
      totalRows: previewData.rowCount
    };
  }, [previewData]);

  return (
    <MyBox py={[1, 0]} h={'100%'} isLoading={isLoading}>
      <Flex flexDirection={'column'} h={'100%'} px={6} pb={4}>
        {/* Header */}
        <Flex alignItems={'center'}>
          <Box flex={'1 0 0'} mr={[3, 5]} alignItems={'center'}>
            <Box
              className="textEllipsis"
              alignItems={'center'}
              gap={2}
              display={isPc ? 'flex' : ''}
            >
              {collection?._id && (
                <RawSourceBox
                  collectionId={collection._id}
                  {...getCollectionSourceData(collection)}
                  fontSize={['sm', 'md']}
                  color={'black'}
                  textDecoration={'none'}
                />
              )}
            </Box>
          </Box>
        </Flex>
        <Box justifyContent={'center'} pos={'relative'} w={'100%'}>
          <MyDivider my={'17px'} w={'100%'} />
        </Box>
        <Flex alignItems={'center'}>
          <Flex alignItems={'center'} color={'myGray.500'}>
            <MyIcon name="common/list" mr={2} w={'18px'} />
            <Box as={'span'} fontSize={['sm', '14px']} fontWeight={'500'}>
              {t('dataset:file_data_preview_info', {
                rows: tableData.totalRows,
                cols: tableData.totalCols
              })}
            </Box>
          </Flex>
          <Box flex={1} mr={1} />
        </Flex>
        <TableContainer mt={3} overflowY={'auto'} fontSize={'sm'} flex={'1 0 0'} h={0}>
          <Table variant={'simple'} draggable={false}>
            <Thead draggable={false}>
              <Tr color={'myGray.600'}>
                {tableData.cols.map((col: string, index: number) => (
                  <Th
                    bg="myGray.100"
                    borderLeftRadius={index === 0 ? 'md' : ''}
                    borderRightRadius={index === tableData.cols.length - 1 ? 'md' : ''}
                    maxW={'150px'}
                    key={index}
                  >
                    <Text className={'textEllipsis'} maxW={'120px'}>
                      {col}
                    </Text>
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {tableData.rows.map((row: any[], rowIndex: number) => (
                <Tr key={rowIndex} _hover={{ bg: 'myGray.50' }}>
                  {row.map((cell: any, cellIndex: number) => (
                    <Td key={cellIndex} py={4} maxW={'150px'}>
                      <MyTooltip label={cell || ''} shouldWrapChildren={false}>
                        <Text className={'textEllipsis'} maxW={'120px'}>
                          {cell || '-'}
                        </Text>
                      </MyTooltip>
                    </Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && tableData.cols.length === 0 && (
            <EmptyTip text={t('common:core.dataset.data.Empty Tip')} />
          )}
        </TableContainer>
      </Flex>
    </MyBox>
  );
};

export default React.memo(FileDataCard);
