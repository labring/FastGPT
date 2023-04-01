import React, { useState, useCallback } from 'react';
import {
  Box,
  IconButton,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  Input,
  Textarea
} from '@chakra-ui/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { postModelDataInput } from '@/api/model';
import { useToast } from '@/hooks/useToast';
import { DeleteIcon } from '@chakra-ui/icons';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

type FormData = { text: string; q: string };

const InputDataModal = ({
  onClose,
  onSuccess,
  modelId
}: {
  onClose: () => void;
  onSuccess: () => void;
  modelId: string;
}) => {
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, control } = useForm<FormData>({
    defaultValues: {
      text: '',
      q: ''
    }
  });

  const sureImportData = useCallback(
    async (e: FormData) => {
      setImporting(true);

      try {
        const res = await postModelDataInput({
          modelId: modelId,
          data: [
            {
              text: e.text,
              q: {
                id: nanoid(),
                text: e.q
              }
            }
          ]
        });

        toast({
          title: res === 0 ? '导入数据成功,需要一段时间训练' : '数据导入异常',
          status: res === 0 ? 'success' : 'warning'
        });
        onClose();
        onSuccess();
      } catch (err) {
        console.log(err);
      }
      setImporting(false);
    },
    [modelId, onClose, onSuccess, toast]
  );

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent
        m={0}
        display={'flex'}
        flexDirection={'column'}
        h={'90vh'}
        maxW={'90vw'}
        position={'relative'}
      >
        <ModalHeader>手动导入</ModalHeader>
        <ModalCloseButton />

        <Box
          display={['block', 'flex']}
          flex={'1 0 0'}
          h={['100%', 0]}
          overflowY={'auto'}
          px={6}
          pb={2}
        >
          <Box flex={2} mr={[0, 4]} mb={[4, 0]} h={['230px', '100%']}>
            <Box h={'30px'}>问题</Box>
            <Textarea
              placeholder="相关问题，可以回车输入多个问法, 最多500字"
              maxLength={500}
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register(`q`, {
                required: '相关问题，可以回车输入多个问法'
              })}
            />
          </Box>
          <Box flex={3} h={['330px', '100%']}>
            <Box h={'30px'}>知识点</Box>
            <Textarea
              placeholder="知识点,最多1000字"
              maxLength={1000}
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register(`text`, {
                required: '知识点'
              })}
            />
          </Box>
        </Box>

        <Flex px={6} pt={2} pb={4}>
          <Box flex={1}></Box>
          <Button variant={'outline'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button isLoading={importing} onClick={handleSubmit(sureImportData)}>
            确认导入
          </Button>
        </Flex>
      </ModalContent>
    </Modal>
  );
};

export default InputDataModal;
