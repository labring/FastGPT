import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  Textarea
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postKbDataFromList, putKbDataById } from '@/api/plugins/kb';
import { useToast } from '@/hooks/useToast';

export type FormData = { dataId?: string; a: string; q: string };

const InputDataModal = ({
  onClose,
  onSuccess,
  kbId,
  defaultValues = {
    a: '',
    q: ''
  }
}: {
  onClose: () => void;
  onSuccess: () => void;
  kbId: string;
  defaultValues?: FormData;
}) => {
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const { register, handleSubmit, reset } = useForm<FormData>({
    defaultValues
  });

  /**
   * 确认导入新数据
   */
  const sureImportData = useCallback(
    async (e: FormData) => {
      if (e.a.length + e.q.length >= 3000) {
        toast({
          title: '总长度超长了',
          status: 'warning'
        });
        return;
      }
      setImporting(true);

      try {
        const res = await postKbDataFromList({
          kbId,
          data: [
            {
              a: e.a,
              q: e.q
            }
          ]
        });

        toast({
          title: res === 0 ? '可能已存在完全一致的数据' : '导入数据成功,需要一段时间训练',
          status: 'success'
        });
        reset({
          a: '',
          q: ''
        });
        onSuccess();
      } catch (err: any) {
        toast({
          title: err?.message || '出现了点意外~',
          status: 'error'
        });
        console.log(err);
      }
      setImporting(false);
    },
    [kbId, onSuccess, reset, toast]
  );

  const updateData = useCallback(
    async (e: FormData) => {
      if (!e.dataId) return;

      if (e.a !== defaultValues.a || e.q !== defaultValues.q) {
        await putKbDataById({
          dataId: e.dataId,
          a: e.a,
          q: e.q === defaultValues.q ? '' : e.q
        });
        onSuccess();
      }

      toast({
        title: '修改回答成功',
        status: 'success'
      });
      onClose();
    },
    [defaultValues, onClose, onSuccess, toast]
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
          <Box flex={1} mr={[0, 4]} mb={[4, 0]} h={['230px', '100%']}>
            <Box h={'30px'}>{'匹配的知识点'}</Box>
            <Textarea
              placeholder={'匹配的知识点。这部分内容会被搜索，请把控内容的质量。总和最多 3000 字。'}
              maxLength={3000}
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register(`q`, {
                required: true
              })}
            />
          </Box>
          <Box flex={1} h={['330px', '100%']}>
            <Box h={'30px'}>补充知识</Box>
            <Textarea
              placeholder={
                '补充知识。这部分内容不会被搜索，但会作为"匹配的知识点"的内容补充，你可以讲一些细节的内容填写在这里。总和最多 3000 字。'
              }
              maxLength={3000}
              resize={'none'}
              h={'calc(100% - 30px)'}
              {...register('a')}
            />
          </Box>
        </Box>

        <Flex px={6} pt={2} pb={4}>
          <Box flex={1}></Box>
          <Button variant={'outline'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={importing}
            onClick={handleSubmit(defaultValues.dataId ? updateData : sureImportData)}
          >
            确认导入
          </Button>
        </Flex>
      </ModalContent>
    </Modal>
  );
};

export default InputDataModal;
