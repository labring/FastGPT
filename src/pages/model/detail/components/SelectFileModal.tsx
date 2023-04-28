import React, { useState, useCallback, useMemo } from 'react';
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
import { useConfirm } from '@/hooks/useConfirm';
import { readTxtContent, readPdfContent, readDocContent } from '@/utils/file';
import { useMutation } from '@tanstack/react-query';
import { postModelDataSplitData } from '@/api/model';
import { formatPrice } from '@/utils/user';
import Radio from '@/components/Radio';
import { splitText } from '@/utils/file';
import { countChatTokens } from '@/utils/tools';

const fileExtension = '.txt,.doc,.docx,.pdf,.md';

const modeMap = {
  qa: {
    maxLen: 2800,
    slideLen: 800,
    price: 4,
    isPrompt: true
  },
  subsection: {
    maxLen: 800,
    slideLen: 300,
    price: 0.4,
    isPrompt: false
  }
};

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
  const [mode, setMode] = useState<'qa' | 'subsection'>('qa');
  const [fileTextArr, setFileTextArr] = useState<string[]>(['']);
  const [splitRes, setSplitRes] = useState<{ tokens: number; chunks: string[] }>({
    tokens: 0,
    chunks: []
  });
  const { openConfirm, ConfirmChild } = useConfirm({
    content: `确认导入该文件，需要一定时间进行拆解，该任务无法终止！如果余额不足，未完成的任务会被直接清除。一共 ${
      splitRes.chunks.length
    } 组，大约 ${splitRes.tokens || '数量太多,未计算'} 个tokens, 约 ${formatPrice(
      splitRes.tokens * modeMap[mode].price
    )} 元`
  });

  const onSelectFile = useCallback(
    async (e: File[]) => {
      setSelecting(true);
      try {
        let promise = Promise.resolve();
        e.map((file) => {
          promise = promise.then(async () => {
            const extension = file?.name?.split('.')?.pop()?.toLowerCase();
            let text = '';
            switch (extension) {
              case 'txt':
              case 'md':
                text = await readTxtContent(file);
                break;
              case 'pdf':
                text = await readPdfContent(file);
                break;
              case 'doc':
              case 'docx':
                text = await readDocContent(file);
                break;
            }
            text && setFileTextArr((state) => [text].concat(state));
            return;
          });
        });
        await promise;
      } catch (error: any) {
        console.log(error);
        toast({
          title: typeof error === 'string' ? error : '解析文件失败',
          status: 'error'
        });
      }
      setSelecting(false);
    },
    [toast]
  );

  const { mutate, isLoading } = useMutation({
    mutationFn: async () => {
      if (splitRes.chunks.length === 0) return;

      await postModelDataSplitData({
        modelId,
        chunks: splitRes.chunks,
        prompt: `下面是"${prompt || '一段长文本'}"`,
        mode
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

  const onclickImport = useCallback(() => {
    const chunks = fileTextArr
      .filter((item) => item)
      .map((item) =>
        splitText({
          text: item,
          ...modeMap[mode]
        })
      )
      .flat();

    let tokens: number[] = [];

    // just count 100 sets of tokens
    if (chunks.length < 100) {
      tokens = chunks.map((item) =>
        countChatTokens({ messages: [{ role: 'system', content: item }] })
      );
    }

    setSplitRes({
      tokens: tokens.reduce((sum, item) => sum + item, 0),
      chunks
    });

    openConfirm(mutate)();
  }, [fileTextArr, mode, mutate, openConfirm]);

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent maxW={'min(1000px, 90vw)'} m={0} position={'relative'} h={'90vh'}>
        <ModalHeader>文件导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody
          display={'flex'}
          flexDirection={'column'}
          p={0}
          h={'100%'}
          alignItems={'center'}
          justifyContent={'center'}
          fontSize={'sm'}
        >
          <Box mt={2} px={5} maxW={['100%', '70%']} textAlign={'justify'} color={'blackAlpha.600'}>
            支持 {fileExtension} 文件。模型会自动对文本进行 QA 拆分，需要较长训练时间，拆分需要消耗
            tokens，账号余额不足时，未拆分的数据会被删除。一个{fileTextArr.length}个文本。
          </Box>
          {/* 拆分模式 */}
          <Flex w={'100%'} px={5} alignItems={'center'} mt={4}>
            <Box flex={'0 0 70px'}>分段模式:</Box>
            <Radio
              ml={3}
              list={[
                { label: 'QA拆分', value: 'qa' },
                { label: '直接分段', value: 'subsection' }
              ]}
              value={mode}
              onChange={(e) => setMode(e as 'subsection' | 'qa')}
            />
          </Flex>
          {/* 内容介绍 */}
          {modeMap[mode].isPrompt && (
            <Flex w={'100%'} px={5} alignItems={'center'} mt={4}>
              <Box flex={'0 0 70px'} mr={2}>
                下面是
              </Box>
              <Input
                placeholder="提示词，例如: Laf的介绍/关于gpt4的论文/一段长文本"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                size={'sm'}
              />
            </Flex>
          )}
          {/* 文本内容 */}
          <Box flex={'1 0 0'} px={5} h={0} w={'100%'} overflowY={'auto'} mt={4}>
            {fileTextArr.slice(0, 100).map((item, i) => (
              <Box key={i} mb={5}>
                <Box mb={1}>文本{i + 1}</Box>
                <Textarea
                  placeholder="文件内容,空内容会自动忽略"
                  maxLength={-1}
                  rows={10}
                  fontSize={'xs'}
                  whiteSpace={'pre-wrap'}
                  value={item}
                  onChange={(e) => {
                    setFileTextArr([
                      ...fileTextArr.slice(0, i),
                      e.target.value,
                      ...fileTextArr.slice(i + 1)
                    ]);
                  }}
                />
              </Box>
            ))}
          </Box>
        </ModalBody>

        <Flex px={6} pt={2} pb={4}>
          <Button isLoading={selecting} onClick={onOpen}>
            选择文件
          </Button>
          <Box flex={1}></Box>
          <Button variant={'outline'} colorScheme={'gray'} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={isLoading}
            isDisabled={selecting || fileTextArr[0] === ''}
            onClick={onclickImport}
          >
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
