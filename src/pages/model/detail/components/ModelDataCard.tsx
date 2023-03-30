import React, { useCallback } from 'react';
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
  Textarea,
  Menu,
  MenuButton,
  MenuList,
  MenuItem
} from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import { ModelDataSchema } from '@/types/mongoSchema';
import { ModelDataStatusMap } from '@/constants/model';
import { usePagination } from '@/hooks/usePagination';
import {
  getModelDataList,
  delOneModelData,
  putModelDataById,
  getModelSplitDataList
} from '@/api/model';
import { DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';

const InputModel = dynamic(() => import('./InputDataModal'));
const SelectModel = dynamic(() => import('./SelectFileModal'));

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
  const { toast } = useToast();
  const { Loading } = useLoading();

  const {
    data: modelDataList,
    isLoading,
    Pagination,
    total,
    getData,
    pageNum
  } = usePagination<ModelDataSchema>({
    api: getModelDataList,
    pageSize: 10,
    params: {
      modelId: model._id
    }
  });

  const updateAnswer = useCallback(
    async (dataId: string, text: string) => {
      await putModelDataById({
        dataId,
        text
      });
      toast({
        title: '修改回答成功',
        status: 'success'
      });
    },
    [toast]
  );

  const {
    isOpen: isOpenInputModal,
    onOpen: onOpenInputModal,
    onClose: onCloseInputModal
  } = useDisclosure();
  const {
    isOpen: isOpenSelectModal,
    onOpen: onOpenSelectModal,
    onClose: onCloseSelectModal
  } = useDisclosure();

  const { data, refetch } = useQuery(['getModelSplitDataList'], () =>
    getModelSplitDataList(model._id)
  );

  const refetchData = useCallback(
    (num = 1) => {
      getData(num);
      refetch();
    },
    [getData, refetch]
  );

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1}>
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
          onClick={() => refetchData(pageNum)}
        />
        <Menu>
          <MenuButton as={Button}>导入</MenuButton>
          <MenuList>
            <MenuItem onClick={onOpenInputModal}>手动输入</MenuItem>
            <MenuItem onClick={onOpenSelectModal}>文件导入</MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      {data && data.length > 0 && <Box fontSize={'xs'}>{data.length}条数据正在拆分中...</Box>}
      <Box mt={4}>
        <TableContainer h={'600px'} overflowY={'auto'}>
          <Table variant={'simple'}>
            <Thead>
              <Tr>
                <Th>Question</Th>
                <Th>Text</Th>
                <Th>Status</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {modelDataList.map((item) => (
                <Tr key={item._id}>
                  <Td w={'350px'}>
                    {item.q.map((item, i) => (
                      <Box
                        key={item.id}
                        fontSize={'xs'}
                        w={'100%'}
                        whiteSpace={'pre-wrap'}
                        _notLast={{ mb: 1 }}
                      >
                        Q{i + 1}:{' '}
                        <Box as={'span'} userSelect={'all'}>
                          {item.text}
                        </Box>
                      </Box>
                    ))}
                  </Td>
                  <Td minW={'200px'}>
                    <Textarea
                      w={'100%'}
                      h={'100%'}
                      defaultValue={item.text}
                      fontSize={'xs'}
                      resize={'both'}
                      onBlur={(e) => {
                        const oldVal = modelDataList.find((data) => item._id === data._id)?.text;
                        if (oldVal !== e.target.value) {
                          updateAnswer(item._id, e.target.value);
                        }
                      }}
                    ></Textarea>
                  </Td>
                  <Td w={'100px'}>{ModelDataStatusMap[item.status]}</Td>
                  <Td>
                    <IconButton
                      icon={<DeleteIcon />}
                      variant={'outline'}
                      colorScheme={'gray'}
                      aria-label={'delete'}
                      size={'sm'}
                      onClick={async () => {
                        await delOneModelData(item._id);
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
      {isOpenInputModal && (
        <InputModel modelId={model._id} onClose={onCloseInputModal} onSuccess={refetchData} />
      )}
      {isOpenSelectModal && (
        <SelectModel modelId={model._id} onClose={onCloseSelectModal} onSuccess={refetchData} />
      )}
    </>
  );
};

export default ModelDataCard;
