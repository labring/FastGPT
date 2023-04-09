import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Input,
  Select,
  FormControl,
  FormErrorMessage
} from '@chakra-ui/react';
import { postData } from '@/api/data';
import { useMutation } from '@tanstack/react-query';
import { useForm, SubmitHandler } from 'react-hook-form';
import { DataType } from '@/types/data';
import { DataTypeTextMap } from '@/constants/data';

export interface CreateDataProps {
  name: string;
  type: DataType;
}

const CreateDataModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [inputVal, setInputVal] = useState('');
  const {
    getValues,
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateDataProps>({
    defaultValues: {
      name: '',
      type: 'abstract'
    }
  });

  const { isLoading, mutate } = useMutation({
    mutationFn: (e: CreateDataProps) => postData(e),
    onSuccess() {
      onSuccess();
      onClose();
    }
  });

  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>创建数据集</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <FormControl mb={8} isInvalid={!!errors.name}>
            <Input
              placeholder="数据集名称"
              {...register('name', {
                required: '数据集名称不能为空'
              })}
            />
            <FormErrorMessage position={'absolute'} fontSize="xs">
              {!!errors.name && errors.name.message}
            </FormErrorMessage>
          </FormControl>
          <FormControl>
            <Select placeholder="数据集类型" {...register('type', {})}>
              {Object.entries(DataTypeTextMap).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </Select>
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme={'gray'} onClick={onClose}>
            取消
          </Button>
          <Button ml={3} isLoading={isLoading} onClick={handleSubmit(mutate as any)}>
            确认
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CreateDataModal;
