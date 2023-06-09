import React, { useCallback, useState, useRef, useEffect } from 'react';
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
  Input,
  Tooltip
} from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import type { BoxProps } from '@chakra-ui/react';
import type { KbDataItemType } from '@/types/plugin';
import { usePagination } from '@/hooks/usePagination';
import {
  getKbDataList,
  getExportDataList,
  delOneKbDataByDataId,
  getTrainingData
} from '@/api/plugins/kb';
import { DeleteIcon, RepeatIcon, EditIcon } from '@chakra-ui/icons';
import { useLoading } from '@/hooks/useLoading';
import { fileDownload } from '@/utils/file';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import Papa from 'papaparse';
import dynamic from 'next/dynamic';
import InputModal, { FormData as InputDataType } from './InputDataModal';

const SelectFileModal = dynamic(() => import('./SelectFileModal'));
const SelectCsvModal = dynamic(() => import('./SelectCsvModal'));

const DataCard = ({ kbId }: { kbId: string }) => {
  const lastSearch = useRef('');
  const tdStyles = useRef<BoxProps>({
    fontSize: 'xs',
    minW: '150px',
    maxW: '500px',
    maxH: '250px',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto'
  });
  const [searchText, setSearchText] = useState('');
  const { Loading, setIsLoading } = useLoading();
  const { toast } = useToast();

  const {
    data: kbDataList,
    isLoading,
    Pagination,
    total,
    getData,
    pageNum
  } = usePagination<KbDataItemType>({
    api: getKbDataList,
    pageSize: 10,
    params: {
      kbId,
      searchText
    },
    defaultRequest: false
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

  const { data: { qaListLen = 0, vectorListLen = 0 } = {}, refetch } = useQuery(
    ['getModelSplitDataList', kbId],
    () => getTrainingData({ kbId, init: false }),
    {
      onError(err) {
        console.log(err);
      }
    }
  );

  const refetchData = useCallback(
    (num = pageNum) => {
      getData(num);
      refetch();
      return null;
    },
    [getData, pageNum, refetch]
  );

  // get al data and export csv
  const { mutate: onclickExport, isLoading: isLoadingExport = false } = useMutation({
    mutationFn: () => getExportDataList(kbId),
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
        toast({
          title: '导出成功，下次导出需要半小时后',
          status: 'success'
        });
      } catch (error) {
        error;
      }
      setIsLoading(false);
    },
    onError(err: any) {
      toast({
        title: typeof err === 'string' ? err : err?.message || '导出异常',
        status: 'error'
      });
      console.log(err);
    }
  });

  // interval get data
  useQuery(['refetchData'], () => refetchData(1), {
    refetchInterval: 5000,
    enabled: qaListLen > 0 || vectorListLen > 0
  });
  useQuery(['getKbData', kbId], () => {
    setSearchText('');
    getData(1);
    return null;
  });

  return (
    <Box position={'relative'}>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1} mr={2}>
          知识库数据: {total}组
        </Box>
        <IconButton
          icon={<RepeatIcon />}
          aria-label={'refresh'}
          variant={'outline'}
          mr={[2, 4]}
          size={'sm'}
          onClick={() => {
            refetchData(pageNum);
            getTrainingData({ kbId, init: true });
          }}
        />
        <Button
          variant={'outline'}
          mr={2}
          size={'sm'}
          isLoading={isLoadingExport}
          title={'半小时仅能导出1次'}
          onClick={() => onclickExport()}
        >
          导出csv
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
      </Flex>
      <Flex mt={4}>
        {(qaListLen > 0 || vectorListLen > 0) && (
          <Box fontSize={'xs'}>
            {qaListLen > 0 ? `${qaListLen}条数据正在拆分，` : ''}
            {vectorListLen > 0 ? `${vectorListLen}条数据正在生成索引，` : ''}
            请耐心等待...
          </Box>
        )}
        <Box flex={1} />
        <Input
          maxW={['90%', '300px']}
          size={'sm'}
          value={searchText}
          placeholder="搜索匹配知识，补充知识和来源，回车确认"
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
      <TableContainer mt={4} minH={'200px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>
                匹配的知识点
                <Tooltip
                  label={
                    '对话时，会将用户的问题和知识库的 "匹配知识点" 进行比较，找到最相似的前 n 条记录，将这些记录的 "匹配知识点"+"补充知识点" 作为 chatgpt 的系统提示词。'
                  }
                >
                  <QuestionOutlineIcon ml={1} />
                </Tooltip>
              </Th>
              <Th>补充知识</Th>
              <Th>来源</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {kbDataList.map((item) => (
              <Tr key={item.id} fontSize={'sm'}>
                <Td>
                  <Box {...tdStyles.current}>{item.q}</Box>
                </Td>
                <Td>
                  <Box {...tdStyles.current}>{item.a || '-'}</Box>
                </Td>
                <Td maxW={'15%'} whiteSpace={'pre-wrap'} userSelect={'all'}>
                  {item.source?.trim() || '-'}
                </Td>
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
                      await delOneKbDataByDataId(item.id);
                      refetchData(pageNum);
                    }}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <Flex mt={2} justifyContent={'flex-end'}>
        <Pagination />
      </Flex>

      <Loading loading={isLoading} fixed={false} />
      {editInputData !== undefined && (
        <InputModal
          kbId={kbId}
          defaultValues={editInputData}
          onClose={() => setEditInputData(undefined)}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectFileModal && (
        <SelectFileModal kbId={kbId} onClose={onCloseSelectFileModal} onSuccess={refetchData} />
      )}
      {isOpenSelectCsvModal && (
        <SelectCsvModal kbId={kbId} onClose={onCloseSelectCsvModal} onSuccess={refetchData} />
      )}
    </Box>
  );
};

export default DataCard;
