import React, { useState, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Box,
  Flex,
  Textarea
} from '@chakra-ui/react';
import { useTabs } from '@/hooks/useTabs';
import { useConfirm } from '@/hooks/useConfirm';
import { useSelectFile } from '@/hooks/useSelectFile';
import { readTxtContent, readPdfContent, readDocContent } from '@/utils/tools';
import { postSplitData } from '@/api/data';
import { useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { useLoading } from '@/hooks/useLoading';
import { formatPrice } from '@/utils/user';
import { modelList, ChatModelNameEnum } from '@/constants/model';

const fileExtension = '.txt,.doc,.docx,.pdf,.md';

const ImportDataModal = ({
  dataId,
  onClose,
  onSuccess
}: {
  dataId: string;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { openConfirm, ConfirmChild } = useConfirm({
    content: '确认提交生成任务？该任务无法终止！'
  });
  const { toast } = useToast();
  const { setIsLoading, Loading } = useLoading();
  const { File, onOpen } = useSelectFile({ fileType: fileExtension, multiple: true });
  const { tabs, activeTab, setActiveTab } = useTabs({
    tabs: [
      { id: 'text', label: '文本' },
      { id: 'doc', label: '文件' }
      // { id: 'url', label: '链接' }
    ]
  });

  const [textInput, setTextInput] = useState('');
  const [fileText, setFileText] = useState('');

  const { mutate: handleClickSubmit, isLoading } = useMutation({
    mutationFn: async () => {
      let text = '';
      if (activeTab === 'text') {
        text = textInput;
      } else if (activeTab === 'doc') {
        text = fileText;
      } else if (activeTab === 'url') {
      }
      if (!text) return;
      return postSplitData(dataId, text);
    },
    onSuccess() {
      toast({
        title: '任务提交成功',
        status: 'success'
      });
      onClose();
      onSuccess();
    },
    onError(err: any) {
      toast({
        title: err?.message || '提交任务异常',
        status: 'error'
      });
    }
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      setIsLoading(true);
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
      } catch (error: any) {
        console.log(error);
        toast({
          title: typeof error === 'string' ? error : '解析文件失败',
          status: 'error'
        });
      }
      setIsLoading(false);
    },
    [setIsLoading, toast]
  );

  return (
    <Modal isOpen={true} onClose={onClose}>
      <ModalOverlay />
      <ModalContent position={'relative'} maxW={['90vw', '800px']}>
        <ModalHeader>
          导入数据，生成QA
          <Box ml={2} as={'span'} fontSize={'sm'} color={'blackAlpha.600'}>
            {formatPrice(
              modelList.find((item) => item.model === ChatModelNameEnum.GPT35)?.price || 0,
              1000
            )}
            元/1K tokens
          </Box>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody display={'flex'}>
          <Box>
            {tabs.map((item) => (
              <Button
                key={item.id}
                display={'block'}
                variant={activeTab === item.id ? 'solid' : 'outline'}
                _notLast={{
                  mb: 3
                }}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </Box>

          <Box flex={'1 0 0'} w={0} ml={3} minH={'200px'}>
            {activeTab === 'text' && (
              <>
                <Textarea
                  h={'100%'}
                  maxLength={-1}
                  value={textInput}
                  placeholder={'请粘贴或输入需要处理的文本'}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                <Box mt={2}>一共 {textInput.length} 个字</Box>
              </>
            )}
            {activeTab === 'doc' && (
              <Flex
                flexDirection={'column'}
                p={2}
                h={'100%'}
                alignItems={'center'}
                justifyContent={'center'}
                border={'1px solid '}
                borderColor={'blackAlpha.200'}
                borderRadius={'md'}
              >
                <Button onClick={onOpen}>选择文件</Button>
                <Box mt={2}>支持 {fileExtension} 文件</Box>
                {fileText && (
                  <>
                    <Box mt={2}>一共 {fileText.length} 个字</Box>
                    <Box
                      maxH={'300px'}
                      w={'100%'}
                      overflow={'auto'}
                      p={2}
                      backgroundColor={'blackAlpha.50'}
                      whiteSpace={'pre'}
                      fontSize={'xs'}
                    >
                      {fileText}
                    </Box>
                  </>
                )}
              </Flex>
            )}
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme={'gray'} onClick={onClose}>
            取消
          </Button>
          <Button
            ml={3}
            isLoading={isLoading}
            isDisabled={!textInput && !fileText}
            onClick={openConfirm(handleClickSubmit)}
          >
            确认
          </Button>
        </ModalFooter>
        <Loading />
      </ModalContent>

      <ConfirmChild />
      <File onSelect={onSelectFile} />
    </Modal>
  );
};

export default ImportDataModal;
