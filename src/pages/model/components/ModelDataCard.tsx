import React, { useEffect, useCallback, useState } from 'react';
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  Checkbox,
  CheckboxGroup,
  ModalCloseButton,
  useDisclosure,
  Input,
  Textarea,
  Stack
} from '@chakra-ui/react';
import type { ModelSchema } from '@/types/mongoSchema';
import { ModelDataSchema } from '@/types/mongoSchema';
import { ModelDataStatusMap } from '@/constants/model';
import { usePaging } from '@/hooks/usePaging';
import ScrollData from '@/components/ScrollData';
import {
  getModelDataList,
  postModelDataInput,
  postModelDataSelect,
  delOneModelData,
  putModelDataById
} from '@/api/model';
import { getDataList } from '@/api/data';
import { DeleteIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { useToast } from '@/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

type FormData = { text: string; q: { val: string }[] };
type TabType = 'input' | 'select';
const defaultValues = {
  text: '',
  q: [{ val: '' }]
};

const ModelDataCard = ({ model }: { model: ModelSchema }) => {
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
  const { toast } = useToast();
  const {
    isOpen: isOpenImportModal,
    onOpen: onOpenImportModal,
    onClose: onCloseImportModal
  } = useDisclosure();
  const { register, handleSubmit, reset, control } = useForm<FormData>({
    defaultValues
  });
  const {
    fields: inputQ,
    append: appendQ,
    remove: removeQ
  } = useFieldArray({
    control,
    name: 'q'
  });

  const importDataTypes: { id: TabType; label: string }[] = [
    { id: 'input', label: '手动输入' },
    { id: 'select', label: '数据集导入' }
  ];
  const [importDataType, setImportDataType] = useState<TabType>(importDataTypes[0].id);
  const [importing, setImporting] = useState(false);

  const updateAnswer = useCallback(async (dataId: string, text: string) => {
    putModelDataById({
      dataId,
      text
    });
  }, []);

  const { data: dataList = [] } = useQuery(['getDataList'], getDataList);
  const [selectDataId, setSelectDataId] = useState<string[]>([]);

  const sureImportData = useCallback(
    async (e: FormData) => {
      setImporting(true);

      try {
        if (importDataType === 'input') {
          await postModelDataInput({
            modelId: model._id,
            data: [
              {
                text: e.text,
                q: e.q.map((item) => ({
                  id: nanoid(),
                  text: item.val
                }))
              }
            ]
          });
        } else if (importDataType === 'select') {
          const res = await postModelDataSelect(model._id, selectDataId);
          console.log(res);
        }

        toast({
          title: '导入数据成功,需要一段时间训练',
          status: 'success'
        });
        onCloseImportModal();
        getData(1, true);
        reset(defaultValues);
      } catch (err) {
        console.log(err);
      }
      setImporting(false);
    },
    [getData, importDataType, model._id, onCloseImportModal, reset, toast]
  );

  return (
    <>
      <Flex>
        <Box fontWeight={'bold'} fontSize={'lg'} flex={1}>
          模型数据: {total}组
        </Box>
        <Button size={'sm'} onClick={onOpenImportModal}>
          导入
        </Button>
      </Flex>
      <ScrollData
        h={'100%'}
        px={6}
        mt={3}
        isLoadAll={isLoadAll}
        requesting={requesting}
        nextPage={nextPage}
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
                  <Td>
                    {item.q.map((item, i) => (
                      <Box
                        key={item.id}
                        fontSize={'xs'}
                        maxW={'350px'}
                        whiteSpace={'pre-wrap'}
                        _notLast={{ mb: 1 }}
                      >
                        Q{i + 1}: {item.text}
                      </Box>
                    ))}
                  </Td>
                  <Td w={'350px'}>
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
                  <Td>{ModelDataStatusMap[item.status]}</Td>
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
      </ScrollData>
      <Modal isOpen={isOpenImportModal} onClose={onCloseImportModal}>
        <ModalOverlay />
        <ModalContent maxW={'min(900px, 90vw)'} maxH={'80vh'} position={'relative'}>
          <Flex alignItems={'center'}>
            <ModalHeader whiteSpace={'nowrap'}>选择数据导入</ModalHeader>
            <Box>
              {importDataTypes.map((item) => (
                <Button
                  key={item.id}
                  size={'sm'}
                  mr={5}
                  variant={item.id === importDataType ? 'solid' : 'outline'}
                  onClick={() => setImportDataType(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </Box>
          </Flex>
          <ModalCloseButton />
          <Box px={6} pb={2} overflowY={'auto'}>
            {importDataType === 'input' && (
              <>
                <Box mb={2}>知识点:</Box>
                <Textarea
                  mb={4}
                  placeholder="知识点"
                  rows={3}
                  maxH={'200px'}
                  {...register(`text`, {
                    required: '知识点'
                  })}
                />
                {inputQ.map((item, index) => (
                  <Box key={item.id} mb={5}>
                    <Box mb={2}>问法{index + 1}:</Box>
                    <Flex>
                      <Input
                        placeholder="问法"
                        {...register(`q.${index}.val`, {
                          required: '问法不能为空'
                        })}
                      ></Input>
                      {inputQ.length > 1 && (
                        <IconButton
                          icon={<DeleteIcon />}
                          aria-label={'delete'}
                          colorScheme={'gray'}
                          variant={'unstyled'}
                          onClick={() => removeQ(index)}
                        />
                      )}
                    </Flex>
                  </Box>
                ))}
              </>
            )}
            {importDataType === 'select' && (
              <CheckboxGroup colorScheme="blue" onChange={(e) => setSelectDataId(e as string[])}>
                {dataList.map((item) => (
                  <Box mb={2} key={item._id}>
                    <Checkbox value={item._id}>
                      <Box fontWeight={'bold'} as={'span'}>
                        {item.name}
                      </Box>
                      <Box as={'span'} ml={2} fontSize={'sm'}>
                        ({item.totalData}条数据)
                      </Box>
                    </Checkbox>
                  </Box>
                ))}
              </CheckboxGroup>
            )}
          </Box>

          <Flex px={6} pt={2} pb={4}>
            {importDataType === 'input' && (
              <Button
                alignSelf={'flex-start'}
                variant={'outline'}
                onClick={() => appendQ({ val: '' })}
              >
                增加问法
              </Button>
            )}
            <Box flex={1}></Box>
            <Button variant={'outline'} mr={3} onClick={onCloseImportModal}>
              取消
            </Button>
            <Button isLoading={importing} onClick={handleSubmit(sureImportData)}>
              确认导入
            </Button>
          </Flex>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ModelDataCard;
