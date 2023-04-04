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
  MenuItem
} from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import type { RedisModelDataItemType } from '@/types/redis';
import { ModelDataStatusMap } from '@/constants/model';
import { usePagination } from '@/hooks/usePagination';
import {
  getModelDataList,
  delOneModelData,
  getModelSplitDataList,
  getExportDataList
} from '@/api/model';
import { DeleteIcon, RepeatIcon, EditIcon } from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import dynamic from 'next/dynamic';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { FormData as InputDataType } from './InputDataModal';

const InputModel = dynamic(() => import('./InputDataModal'));
const SelectFileModel = dynamic(() => import('./SelectFileModal'));
const SelectJsonModel = dynamic(() => import('./SelectJsonModal'));

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
  const { Loading } = useLoading();

  const {
    data: modelDataList,
    isLoading,
    Pagination,
    total,
    getData,
    pageNum
  } = usePagination<RedisModelDataItemType>({
    api: getModelDataList,
    pageSize: 8,
    params: {
      modelId: model._id
    }
  });

  const [editInputData, setEditInputData] = useState<InputDataType>();

  const {
    isOpen: isOpenSelectFileModal,
    onOpen: onOpenSelectFileModal,
    onClose: onCloseSelectFileModal
  } = useDisclosure();
  const {
    isOpen: isOpenSelectJsonModal,
    onOpen: onOpenSelectJsonModal,
    onClose: onCloseSelectJsonModal
  } = useDisclosure();

  const { data: splitDataList, refetch } = useQuery(['getModelSplitDataList'], () =>
    getModelSplitDataList(model._id)
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
      // 导出为文件
      const blob = new Blob([res], { type: 'application/json;charset=utf-8' });

      // 创建下载链接
      const downloadLink = document.createElement('a');
      downloadLink.href = window.URL.createObjectURL(blob);
      downloadLink.download = `data.json`;

      // 添加链接到页面并触发下载
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  });

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1} mr={2}>
          模型数据: {total}组{' '}
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
          title={'v2.3之前版本的数据无法导出'}
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
                  text: '',
                  q: ''
                })
              }
            >
              手动输入
            </MenuItem>
            <MenuItem onClick={onOpenSelectFileModal}>文件导入</MenuItem>
            <MenuItem onClick={onOpenSelectJsonModal}>JSON导入</MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      {splitDataList && splitDataList.length > 0 && (
        <Box fontSize={'xs'}>
          {splitDataList.map((item) => item.textList).flat().length}条数据正在拆分...
        </Box>
      )}
      <Box mt={4}>
        <TableContainer minH={'500px'}>
          <Table variant={'simple'}>
            <Thead>
              <Tr>
                <Th>Question</Th>
                <Th>Text</Th>
                <Th>Status</Th>
                <Th>操作</Th>
              </Tr>
            </Thead>
            <Tbody>
              {modelDataList.map((item) => (
                <Tr key={item.id}>
                  <Td minW={'200px'}>
                    <Box fontSize={'xs'} whiteSpace={'pre-wrap'}>
                      {item.q}
                    </Box>
                  </Td>
                  <Td minW={'200px'}>
                    <Box
                      w={'100%'}
                      fontSize={'xs'}
                      whiteSpace={'pre-wrap'}
                      maxH={'250px'}
                      overflowY={'auto'}
                    >
                      {item.text}
                    </Box>
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
                          text: item.text
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
      {isOpenSelectJsonModal && (
        <SelectJsonModel
          modelId={model._id}
          onClose={onCloseSelectJsonModal}
          onSuccess={refetchData}
        />
      )}
    </>
  );
};

export default ModelDataCard;
