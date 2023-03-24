import React, { Dispatch, useState, useCallback, useMemo } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormErrorMessage,
  Button,
  useToast,
  Input,
  Select,
  Box
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postCreateModel } from '@/api/model';
import type { ModelSchema } from '@/types/mongoSchema';
import { modelList } from '@/constants/model';
import { formatPrice } from '@/utils/user';

interface CreateFormType {
  name: string;
  serviceModelName: string;
}

const CreateModel = ({
  setCreateModelOpen,
  onSuccess
}: {
  setCreateModelOpen: Dispatch<boolean>;
  onSuccess: Dispatch<ModelSchema>;
}) => {
  const [requesting, setRequesting] = useState(false);
  const toast = useToast({
    duration: 2000,
    position: 'top'
  });
  const {
    getValues,
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateFormType>({
    defaultValues: {
      serviceModelName: modelList[0].model
    }
  });

  const handleCreateModel = useCallback(
    async (data: CreateFormType) => {
      setRequesting(true);
      try {
        const res = await postCreateModel(data);
        toast({
          title: '创建成功',
          status: 'success'
        });
        onSuccess(res);
        setCreateModelOpen(false);
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : err.message || '出现了意外',
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [onSuccess, setCreateModelOpen, toast]
  );

  return (
    <>
      <Modal isOpen={true} onClose={() => setCreateModelOpen(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>创建模型</ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            <FormControl mb={8} isInvalid={!!errors.name}>
              <Input
                placeholder="模型名称"
                {...register('name', {
                  required: '模型名不能为空'
                })}
              />
              <FormErrorMessage position={'absolute'} fontSize="xs">
                {!!errors.name && errors.name.message}
              </FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={!!errors.serviceModelName}>
              <Select
                placeholder="选择基础模型类型"
                {...register('serviceModelName', {
                  required: '底层模型不能为空'
                })}
              >
                {modelList.map((item) => (
                  <option key={item.model} value={item.model}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <FormErrorMessage position={'absolute'} fontSize="xs">
                {!!errors.serviceModelName && errors.serviceModelName.message}
              </FormErrorMessage>
            </FormControl>
            <Box mt={3} textAlign={'center'} fontSize={'sm'} color={'blackAlpha.600'}>
              {formatPrice(
                modelList.find((item) => item.model === getValues('serviceModelName'))?.price || 0
              ) * 1000}
              元/1000字(包括上下文和标点符号)
            </Box>
          </ModalBody>

          <ModalFooter>
            <Button mr={3} colorScheme={'gray'} onClick={() => setCreateModelOpen(false)}>
              取消
            </Button>
            <Button isLoading={requesting} onClick={handleSubmit(handleCreateModel)}>
              确认创建
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default CreateModel;
