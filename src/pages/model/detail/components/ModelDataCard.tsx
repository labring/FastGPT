import React, { useCallback, useState } from 'react';
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
import type { ModelSchema } from '@/types/mongoSchema';
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
import type { FormData as InputDataType } from './InputDataModal';
import Papa from 'papaparse';

const InputModel = dynamic(() => import('./InputDataModal'));
const SelectFileModel = dynamic(() => import('./SelectFileModal'));
const SelectUrlModel = dynamic(() => import('./SelectUrlModal'));
const SelectCsvModal = dynamic(() => import('./SelectCsvModal'));

let lastSearch = '';

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
  const { Loading, setIsLoading } = useLoading();
  const [searchText, setSearchText] = useState('');
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
      modelId: model._id,
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
    isOpen: isOpenSelectUrlModal,
    onOpen: onOpenSelectUrlModal,
    onClose: onCloseSelectUrlModal
  } = useDisclosure();
  const {
    isOpen: isOpenSelectCsvModal,
    onOpen: onOpenSelectCsvModal,
    onClose: onCloseSelectCsvModal
  } = useDisclosure();

  const { data: splitDataLen, refetch } = useQuery(['getModelSplitDataList'], () =>
    getModelSplitDataListLen(model._id)
  );

  const refetchData = useCallback(
    (num = 1) => {
      getData(num);
      refetch();
    },
    [getData, refetch]
  );

  // 获取所有的数据，并导出 json
  const { mutate: onclickExport, isLoading: isLoadingExport } = useMutation({
    mutationFn: () => getExportDataList(model._id),
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
    }
  });

  const tdStyles: BoxProps = {
    fontSize: 'xs',
    maxW: '500px',
    whiteSpace: 'pre-wrap',
    maxH: '250px',
    overflowY: 'auto'
  };

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1} mr={2}>
          模型数据: {total}组
          <Box as={'span'} fontSize={'sm'}>
            （测试版本）
          </Box>
        </Box>
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
        <Menu>
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
            {/* <MenuItem onClick={onOpenSelectUrlModal}>网站内容拆分</MenuItem> */}
            <MenuItem onClick={onOpenSelectCsvModal}>csv 问答对导入</MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      <Flex mt={4}>
        {/* 拆分数据提示 */}
        {!!(splitDataLen && splitDataLen > 0) && (
          <Box fontSize={'xs'}>{splitDataLen}条数据正在拆分...</Box>
        )}
        <Box flex={1}></Box>
        <Input
          maxW={'240px'}
          size={'sm'}
          value={searchText}
          placeholder="搜索相关问题和答案，回车确认"
          onChange={(e) => setSearchText(e.target.value)}
          onBlur={() => {
            if (searchText === lastSearch) return;
            getData(1);
            lastSearch = searchText;
          }}
          onKeyDown={(e) => {
            if (searchText === lastSearch) return;
            if (e.key === 'Enter') {
              getData(1);
              lastSearch = searchText;
            }
          }}
        />
      </Flex>

      <Box mt={4}>
        <TableContainer minH={'500px'}>
          <Table variant={'simple'} w={'100%'}>
            <Thead>
              <Tr>
                <Th>匹配内容(问题)</Th>
                <Th>对应答案</Th>
                <Th>状态</Th>
                <Th>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {modelDataList.map((item) => (
                <Tr key={item.id}>
                  <Td>
                    <Box {...tdStyles}>{item.q}</Box>
                  </Td>
                  <Td>
                    <Box {...tdStyles}>{item.a || '-'}</Box>
                  </Td>
                  <Td>{ModelDataStatusMap[item.status]}</Td>
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
        <InputModel
          modelId={model._id}
          defaultValues={editInputData}
          onClose={() => setEditInputData(undefined)}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectFileModal && (
        <SelectFileModel
          modelId={model._id}
          onClose={onCloseSelectFileModal}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectUrlModal && (
        <SelectUrlModel
          modelId={model._id}
          onClose={onCloseSelectUrlModal}
          onSuccess={refetchData}
        />
      )}
      {isOpenSelectCsvModal && (
        <SelectCsvModal
          modelId={model._id}
          onClose={onCloseSelectCsvModal}
          onSuccess={refetchData}
        />
      )}
    </>
  );
};

export default ModelDataCard;
