import React, { useState, useCallback } from 'react';
import {
  Card,
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useDisclosure,
  Input,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import { getDataList, updateDataName, delData, getDataItems } from '@/api/data';
import type { DataListItem } from '@/types/data';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useConfirm } from '@/hooks/useConfirm';
import { useRequest } from '@/hooks/useRequest';
import { DataItemSchema } from '@/types/mongoSchema';
import { DataTypeTextMap } from '@/constants/data';
import { customAlphabet } from 'nanoid';
import { useQuery } from '@tanstack/react-query';
const nanoid = customAlphabet('.,', 1);

const CreateDataModal = dynamic(() => import('./components/CreateDataModal'));
const ImportDataModal = dynamic(() => import('./components/ImportDataModal'));

export type ExportDataType = 'jsonl' | 'txt';

const DataList = () => {
  const router = useRouter();
  const [ImportDataId, setImportDataId] = useState<string>();
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '删除数据集，将删除里面的所有内容，请确认！'
  });

  const {
    isOpen: isOpenCreateDataModal,
    onOpen: onOpenCreateDataModal,
    onClose: onCloseCreateDataModal
  } = useDisclosure();

  const { data: dataList = [], refetch } = useQuery(['getDataList'], getDataList, {
    refetchInterval: 10000
  });

  const { mutate: handleDelData, isLoading: isDeleting } = useRequest({
    mutationFn: (dataId: string) => delData(dataId),
    successToast: '删除数据集成功',
    errorToast: '删除数据集异常',
    onSuccess() {
      refetch();
    }
  });

  const { mutate: handleExportData, isLoading: isExporting } = useRequest({
    mutationFn: async ({ data, type }: { data: DataListItem; type: ExportDataType }) => ({
      type,
      data: await getDataItems({ dataId: data._id, pageNum: 1, pageSize: data.totalData }).then(
        (res) => res.data
      )
    }),
    successToast: '导出数据集成功',
    errorToast: '导出数据集异常',
    onSuccess(res: { type: ExportDataType; data: DataItemSchema[] }) {
      // 合并数据
      const data = res.data.map((item) => item.result).flat();
      let text = '';
      // 生成 jsonl
      data.forEach((item) => {
        if (res.type === 'jsonl' && item.q && item.a) {
          const result = JSON.stringify({
            prompt: `${item.q.toLocaleLowerCase()}${nanoid()}</s>`,
            completion: ` ${item.a}###`
          });
          text += `${result}\n`;
        } else if (res.type === 'txt' && item.abstract) {
          text += `${item.abstract}\n`;
        }
      });
      // 去掉最后一个 \n
      text = text.substring(0, text.length - 1);

      // 导出为文件
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });

      // 创建下载链接
      const downloadLink = document.createElement('a');
      downloadLink.href = window.URL.createObjectURL(blob);
      downloadLink.download = `data.${res.type}`;

      // 添加链接到页面并触发下载
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  });

  return (
    <Box display={['block', 'flex']} flexDirection={'column'} h={'100%'}>
      <Card px={6} py={4}>
        <Flex>
          <Box flex={1} mr={1}>
            <Box fontSize={'xl'} fontWeight={'bold'}>
              训练数据管理
            </Box>
            <Box fontSize={'xs'} color={'blackAlpha.600'}>
              允许你将任意文本数据拆分成 QA 形式，或者进行文本摘要总结。
            </Box>
          </Box>
          <Button variant={'outline'} onClick={onOpenCreateDataModal}>
            创建数据集
          </Button>
        </Flex>
      </Card>
      {/* 数据表 */}
      <TableContainer
        mt={3}
        flex={'1 0 0'}
        h={['auto', '0']}
        overflowY={'auto'}
        px={6}
        py={4}
        backgroundColor={'white'}
        borderRadius={'md'}
        boxShadow={'base'}
      >
        <Table>
          <Thead>
            <Tr>
              <Th>集合名</Th>
              <Th>类型</Th>
              <Th>创建时间</Th>
              <Th>训练中 / 总数据</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {dataList.map((item, i) => (
              <Tr key={item._id}>
                <Td>
                  <Input
                    minW={'150px'}
                    placeholder="请输入数据集名称"
                    defaultValue={item.name}
                    size={'sm'}
                    onBlur={(e) => {
                      if (!e.target.value || e.target.value === item.name) return;
                      updateDataName(item._id, e.target.value);
                    }}
                  />
                </Td>
                <Td>{DataTypeTextMap[item.type || 'QA']}</Td>
                <Td>{dayjs(item.createTime).format('YYYY/MM/DD HH:mm')}</Td>
                <Td>
                  {item.trainingData} / {item.totalData}
                </Td>
                <Td>
                  <Button
                    size={'sm'}
                    variant={'outline'}
                    colorScheme={'gray'}
                    mr={2}
                    onClick={() =>
                      router.push(`/data/detail?dataId=${item._id}&dataName=${item.name}`)
                    }
                  >
                    详细
                  </Button>
                  <Button
                    size={'sm'}
                    variant={'outline'}
                    mr={2}
                    onClick={() => setImportDataId(item._id)}
                  >
                    导入
                  </Button>
                  {/* <Menu>
                    <MenuButton as={Button} mr={2} size={'sm'} isLoading={isExporting}>
                      导出
                    </MenuButton>
                    <MenuList>
                      {item.type === 'QA' && (
                        <MenuItem onClick={() => handleExportData({ data: item, type: 'jsonl' })}>
                          jsonl
                        </MenuItem>
                      )}
                      {item.type === 'abstract' && (
                        <MenuItem onClick={() => handleExportData({ data: item, type: 'txt' })}>
                          txt
                        </MenuItem>
                      )}
                    </MenuList>
                  </Menu> */}

                  <Button
                    size={'sm'}
                    colorScheme={'red'}
                    isLoading={isDeleting}
                    onClick={openConfirm(() => handleDelData(item._id))}
                  >
                    删除
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {ImportDataId && (
        <ImportDataModal
          dataId={ImportDataId}
          onClose={() => setImportDataId(undefined)}
          onSuccess={refetch}
        />
      )}
      {isOpenCreateDataModal && (
        <CreateDataModal onClose={onCloseCreateDataModal} onSuccess={refetch} />
      )}
      <ConfirmChild />
    </Box>
  );
};

export default DataList;
