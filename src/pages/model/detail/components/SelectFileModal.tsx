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
  ModalBody,
  Input,
  Textarea
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
  const [prompt, setPrompt] = useState('');
  const { File, onOpen } = useSelectFile({ fileType: fileExtension, multiple: true });
  const [fileText, setFileText] = useState('');
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认导入该文件，需要一定时间进行拆解，该任务无法终止！如果余额不足，任务讲被终止。'
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
          .join(' ')
          .replace(/(\\n|\n)+/g, '\n');
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
      await postModelDataFileText({
        modelId,
        text: fileText,
        prompt: `下面是${prompt || '一段长文本'}`
      });
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
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW={'min(900px, 90vw)'} m={0} position={'relative'} h={'90vh'}>
        <ModalHeader>文件导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody
          display={'flex'}
          flexDirection={'column'}
          p={4}
          h={'100%'}
          alignItems={'center'}
          justifyContent={'center'}
          fontSize={'sm'}
        >
          <Button isLoading={selecting} onClick={onOpen}>
            选择文件
          </Button>
          <Box mt={2} maxW={['100%', '70%']}>
            支持 {fileExtension} 文件。模型会自动对文本进行 QA 拆分，需要较长训练时间，拆分需要消耗
            tokens，大约0.04元/1k tokens，请确保账号余额充足。
          </Box>
          <Box mt={2}>
            一共 {fileText.length} 个字，{encode(fileText).length} 个tokens
          </Box>
          <Flex w={'100%'} alignItems={'center'} my={4}>
            <Box flex={'0 0 auto'} mr={2}>
              下面是
            </Box>
            <Input
              placeholder="提示词，例如: Laf的介绍/关于gpt4的论文/一段长文本"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              size={'sm'}
            />
          </Flex>
          <Textarea
            flex={'1 0 0'}
            h={0}
            w={'100%'}
            placeholder="文件内容"
            maxLength={-1}
            resize={'none'}
            fontSize={'xs'}
            whiteSpace={'pre-wrap'}
            value={fileText}
            onChange={(e) => setFileText(e.target.value)}
          />
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
