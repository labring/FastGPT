import React, { useCallback, useState, useRef } from 'react';
import {
  Box,
  TableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  Flex,
  Button,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Input
} from '@chakra-ui/react';
import type { BoxProps } from '@chakra-ui/react';
import type { ModelDataItemType } from '@/types/model';
import { ModelDataStatusMap } from '@/constants/model';
import { usePagination } from '@/hooks/usePagination';
import {
  getModelDataList,
  delOneModelData,
  getModelSplitDataListLen,
  getExportDataList
} from '@/api/model';
import { DeleteIcon, RepeatIcon, EditIcon } from '@chakra-ui/icons';
import { useLoading } from '@/hooks/useLoading';
import { fileDownload } from '@/utils/file';
import dynamic from 'next/dynamic';
import { useMutation, useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import InputModal, { FormData as InputDataType } from './InputDataModal';

const SelectFileModal = dynamic(() => import('./SelectFileModal'));
const SelectCsvModal = dynamic(() => import('./SelectCsvModal'));

const ModelDataCard = ({ modelId, isOwner }: { modelId: string; isOwner: boolean }) => {
  const { Loading, setIsLoading } = useLoading();
  const lastSearch = useRef('');
  const [searchText, setSearchText] = useState('');
  const tdStyles = useRef<BoxProps>({
    fontSize: 'xs',
    minW: '150px',
    maxW: '500px',
    maxH: '250px',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto'
  });
  const {
    data: modelDataList,
    isLoading,
    Pagination,
    total,
    getData,
    pageNum
  } = usePagination<ModelDataItemType>({
    api: getModelDataList,
    pageSize: 10,
    params: {
      modelId,
      searchText
    }
  });

  const [editInputData, setEditInputData] = useState<InputDataType>();

  const {
    isOpen: isOpenSelectFileModal,
    onOpen: onOpenSelectFileModal,
    onClose: onCloseSelectFileModal
  } = useDisclosure();
  const {
    isOpen: isOpenSelectCsvModal,
    onOpen: onOpenSelectCsvModal,
    onClose: onCloseSelectCsvModal
  } = useDisclosure();

  const { data: splitDataLen = 0, refetch } = useQuery(
    ['getModelSplitDataList'],
    () => getModelSplitDataListLen(modelId),
    {
      onError(err) {
        console.log(err);
      }
    }
  );

  const refetchData = useCallback(
    (num = 1) => {
      getData(num);
      refetch();
      return null;
    },
    [getData, refetch]
  );

  useQuery(['refetchData'], () => refetchData(pageNum), {
    refetchInterval: 5000,
    enabled: splitDataLen > 0
  });

  // 获取所有的数据，并导出 json
  const { mutate: onclickExport, isLoading: isLoadingExport = false } = useMutation({
    mutationFn: () => getExportDataList(modelId),
    onSuccess(res) {
      try {
        setIsLoading(true);
        const text = Papa.unparse({
          fields: ['question', 'answer'],
          data: res
        });
        fileDownload({
          text,
          type: 'text/csv',
          filename: 'data.csv'
        });
      } catch (error) {
        error;
      }
      setIsLoading(false);
    },
    onError(err) {
      console.log(err);
    }
  });

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1} mr={2}>
          知识库数据: {total}组
        </Box>
        {isOwner && (
          <>
            <IconButton
              icon={<RepeatIcon />}
              aria-label={'refresh'}
              variant={'outline'}
              mr={4}
              size={'sm'}
              onClick={() => refetchData(pageNum)}
            />
            <Button
              variant={'outline'}
              mr={2}
              size={'sm'}
              isLoading={isLoadingExport}
              title={'换行数据导出时，会进行格式转换'}
              onClick={() => onclickExport()}
            >
              导出
            </Button>
            <Menu autoSelect={false}>
              <MenuButton as={Button} size={'sm'}>
                导入
              </MenuButton>
              <MenuList>
                <MenuItem
                  onClick={() =>
                    setEditInputData({
                      a: '',
                      q: ''
                    })
                  }
                >
                  手动输入
                </MenuItem>
                <MenuItem onClick={onOpenSelectFileModal}>文本/文件拆分</MenuItem>
                <MenuItem onClick={onOpenSelectCsvModal}>csv 问答对导入</MenuItem>
              </MenuList>
            </Menu>
          </>
        )}
      </Flex>
      <Flex mt={4}>
        {isOwner && splitDataLen > 0 && (
          <Box fontSize={'xs'}>{splitDataLen}条数据正在拆分，请耐心等待...</Box>
        )}
        <Box flex={1} />
        <Input
          maxW={'240px'}
          size={'sm'}
          value={searchText}
          placeholder="搜索相关问题和答案，回车确认"
          onChange={(e) => setSearchText(e.target.value)}
          onBlur={() => {
            if (searchText === lastSearch.current) return;
            getData(1);
            lastSearch.current = searchText;
          }}
          onKeyDown={(e) => {
            if (searchText === lastSearch.current) return;
            if (e.key === 'Enter') {
              getData(1);
              lastSearch.current = searchText;
            }
          }}
        />
      </Flex>

      <Box mt={4}>
        <TableContainer minH={'500px'}>
          <Table variant={'simple'} w={'100%'}>
            <Thead>
              <Tr>
                <Th>{'匹配的知识点'}</Th>
                <Th>补充知识</Th>
                <Th>状态</Th>
                {isOwner && <Th>操作</Th>}
              </Tr>
            </Thead>
            <Tbody>
              {modelDataList.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <Box {...tdStyles.current}>{item.q}</Box>
                  </Td>
                  <Td>
                    <Box {...tdStyles.current}>{item.a || '-'}</Box>
                  </Td>
                  <Td>{ModelDataStatusMap[item.status]}</Td>
                  {isOwner && (
                    <Td>
                      <IconButton
                        mr={5}
                        icon={<EditIcon />}
                        variant={'outline'}
                        aria-label={'delete'}
                        size={'sm'}
                        onClick={() =>
                          setEditInputData({
                            dataId: item.id,
                            q: item.q,
                            a: item.a
                          })
                        }
                      />
                      <IconButton
                        icon={<DeleteIcon />}
                        variant={'outline'}
                        colorScheme={'gray'}
                        aria-label={'delete'}
                        size={'sm'}
                        onClick={async () => {
                          await delOneModelData(item.id);
                          refetchData(pageNum);
                        }}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        <Box mt={2} textAlign={'end'}>
          <Pagination />
        </Box>
      </Box>

      <Loading loading={isLoading} fixed={false} />
      {editInputData !== undefined && (
        <InputModal
          modelId={modelId}
          defaultValues={editInputData}
          onClose={() => setEditInputData(undefined)}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectFileModal && (
        <SelectFileModal
          modelId={modelId}
          onClose={onCloseSelectFileModal}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectCsvModal && (
        <SelectCsvModal modelId={modelId} onClose={onCloseSelectCsvModal} onSuccess={refetchData} />
      )}
    </>
  );
};

export default ModelDataCard;
