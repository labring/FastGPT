import React, { useState } from 'react';
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
  Input
} from '@chakra-ui/react';
import { getDataList, updateDataName, delData } from '@/api/data';
import { usePaging } from '@/hooks/usePaging';
import type { DataListItem } from '@/types/data';
import ScrollData from '@/components/ScrollData';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import { useConfirm } from '@/hooks/useConfirm';
import { useRequest } from '@/hooks/useRequest';

const CreateDataModal = dynamic(() => import('./components/CreateDataModal'));
const ImportDataModal = dynamic(() => import('./components/ImportDataModal'));

const DataList = () => {
  const {
    nextPage,
    isLoadAll,
    requesting,
    data: dataList,
    getData
  } = usePaging<DataListItem>({
    api: getDataList,
    pageSize: 20
  });
  const [ImportDataId, setImportDataId] = useState<string>();
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '删除数据集，将删除里面的所有内容，请确认！'
  });

  const {
    isOpen: isOpenCreateDataModal,
    onOpen: onOpenCreateDataModal,
    onClose: onCloseCreateDataModal
  } = useDisclosure();

  const { mutate: handleDelData, isLoading: isDeleting } = useRequest({
    mutationFn: (dataId: string) => delData(dataId),
    successToast: '删除数据集成功',
    errorToast: '删除数据集异常',
    onSuccess() {
      getData(1, true);
    }
  });

  return (
    <Box display={['block', 'flex']} flexDirection={'column'} h={'100%'}>
      <Card px={6} py={4}>
        <Flex>
          <Box flex={1} mr={1}>
            <Box fontSize={'xl'} fontWeight={'bold'}>
              对话数据管理
            </Box>
            <Box fontSize={'xs'} color={'blackAlpha.600'}>
              允许你将任意文本数据拆分成 QA 的形式。你可以使用这些 QA 去微调你的对话模型。
            </Box>
          </Box>
          <Button variant={'outline'} onClick={onOpenCreateDataModal}>
            创建数据集
          </Button>
        </Flex>
      </Card>
      {/* 数据表 */}
      <Card mt={3} flex={'1 0 0'} h={['auto', '0']} px={6} py={4}>
        <ScrollData h={'100%'} nextPage={nextPage} isLoadAll={isLoadAll} requesting={requesting}>
          <TableContainer>
            <Table>
              <Thead>
                <Tr>
                  <Th>集合名</Th>
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
                        placeholder="请输入数据集名称"
                        defaultValue={item.name}
                        size={'sm'}
                        onBlur={(e) => {
                          if (!e.target.value) return;
                          updateDataName(item._id, e.target.value);
                        }}
                      />
                    </Td>
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
                        onClick={() => setImportDataId(item._id)}
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
                      <Button mr={2} size={'sm'}>
                        导出
                      </Button>
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
        </ScrollData>
      </Card>

      {ImportDataId && (
        <ImportDataModal dataId={ImportDataId} onClose={() => setImportDataId(undefined)} />
      )}
      {isOpenCreateDataModal && (
        <CreateDataModal onClose={onCloseCreateDataModal} onSuccess={() => getData(1, true)} />
      )}
      <ConfirmChild />
    </Box>
  );
};

export default DataList;
