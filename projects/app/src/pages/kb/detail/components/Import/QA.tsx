import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Button, useTheme, Image, Input } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation } from '@tanstack/react-query';
import { splitText2Chunks } from '@/utils/file';
import { getErrText } from '@/utils/tools';
import { formatPrice } from '@fastgpt/common/bill/index';
import { qaModel } from '@/store/static';
import MyIcon from '@/components/Icon';
import CloseIcon from '@/components/Icon/close';
import DeleteIcon, { hoverDeleteStyles } from '@/components/Icon/delete';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon, InfoOutlineIcon } from '@chakra-ui/icons';
import { TrainingModeEnum } from '@/constants/plugin';
import FileSelect, { type FileItemType } from './FileSelect';
import { useRouter } from 'next/router';
import { putMarkFilesUsed } from '@/api/core/dataset/file';
import { Prompt_AgentQA } from '@/prompts/core/agent';
import { replaceVariable } from '@/utils/common/tools/text';
import { chunksUpload } from '@/utils/web/core/dataset';

const fileExtension = '.txt, .doc, .docx, .pdf, .md';

const QAImport = ({ kbId }: { kbId: string }) => {
  const unitPrice = qaModel.price || 3;
  const chunkLen = qaModel.maxToken * 0.45;
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();

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
    const filesToken = files.reduce((sum, file) => sum + file.tokens, 0);
    const promptTokens = files.reduce((sum, file) => sum + file.chunks.length, 0) * 139;
    const totalToken = (filesToken + promptTokens) * 2;

    return formatPrice(totalToken * unitPrice);
  }, [files, unitPrice]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: `该任务无法终止！导入后会自动调用大模型生成问答对，会有一些细节丢失，请确认！如果余额不足，未完成的任务会被暂停。`
  });

  const previewQAPrompt = useMemo(() => {
    return replaceVariable(Prompt_AgentQA.prompt, {
      theme: prompt || Prompt_AgentQA.defaultTheme
    });
  }, [prompt]);

  const { mutate: onclickUpload, isLoading: uploading } = useMutation({
    mutationFn: async () => {
      const chunks = files.map((file) => file.chunks).flat();

      // mark the file is used
      await putMarkFilesUsed({ fileIds: files.map((file) => file.id) });

      // upload data
      const { insertLen } = await chunksUpload({
        kbId,
        chunks,
        mode: TrainingModeEnum.qa,
        prompt: previewQAPrompt,
        rate: 10,
        onUploading: (insertLen) => {
          setSuccessChunks(insertLen);
        }
      });

      toast({
        title: `共导入 ${insertLen} 条数据，请耐心等待训练.`,
        status: 'success'
      });

      router.replace({
        query: {
          kbId,
          currentTab: 'dataset'
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
      setFiles((state) =>
        state.map((file) => {
          const splitRes = splitText2Chunks({
            text: file.text,
            maxLen: chunkLen
          });
          return {
            ...file,
            tokens: splitRes.tokens,
            chunks: splitRes.chunks.map((chunk) => ({
              a: '',
              source: file.filename,
              file_id: file.chunks[0]?.file_id,
              q: chunk
            }))
          };
        })
      );
      setPreviewFile(undefined);
      setShowRePreview(false);
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '文本分段异常')
      });
    }
  }, [chunkLen, toast]);

  const filenameStyles = {
    className: 'textEllipsis',
    maxW: '400px'
  };

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']} overflow={'overlay'}>
      <Flex
        flexDirection={'column'}
        flex={'1 0 0'}
        h={'100%'}
        minW={['auto', '400px']}
        w={['100%', 0]}
        p={[4, 8]}
      >
        <FileSelect
          fileExtension={fileExtension}
          onPushFiles={(files) => {
            setFiles((state) => files.concat(state));
          }}
          chunkLen={chunkLen}
          py={emptyFiles ? '100px' : 5}
        />

        {!emptyFiles && (
          <>
            <Box py={4} px={2} minH={['auto', '100px']} maxH={'400px'} overflow={'auto'}>
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
                  <Box ml={2} flex={'1 0 0'} pr={3} {...filenameStyles}>
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
                <MyTooltip label={previewQAPrompt} forceShow>
                  <InfoOutlineIcon ml={1} />
                </MyTooltip>
              </Box>
              <Flex alignItems={'center'} fontSize={'sm'}>
                <Box mr={2}>文件主题</Box>
                <Input
                  fontSize={'sm'}
                  flex={1}
                  placeholder={Prompt_AgentQA.defaultTheme}
                  bg={'myWhite.500'}
                  defaultValue={prompt}
                  onChange={(e) => setPrompt(e.target.value || '')}
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
      </Flex>
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
              <Box px={[4, 8]} fontSize={['lg', 'xl']} fontWeight={'bold'} {...filenameStyles}>
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
              <Flex px={[4, 8]} alignItems={'center'}>
                <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
                  分段预览({totalChunk}组)
                </Box>
                {totalChunk > 100 && (
                  <Box ml={2} fontSize={'sm'} color={'myhGray.500'}>
                    仅展示部分
                  </Box>
                )}
              </Flex>
              <Box px={[4, 8]} overflow={'overlay'}>
                {files.map((file) =>
                  file.chunks.slice(0, 30).map((chunk, i) => (
                    <Box
                      key={i}
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
                        <Box ml={2} fontSize={'sm'} color={'myhGray.500'} {...filenameStyles}>
                          {file.filename}
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
                        dangerouslySetInnerHTML={{ __html: chunk.q }}
                        onBlur={(e) => {
                          // @ts-ignore
                          const val = e.target.innerText;

                          /* delete file */
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
                            // update file
                            setFiles((stateFiles) =>
                              stateFiles.map((stateFile) =>
                                file.id === stateFile.id
                                  ? {
                                      ...stateFile,
                                      chunks: stateFile.chunks.map((chunk, index) => ({
                                        ...chunk,
                                        q: i === index ? val : chunk.q
                                      }))
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
