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

type FormData = { text: string; q: { val: string }[] };

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
      q: [{ val: '' }]
    }
  });
  const {
    fields: inputQ,
    append: appendQ,
    remove: removeQ
  } = useFieldArray({
    control,
    name: 'q'
  });

  const sureImportData = useCallback(
    async (e: FormData) => {
      setImporting(true);

      try {
        await postModelDataInput({
          modelId: modelId,
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

        toast({
          title: '导入数据成功,需要一段时间训练',
          status: 'success'
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
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent maxW={'min(900px, 90vw)'} maxH={'80vh'} position={'relative'}>
        <ModalHeader>手动导入</ModalHeader>
        <ModalCloseButton />
        <Box px={6} pb={2} overflowY={'auto'}>
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
        </Box>

        <Flex px={6} pt={2} pb={4}>
          <Button alignSelf={'flex-start'} variant={'outline'} onClick={() => appendQ({ val: '' })}>
            增加问法
          </Button>
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
