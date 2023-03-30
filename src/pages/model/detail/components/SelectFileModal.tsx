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
  ModalBody
} from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useSelectFile } from '@/hooks/useSelectFile';
import { customAlphabet } from 'nanoid';
import { encode } from 'gpt-token-utils';
import { useConfirm } from '@/hooks/useConfirm';
import { readTxtContent, readPdfContent, readDocContent } from '@/utils/tools';
import { useMutation } from '@tanstack/react-query';
import { postModelDataFileText } from '@/api/model';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const fileExtension = '.txt,.doc,.docx,.pdf,.md';

const SelectFileModal = ({
  onClose,
  onSuccess,
  modelId
}: {
  onClose: () => void;
  onSuccess: () => void;
  modelId: string;
}) => {
  const [selecting, setSelecting] = useState(false);
  const { toast } = useToast();
  const { File, onOpen } = useSelectFile({ fileType: fileExtension, multiple: true });
  const [fileText, setFileText] = useState('');
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认导入该文件，需要一定时间进行拆解，该任务无法终止！'
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      setSelecting(true);
      try {
        const fileTexts = (
          await Promise.all(
            e.map((file) => {
              // @ts-ignore
              const extension = file?.name?.split('.').pop().toLowerCase();
              switch (extension) {
                case 'txt':
                case 'md':
                  return readTxtContent(file);
                case 'pdf':
                  return readPdfContent(file);
                case 'doc':
                case 'docx':
                  return readDocContent(file);
                default:
                  return '';
              }
            })
          )
        )
          .join('\n')
          .replace(/\n+/g, '\n');
        setFileText(fileTexts);
        console.log(encode(fileTexts));
      } catch (error: any) {
        console.log(error);
        toast({
          title: typeof error === 'string' ? error : '解析文件失败',
          status: 'error'
        });
      }
      setSelecting(false);
    },
    [setSelecting, toast]
  );

  const { mutate, isLoading } = useMutation({
    mutationFn: async () => {
      if (!fileText) return;
      await postModelDataFileText(modelId, fileText);
      toast({
        title: '导入数据成功,需要一段拆解和训练',
        status: 'success'
      });
      onClose();
      onSuccess();
    },
    onError() {
      toast({
        title: '导入文件失败',
        status: 'error'
      });
    }
  });

  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent maxW={'min(900px, 90vw)'} position={'relative'}>
        <ModalHeader>文件导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <Flex
            flexDirection={'column'}
            p={2}
            h={'100%'}
            alignItems={'center'}
            justifyContent={'center'}
            fontSize={'sm'}
          >
            <Button isLoading={selecting} onClick={onOpen}>
              选择文件
            </Button>
            <Box mt={2}>支持 {fileExtension} 文件. 会先对文本进行拆分，需要时间较长。</Box>
            <Box mt={2}>
              一共 {fileText.length} 个字，{encode(fileText).length} 个tokens
            </Box>
            <Box
              h={'300px'}
              w={'100%'}
              overflow={'auto'}
              p={2}
              backgroundColor={'blackAlpha.50'}
              whiteSpace={'pre'}
              fontSize={'xs'}
            >
              {fileText}
            </Box>
          </Flex>
        </ModalBody>

        <Flex px={6} pt={2} pb={4}>
          <Box flex={1}></Box>
          <Button variant={'outline'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button isLoading={isLoading} isDisabled={fileText === ''} onClick={openConfirm(mutate)}>
            确认导入
          </Button>
        </Flex>
      </ModalContent>
      <ConfirmChild />
      <File onSelect={onSelectFile} />
    </Modal>
  );
};

export default SelectFileModal;
