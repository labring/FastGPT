import React, { useState, useCallback, useRef } from 'react';
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
import { ChatModelMap, OpenAiChatEnum, embeddingPrice } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import MySlider from '@/components/Slider';

const fileExtension = '.txt,.doc,.docx,.pdf,.md';

const SelectFileModal = ({
  onClose,
  onSuccess,
  kbId
}: {
  onClose: () => void;
  onSuccess: () => void;
  kbId: string;
}) => {
  const [modeMap, setModeMap] = useState({
    [TrainingModeEnum.qa]: {
      maxLen: 8000,
      price: ChatModelMap[OpenAiChatEnum.GPT3516k].price
    },
    [TrainingModeEnum.index]: {
      maxLen: 600,
      price: embeddingPrice
    }
  });
  const [btnLoading, setBtnLoading] = useState(false);
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const { File, onOpen } = useSelectFile({
    fileType: fileExtension,
    multiple: true
  });
  const [mode, setMode] = useState<`${TrainingModeEnum}`>(TrainingModeEnum.index);
  const [files, setFiles] = useState<{ filename: string; text: string }[]>([
    { filename: '文本1', text: '' }
  ]);
  const [splitRes, setSplitRes] = useState<{
    price: number;
    chunks: { filename: string; value: string }[];
    successChunks: number;
  }>({
    price: 0,
    successChunks: 0,
    chunks: []
  });
  const { openConfirm, ConfirmChild } = useConfirm({
    content: `确认导入该文件，需要一定时间进行拆解，该任务无法终止！如果余额不足，未完成的任务会被暂停。一共 ${
      splitRes.chunks.length
    } 组。${splitRes.price ? `大约 ${splitRes.price} 元。` : ''}`
  });

  const onSelectFile = useCallback(
    async (files: File[]) => {
      setBtnLoading(true);
      try {
        let promise = Promise.resolve();
        files.forEach((file) => {
          promise = promise.then(async () => {
            const extension = file?.name?.split('.')?.pop()?.toLowerCase();
            const text = await (async () => {
              switch (extension) {
                case 'txt':
                case 'md':
                  return readTxtContent(file);
                case 'pdf':
                  return readPdfContent(file);
                case 'doc':
                case 'docx':
                  return readDocContent(file);
              }
              return '';
            })();

            text && setFiles((state) => [{ filename: file.name, text }].concat(state));
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
      const step = 100;
      for (let i = 0; i < splitRes.chunks.length; i += step) {
        const { insertLen } = await postKbDataFromList({
          kbId,
          data: splitRes.chunks
            .slice(i, i + step)
            .map((item) => ({ q: item.value, a: '', source: item.filename })),
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
      const splitRes = files
        .map((item) =>
          splitText_token({
            text: item.text,
            ...modeMap[mode]
          })
        )
        .map((item, i) => ({
          ...item,
          filename: files[i].filename
        }))
        .filter((item) => item.tokens > 0);

      let price = formatPrice(
        splitRes.reduce((sum, item) => sum + item.tokens, 0) * modeMap[mode].price
      );

      if (mode === 'qa') {
        price *= 1.2;
      }

      setSplitRes({
        price,
        chunks: splitRes
          .map((item) =>
            item.chunks.map((chunk) => ({
              filename: item.filename,
              value: chunk
            }))
          )
          .flat(),
        successChunks: 0
      });

      openConfirm(mutate)();
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '拆分文本异常')
      });
    }
    setBtnLoading(false);
  }, [files, mode, modeMap, mutate, openConfirm, toast]);

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
            tokens，账号余额不足时，未拆分的数据会被删除。一个{files.length}
            个文本。
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
          <Flex w={'100%'} px={5} alignItems={'center'} mt={4}>
            {mode === TrainingModeEnum.qa && (
              <>
                <Box flex={'0 0 70px'} mr={2}>
                  下面是
                </Box>
                <Input
                  placeholder="提示词，例如: Laf的介绍/关于gpt4的论文/一段长文本"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  size={'sm'}
                />
              </>
            )}
            {/* chunk size */}
            {mode === TrainingModeEnum.index && (
              <Flex mt={5}>
                <Box w={['70px']} flexShrink={0}>
                  段落长度
                </Box>
                <Box flex={1} ml={'10px'}>
                  <MySlider
                    markList={[
                      { label: '300', value: 300 },
                      { label: '1000', value: 1000 }
                    ]}
                    width={['100%', '260px']}
                    min={300}
                    max={1000}
                    step={50}
                    activeVal={modeMap[TrainingModeEnum.index].maxLen}
                    setVal={(val) => {
                      setModeMap((state) => ({
                        ...state,
                        [TrainingModeEnum.index]: {
                          maxLen: val,
                          price: embeddingPrice
                        }
                      }));
                    }}
                  />
                </Box>
              </Flex>
            )}
          </Flex>

          {/* 文本内容 */}
          <Box flex={'1 0 0'} px={5} h={0} w={'100%'} overflowY={'auto'} mt={4}>
            {files.slice(0, 100).map((item, i) => (
              <Box key={i} mb={5}>
                <Box mb={1}>{item.filename}</Box>
                <Textarea
                  placeholder="文件内容,空内容会自动忽略"
                  maxLength={-1}
                  rows={10}
                  fontSize={'xs'}
                  whiteSpace={'pre-wrap'}
                  value={item.text}
                  onChange={(e) => {
                    setFiles([
                      ...files.slice(0, i),
                      { ...item, text: e.target.value },
                      ...files.slice(i + 1)
                    ]);
                  }}
                  onBlur={(e) => {
                    if (files.length > 1 && e.target.value === '') {
                      setFiles((state) => [...state.slice(0, i), ...state.slice(i + 1)]);
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
          <Button variant={'base'} isLoading={uploading} mr={3} onClick={onClose}>
            取消
          </Button>
          <Button
            isDisabled={uploading || btnLoading || files[0]?.text === ''}
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
