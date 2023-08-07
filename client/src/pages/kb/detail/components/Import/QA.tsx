import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Button, useTheme, Image, Input } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { readTxtContent, readPdfContent, readDocContent } from '@/utils/file';
import { useMutation } from '@tanstack/react-query';
import { postKbDataFromList } from '@/api/plugins/kb';
import { splitText_token } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { formatPrice } from '@/utils/user';
import { qaModelList } from '@/store/static';
import MyIcon from '@/components/Icon';
import CloseIcon from '@/components/Icon/close';
import DeleteIcon, { hoverDeleteStyles } from '@/components/Icon/delete';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { fileImgs } from '@/constants/common';
import { customAlphabet } from 'nanoid';
import { TrainingModeEnum } from '@/constants/plugin';
import FileSelect from './FileSelect';
import { useRouter } from 'next/router';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const fileExtension = '.txt, .doc, .docx, .pdf, .md';

type FileItemType = {
  id: string;
  filename: string;
  text: string;
  icon: string;
  chunks: string[];
  tokens: number;
};

const QAImport = ({ kbId }: { kbId: string }) => {
  const model = qaModelList[0]?.model;
  const unitPrice = qaModelList[0]?.price || 3;
  const chunkLen = qaModelList[0].maxToken * 0.45;
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();

  const [selecting, setSelecting] = useState(false);
  const [files, setFiles] = useState<FileItemType[]>([]);
  const [showRePreview, setShowRePreview] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItemType>();
  const [successChunks, setSuccessChunks] = useState(0);
  const [prompt, setPrompt] = useState('');

  const totalChunk = useMemo(
    () => files.reduce((sum, file) => sum + file.chunks.length, 0),
    [files]
  );
  const emptyFiles = useMemo(() => files.length === 0, [files]);

  // price count
  const price = useMemo(() => {
    return formatPrice(files.reduce((sum, file) => sum + file.tokens, 0) * unitPrice * 1.3);
  }, [files, unitPrice]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: `该任务无法终止！导入后会自动调用大模型生成问答对，会有一些细节丢失，请确认！如果余额不足，未完成的任务会被暂停。`
  });

  const onSelectFile = useCallback(
    async (files: File[]) => {
      setSelecting(true);
      try {
        let promise = Promise.resolve();
        files.forEach((file) => {
          promise = promise.then(async () => {
            const extension = file?.name?.split('.')?.pop()?.toLowerCase();
            const icon = fileImgs.find((item) => new RegExp(item.reg).test(file.name))?.src;
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

            if (icon && text) {
              const splitRes = splitText_token({
                text: text,
                maxLen: chunkLen
              });

              setFiles((state) => [
                {
                  id: nanoid(),
                  filename: file.name,
                  text,
                  icon,
                  ...splitRes
                },
                ...state
              ]);
            }
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
    [chunkLen, toast]
  );

  const { mutate: onclickUpload, isLoading: uploading } = useMutation({
    mutationFn: async () => {
      const chunks: { a: string; q: string; source: string }[] = [];
      files.forEach((file) =>
        file.chunks.forEach((chunk) => {
          chunks.push({
            q: chunk,
            a: '',
            source: file.filename
          });
        })
      );

      // subsection import
      let success = 0;
      const step = 100;
      for (let i = 0; i < chunks.length; i += step) {
        const { insertLen } = await postKbDataFromList({
          kbId,
          model,
          data: chunks.slice(i, i + step),
          mode: TrainingModeEnum.qa,
          prompt: prompt || '下面是一段长文本'
        });

        success += insertLen;
        setSuccessChunks(success);
      }

      toast({
        title: `共导入 ${success} 条数据，请耐心等待训练.`,
        status: 'success'
      });

      router.replace({
        query: {
          kbId,
          currentTab: 'data'
        }
      });
    },
    onError(err) {
      toast({
        title: getErrText(err, '导入文件失败'),
        status: 'error'
      });
    }
  });

  const onRePreview = useCallback(async () => {
    try {
      const splitRes = files.map((item) =>
        splitText_token({
          text: item.text,
          maxLen: chunkLen
        })
      );

      setFiles((state) =>
        state.map((file, index) => ({
          ...file,
          ...splitRes[index]
        }))
      );
      setPreviewFile(undefined);
      setShowRePreview(false);
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '文本分段异常')
      });
    }
  }, [chunkLen, files, toast]);

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <Box flex={1} minW={['auto', '400px']} w={['100%', 0]} p={[4, 8]}>
        <FileSelect
          fileExtension={fileExtension}
          onSelectFile={onSelectFile}
          isLoading={selecting}
          py={emptyFiles ? '100px' : 5}
        />

        {!emptyFiles && (
          <>
            <Box py={4} maxH={'400px'}>
              {files.map((item) => (
                <Flex
                  key={item.id}
                  w={'100%'}
                  _notLast={{ mb: 5 }}
                  px={5}
                  py={2}
                  boxShadow={'1px 1px 5px rgba(0,0,0,0.15)'}
                  borderRadius={'md'}
                  cursor={'pointer'}
                  position={'relative'}
                  alignItems={'center'}
                  _hover={{
                    bg: 'myBlue.100',
                    '& .delete': {
                      display: 'block'
                    }
                  }}
                  onClick={() => setPreviewFile(item)}
                >
                  <Image src={item.icon} w={'16px'} alt={''} />
                  <Box ml={2} flex={'1 0 0'} pr={3} className="textEllipsis">
                    {item.filename}
                  </Box>
                  <MyIcon
                    position={'absolute'}
                    right={3}
                    className="delete"
                    name={'delete'}
                    w={'16px'}
                    _hover={{ color: 'red.600' }}
                    display={['block', 'none']}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles((state) => state.filter((file) => file.id !== item.id));
                    }}
                  />
                </Flex>
              ))}
            </Box>
            {/* prompt */}
            <Box py={5}>
              <Box mb={2}>
                QA 拆分引导词{' '}
                <MyTooltip
                  label={`可输入关于文件内容的范围介绍，例如:\n1. 关于 Laf 的介绍\n2. xxx的简历`}
                  forceShow
                >
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Box>
              <Flex alignItems={'center'} fontSize={'sm'}>
                <Box mr={2}>下面是</Box>
                <Input
                  flex={1}
                  placeholder={'Laf 云函数的介绍'}
                  bg={'myWhite.500'}
                  defaultValue={prompt}
                  onBlur={(e) => (e.target.value ? setPrompt(`下面是"${e.target.value}"`) : '')}
                />
              </Flex>
            </Box>
            {/* price */}
            <Flex py={5} alignItems={'center'}>
              <Box>
                预估价格
                <MyTooltip
                  label={`索引生成计费为: ${formatPrice(unitPrice, 1000)}/1k tokens`}
                  forceShow
                >
                  <QuestionOutlineIcon ml={1} />
                </MyTooltip>
              </Box>
              <Box ml={4}>{price}元</Box>
            </Flex>
            <Flex mt={3}>
              {showRePreview && (
                <Button variant={'base'} mr={4} onClick={onRePreview}>
                  重新生成预览
                </Button>
              )}
              <Button isDisabled={uploading} onClick={openConfirm(onclickUpload)}>
                {uploading ? (
                  <Box>{Math.round((successChunks / totalChunk) * 100)}%</Box>
                ) : (
                  '确认导入'
                )}
              </Button>
            </Flex>
          </>
        )}
      </Box>
      {!emptyFiles && (
        <Box flex={'2 0 0'} w={['100%', 0]} h={'100%'}>
          {previewFile ? (
            <Box
              position={'relative'}
              display={['block', 'flex']}
              h={'100%'}
              flexDirection={'column'}
              pt={[4, 8]}
              bg={'myWhite.400'}
            >
              <Box px={[4, 8]} fontSize={['lg', 'xl']} fontWeight={'bold'}>
                {previewFile.filename}
              </Box>
              <CloseIcon
                position={'absolute'}
                right={[4, 8]}
                top={4}
                onClick={() => setPreviewFile(undefined)}
              />
              <Box
                flex={'1 0 0'}
                h={['auto', 0]}
                overflow={'overlay'}
                px={[4, 8]}
                my={4}
                contentEditable
                dangerouslySetInnerHTML={{ __html: previewFile.text }}
                fontSize={'sm'}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-all'}
                onBlur={(e) => {
                  // @ts-ignore
                  const val = e.target.innerText;
                  setShowRePreview(true);
                  setFiles((state) =>
                    state.map((file) =>
                      file.id === previewFile.id
                        ? {
                            ...file,
                            text: val
                          }
                        : file
                    )
                  );
                }}
              />
            </Box>
          ) : (
            <Box h={'100%'} pt={[4, 8]} overflow={'overlay'}>
              <Box px={[4, 8]} fontSize={['lg', 'xl']} fontWeight={'bold'}>
                分段预览({totalChunk}组)
              </Box>
              <Box px={[4, 8]} overflow={'overlay'}>
                {files.map((file) =>
                  file.chunks.map((item, i) => (
                    <Box
                      key={item}
                      py={4}
                      bg={'myWhite.500'}
                      my={2}
                      borderRadius={'md'}
                      fontSize={'sm'}
                      _hover={{ ...hoverDeleteStyles }}
                    >
                      <Flex mb={1} px={4} userSelect={'none'}>
                        <Box px={3} py={'1px'} border={theme.borders.base} borderRadius={'md'}>
                          # {i + 1}
                        </Box>
                        <Box flex={1} />
                        <DeleteIcon
                          onClick={() => {
                            setFiles((state) =>
                              state.map((stateFile) =>
                                stateFile.id === file.id
                                  ? {
                                      ...file,
                                      chunks: [
                                        ...file.chunks.slice(0, i),
                                        ...file.chunks.slice(i + 1)
                                      ]
                                    }
                                  : stateFile
                              )
                            );
                          }}
                        />
                      </Flex>
                      <Box
                        px={4}
                        fontSize={'sm'}
                        whiteSpace={'pre-wrap'}
                        wordBreak={'break-all'}
                        contentEditable
                        dangerouslySetInnerHTML={{ __html: item }}
                        onBlur={(e) => {
                          // @ts-ignore
                          const val = e.target.innerText;

                          if (val === '') {
                            setFiles((state) =>
                              state.map((stateFile) =>
                                stateFile.id === file.id
                                  ? {
                                      ...file,
                                      chunks: [
                                        ...file.chunks.slice(0, i),
                                        ...file.chunks.slice(i + 1)
                                      ]
                                    }
                                  : stateFile
                              )
                            );
                          } else {
                            setFiles((state) =>
                              state.map((stateFile) =>
                                stateFile.id === file.id
                                  ? {
                                      ...file,
                                      chunks: file.chunks.map((chunk, index) =>
                                        i === index ? val : chunk
                                      )
                                    }
                                  : stateFile
                              )
                            );
                          }
                        }}
                      />
                    </Box>
                  ))
                )}
              </Box>
            </Box>
          )}
        </Box>
      )}
      <ConfirmModal />
    </Box>
  );
};

export default QAImport;
