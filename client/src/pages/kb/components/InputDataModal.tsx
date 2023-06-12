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
  Textarea,
  IconButton
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postKbDataFromList, putKbDataById, delOneKbDataByDataId } from '@/api/plugins/kb';
import { useToast } from '@/hooks/useToast';
import { TrainingModeEnum } from '@/constants/plugin';
import { getErrText } from '@/utils/tools';
import MyIcon from '@/components/Icon';

export type FormData = { dataId?: string; a: string; q: string };

const InputDataModal = ({
  onClose,
  onSuccess,
  onDelete,
  kbId,
  defaultValues = {
    a: '',
    q: ''
  }
}: {
  onClose: () => void;
  onSuccess: (data: FormData) => void;
  onDelete?: () => void;
  kbId: string;
  defaultValues?: FormData;
}) => {
  const [loading, setLoading] = useState(false);
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
      setLoading(true);

      try {
        const data = {
          a: e.a,
          q: e.q,
          source: '手动录入'
        };
        const { insertLen } = await postKbDataFromList({
          kbId,
          mode: TrainingModeEnum.index,
          data: [data]
        });

        if (insertLen === 0) {
          toast({
            title: '已存在完全一致的数据',
            status: 'warning'
          });
        } else {
          toast({
            title: '导入数据成功,需要一段时间训练',
            status: 'success'
          });
          reset({
            a: '',
            q: ''
          });
        }

        onSuccess(data);
      } catch (err: any) {
        toast({
          title: getErrText(err, '出现了点意外~'),
          status: 'error'
        });
      }
      setLoading(false);
    },
    [kbId, onSuccess, reset, toast]
  );

  const updateData = useCallback(
    async (e: FormData) => {
      if (!e.dataId) return;

      if (e.a !== defaultValues.a || e.q !== defaultValues.q) {
        setLoading(true);
        try {
          const data = {
            dataId: e.dataId,
            a: e.a,
            q: e.q === defaultValues.q ? '' : e.q
          };
          await putKbDataById(data);
          onSuccess(data);
        } catch (error) {}
        setLoading(false);
      }

      toast({
        title: '修改数据成功',
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
        <ModalHeader>{defaultValues.dataId ? '变更数据' : '手动导入数据'}</ModalHeader>
        <ModalCloseButton />

        <Box
          display={'flex'}
          flexDirection={['column', 'row']}
          flex={'1 0 0'}
          h={['100%', 0]}
          overflow={'overlay'}
          px={6}
          pb={2}
        >
          <Box flex={1} mr={[0, 4]} mb={[4, 0]} h={['50%', '100%']}>
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
          <Box flex={1} h={['50%', '100%']}>
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

        <Flex px={6} pt={2} pb={4} alignItems={'center'}>
          <Box flex={1}>
            {defaultValues.dataId && onDelete && (
              <IconButton
                variant={'outline'}
                icon={<MyIcon name={'delete'} w={'16px'} h={'16px'} />}
                aria-label={''}
                isLoading={loading}
                size={'sm'}
                _hover={{
                  color: 'red.600',
                  borderColor: 'red.600'
                }}
                onClick={async () => {
                  if (!onDelete || !defaultValues.dataId) return;
                  try {
                    await delOneKbDataByDataId(defaultValues.dataId);
                    onDelete();
                    onClose();
                  } catch (error) {
                    toast({
                      status: 'warning',
                      title: getErrText(error)
                    });
                    console.log(error);
                  }
                }}
              />
            )}
          </Box>
          <Button variant={'base'} mr={3} isLoading={loading} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={loading}
            onClick={handleSubmit(defaultValues.dataId ? updateData : sureImportData)}
          >
            {defaultValues.dataId ? '确认变更' : '确认导入'}
          </Button>
        </Flex>
      </ModalContent>
    </Modal>
  );
};

export default InputDataModal;
