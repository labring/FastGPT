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
import { postKbDataFromList } from '@/api/plugins/kb';
import Radio from '@/components/Radio';
import { splitText_token } from '@/utils/file';
import { TrainingModeEnum } from '@/constants/plugin';
import { getErrText } from '@/utils/tools';

const fileExtension = '.txt,.doc,.docx,.pdf,.md';

const modeMap = {
  [TrainingModeEnum.qa]: {
    maxLen: 2800,
    slideLen: 800,
    price: 4,
    isPrompt: true
  },
  [TrainingModeEnum.index]: {
    maxLen: 800,
    slideLen: 300,
    price: 0.4,
    isPrompt: false
  }
};

const SelectFileModal = ({
  onClose,
  onSuccess,
  kbId
}: {
  onClose: () => void;
  onSuccess: () => void;
  kbId: string;
}) => {
  const [btnLoading, setBtnLoading] = useState(false);
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const { File, onOpen } = useSelectFile({ fileType: fileExtension, multiple: true });
  const [mode, setMode] = useState<`${TrainingModeEnum}`>(TrainingModeEnum.index);
  const [fileTextArr, setFileTextArr] = useState<string[]>(['']);
  const [splitRes, setSplitRes] = useState<{
    tokens: number;
    chunks: string[];
    successChunks: number;
  }>({
    tokens: 0,
    chunks: [],
    successChunks: 0
  });
  const { openConfirm, ConfirmChild } = useConfirm({
    content: `确认导入该文件，需要一定时间进行拆解，该任务无法终止！如果余额不足，未完成的任务会被直接清除。一共 ${
      splitRes.chunks.length
    } 组。${splitRes.tokens ? `大约 ${splitRes.tokens} 个tokens。` : ''}`
  });

  const onSelectFile = useCallback(
    async (files: File[]) => {
      setBtnLoading(true);
      try {
        let promise = Promise.resolve();
        files.forEach((file) => {
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
      setBtnLoading(false);
    },
    [toast]
  );

  const { mutate, isLoading: uploading } = useMutation({
    mutationFn: async () => {
      if (splitRes.chunks.length === 0) return;

      // subsection import
      let success = 0;
      const step = 50;
      for (let i = 0; i < splitRes.chunks.length; i += step) {
        const { insertLen } = await postKbDataFromList({
          kbId,
          data: splitRes.chunks.slice(i, i + step).map((text) => ({ q: text, a: '' })),
          prompt: `下面是"${prompt || '一段长文本'}"`,
          mode
        });

        success += insertLen;
        setSplitRes((state) => ({
          ...state,
          successChunks: state.successChunks + step
        }));
      }

      toast({
        title: `去重后共导入 ${success} 条数据,需要一段拆解和训练.`,
        status: 'success'
      });
      onClose();
      onSuccess();
    },
    onError(err) {
      toast({
        title: getErrText(err, '导入文件失败'),
        status: 'error'
      });
    }
  });

  const onclickImport = useCallback(async () => {
    setBtnLoading(true);
    try {
      let promise = Promise.resolve();

      const splitRes = await Promise.all(
        fileTextArr
          .filter((item) => item)
          .map((item) =>
            splitText_token({
              text: item,
              ...modeMap[mode]
            })
          )
      );

      setSplitRes({
        tokens: splitRes.reduce((sum, item) => sum + item.tokens, 0),
        chunks: splitRes.map((item) => item.chunks).flat(),
        successChunks: 0
      });

      await promise;
      openConfirm(mutate)();
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '拆分文本异常')
      });
    }
    setBtnLoading(false);
  }, [fileTextArr, mode, mutate, openConfirm, toast]);

  return (
    <Modal isOpen={true} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent
        display={'flex'}
        maxW={'min(1000px, 90vw)'}
        m={0}
        position={'relative'}
        h={'90vh'}
      >
        <ModalHeader>文件导入</ModalHeader>
        <ModalCloseButton />

        <ModalBody
          flex={1}
          h={0}
          display={'flex'}
          flexDirection={'column'}
          p={0}
          alignItems={'center'}
          justifyContent={'center'}
          fontSize={'sm'}
        >
          <Box mt={2} px={5} maxW={['100%', '70%']} textAlign={'justify'} color={'blackAlpha.600'}>
            支持 {fileExtension} 文件。Gpt会自动对文本进行 QA 拆分，需要较长训练时间，拆分需要消耗
            tokens，账号余额不足时，未拆分的数据会被删除。一个{fileTextArr.length}个文本。
          </Box>
          {/* 拆分模式 */}
          <Flex w={'100%'} px={5} alignItems={'center'} mt={4}>
            <Box flex={'0 0 70px'}>分段模式:</Box>
            <Radio
              ml={3}
              list={[
                { label: '直接分段', value: 'index' },
                { label: 'QA拆分', value: 'qa' }
              ]}
              value={mode}
              onChange={(e) => setMode(e as 'index' | 'qa')}
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
                  onBlur={(e) => {
                    if (fileTextArr.length > 1 && e.target.value === '') {
                      setFileTextArr((state) => [...state.slice(0, i), ...state.slice(i + 1)]);
                    }
                  }}
                />
              </Box>
            ))}
          </Box>
        </ModalBody>

        <Flex px={6} pt={2} pb={4}>
          <Button isLoading={btnLoading} isDisabled={uploading} onClick={onOpen}>
            选择文件
          </Button>
          <Box flex={1}></Box>
          <Button variant={'outline'} isLoading={uploading} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isDisabled={uploading || btnLoading || fileTextArr[0] === ''}
            onClick={onclickImport}
          >
            {uploading ? (
              <Box>{Math.round((splitRes.successChunks / splitRes.chunks.length) * 100)}%</Box>
            ) : (
              '确认导入'
            )}
          </Button>
        </Flex>
      </ModalContent>
      <ConfirmChild />
      <File onSelect={onSelectFile} />
    </Modal>
  );
};

export default SelectFileModal;
