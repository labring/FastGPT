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
import { usePaging } from '@/hooks/usePaging';
import ScrollData from '@/components/ScrollData';
import { getModelDataList, delOneModelData, putModelDataById } from '@/api/model';
import { DeleteIcon, RepeatIcon } from '@chakra-ui/icons';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import dynamic from 'next/dynamic';

const InputModel = dynamic(() => import('./InputDataModal'));
const SelectModel = dynamic(() => import('./SelectFileModal'));

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
  const { toast } = useToast();
  const { Loading } = useLoading();

  const {
    nextPage,
    isLoadAll,
    requesting,
    data: modelDataList,
    total,
    setData,
    getData
  } = usePaging<ModelDataSchema>({
    api: getModelDataList,
    pageSize: 20,
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
          onClick={() => getData(1, true)}
        />
        <Menu>
          <MenuButton as={Button}>导入</MenuButton>
          <MenuList>
            <MenuItem onClick={onOpenInputModal}>手动输入</MenuItem>
            <MenuItem onClick={onOpenSelectModal}>文件导入</MenuItem>
          </MenuList>
        </Menu>
      </Flex>
      <ScrollData
        h={'100%'}
        px={6}
        mt={3}
        isLoadAll={isLoadAll}
        requesting={requesting}
        nextPage={nextPage}
        position={'relative'}
      >
        <TableContainer mt={4}>
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
                          setData((state) =>
                            state.map((data) => ({
                              ...data,
                              text: data._id === item._id ? e.target.value : data.text
                            }))
                          );
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
                        delOneModelData(item._id);
                        setData((state) => state.filter((data) => data._id !== item._id));
                      }}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        <Loading loading={requesting} fixed={false} />
      </ScrollData>
      {isOpenInputModal && (
        <InputModel
          modelId={model._id}
          onClose={onCloseInputModal}
          onSuccess={() => getData(1, true)}
        />
      )}
      {isOpenSelectModal && (
        <SelectModel
          modelId={model._id}
          onClose={onCloseSelectModal}
          onSuccess={() => getData(1, true)}
        />
      )}
    </>
  );
};

export default ModelDataCard;
