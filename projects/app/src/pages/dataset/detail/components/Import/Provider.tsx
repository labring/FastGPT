import React, {
  type SetStateAction,
  type Dispatch,
  useContext,
  useCallback,
  createContext,
  useState,
  useMemo,
  useEffect
} from 'react';
import FileSelect, { FileItemType, Props as FileSelectProps } from './FileSelect';
import { useRequest } from '@/web/common/hooks/useRequest';
import { postDatasetCollection } from '@/web/core/dataset/api';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import { Box, Flex, Image, useTheme } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import DeleteIcon, { hoverDeleteStyles } from '@/components/Icon/delete';
import MyIcon from '@/components/Icon';
import { chunksUpload } from '@/web/core/dataset/utils';
import { postCreateTrainingBill } from '@/web/support/wallet/bill/api';
import { useTranslation } from 'next-i18next';
import { ImportTypeEnum } from './ImportModal';

const filenameStyles = {
  className: 'textEllipsis',
  maxW: '400px'
};

type useImportStoreType = {
  files: FileItemType[];
  setFiles: Dispatch<SetStateAction<FileItemType[]>>;
  previewFile: FileItemType | undefined;
  setPreviewFile: Dispatch<SetStateAction<FileItemType | undefined>>;
  successChunks: number;
  setSuccessChunks: Dispatch<SetStateAction<number>>;
  isUnselectedFile: boolean;
  totalChunks: number;
  onclickUpload: (e: { prompt?: string }) => void;
  onReSplitChunks: () => void;
  price: number;
  uploading: boolean;
  chunkLen: number;
  chunkOverlapRatio: number;
  setChunkLen: Dispatch<number>;
  showRePreview: boolean;
  setReShowRePreview: Dispatch<SetStateAction<boolean>>;
};
const StateContext = createContext<useImportStoreType>({
  onclickUpload: function (e: { prompt?: string }): void {
    throw new Error('Function not implemented.');
  },
  uploading: false,
  files: [],

  previewFile: undefined,

  successChunks: 0,

  isUnselectedFile: false,
  totalChunks: 0,
  onReSplitChunks: function (): void {
    throw new Error('Function not implemented.');
  },
  price: 0,
  chunkLen: 0,
  chunkOverlapRatio: 0,
  setChunkLen: function (value: number): void {
    throw new Error('Function not implemented.');
  },
  setFiles: function (value: React.SetStateAction<FileItemType[]>): void {
    throw new Error('Function not implemented.');
  },
  setPreviewFile: function (value: React.SetStateAction<FileItemType | undefined>): void {
    throw new Error('Function not implemented.');
  },
  setSuccessChunks: function (value: React.SetStateAction<number>): void {
    throw new Error('Function not implemented.');
  },
  showRePreview: false,
  setReShowRePreview: function (value: React.SetStateAction<boolean>): void {
    throw new Error('Function not implemented.');
  }
});
export const useImportStore = () => useContext(StateContext);

const Provider = ({
  datasetId,
  parentId,
  unitPrice,
  mode,
  vectorModel,
  agentModel,
  defaultChunkLen = 500,
  chunkOverlapRatio = 0.2,
  importType,
  onUploadSuccess,
  children
}: {
  datasetId: string;
  parentId: string;
  unitPrice: number;
  mode: `${TrainingModeEnum}`;
  vectorModel: string;
  agentModel: string;
  defaultChunkLen: number;
  chunkOverlapRatio: number;
  importType: `${ImportTypeEnum}`;
  onUploadSuccess: () => void;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [files, setFiles] = useState<FileItemType[]>([]);
  const [successChunks, setSuccessChunks] = useState(0);
  const [chunkLen, setChunkLen] = useState(defaultChunkLen);
  const [previewFile, setPreviewFile] = useState<FileItemType>();
  const [showRePreview, setReShowRePreview] = useState(false);

  const isUnselectedFile = useMemo(() => files.length === 0, [files]);

  const totalChunks = useMemo(
    () => files.reduce((sum, file) => sum + file.chunks.length, 0),
    [files]
  );

  const price = useMemo(() => {
    return formatPrice(files.reduce((sum, file) => sum + file.tokens, 0) * unitPrice);
  }, [files, unitPrice]);

  /* start upload data */
  const { mutate: onclickUpload, isLoading: uploading } = useRequest({
    mutationFn: async (props?: { prompt?: string }) => {
      const { prompt } = props || {};
      let totalInsertion = 0;
      for await (const file of files) {
        const chunks = file.chunks;
        // create training bill
        const billId = await postCreateTrainingBill({
          name: t('dataset.collections.Create Training Data', { filename: file.filename }),
          vectorModel,
          agentModel
        });
        // create a file collection and training bill
        const collectionId = await postDatasetCollection({
          datasetId,
          parentId,
          name: file.filename,
          type: file.type,
          metadata: file.metadata
        });

        // upload data
        const { insertLen } = await chunksUpload({
          collectionId,
          billId,
          chunks,
          mode,
          onUploading: (insertLen) => {
            setSuccessChunks((state) => state + insertLen);
          },
          prompt
        });
        totalInsertion += insertLen;
      }
      return totalInsertion;
    },
    onSuccess(num) {
      toast({
        title: `共成功导入 ${num} 组数据，请耐心等待训练.`,
        status: 'success'
      });
      onUploadSuccess();
    },
    errorToast: '导入文件失败'
  });

  const onReSplitChunks = useCallback(async () => {
    try {
      setFiles((state) =>
        state.map((file) => {
          const splitRes = splitText2Chunks({
            text: file.text,
            chunkLen,
            overlapRatio: chunkOverlapRatio
          });

          return {
            ...file,
            tokens: splitRes.tokens,
            chunks: splitRes.chunks.map((chunk) => ({
              q: chunk,
              a: ''
            }))
          };
        })
      );
      setReShowRePreview(false);
    } catch (error) {
      toast({
        status: 'warning',
        title: getErrText(error, '文本分段异常')
      });
    }
  }, [chunkLen, toast]);

  const reset = useCallback(() => {
    setFiles([]);
    setSuccessChunks(0);
    setChunkLen(defaultChunkLen);
    setPreviewFile(undefined);
    setReShowRePreview(false);
  }, [defaultChunkLen]);

  useEffect(() => {
    reset();
  }, [importType, reset]);

  const value = {
    files,
    setFiles,
    previewFile,
    setPreviewFile,
    successChunks,
    setSuccessChunks,
    isUnselectedFile,
    totalChunks,
    price,
    onReSplitChunks,
    onclickUpload,
    uploading,
    chunkLen,
    chunkOverlapRatio,
    setChunkLen,
    showRePreview,
    setReShowRePreview
  };
  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
};

export default React.memo(Provider);

export const PreviewFileOrChunk = () => {
  const theme = useTheme();
  const { setFiles, previewFile, setPreviewFile, setReShowRePreview, totalChunks, files } =
    useImportStore();

  return (
    <Box h={'100%'} w={'100%'}>
      {!!previewFile ? (
        <Box
          position={'relative'}
          display={['block', 'flex']}
          h={'100%'}
          flexDirection={'column'}
          pt={[3, 6]}
          bg={'myWhite.400'}
        >
          <Box px={[4, 8]} fontSize={['lg', 'xl']} fontWeight={'bold'} {...filenameStyles}>
            {previewFile.filename}
          </Box>
          <CloseIcon
            position={'absolute'}
            right={[4, 8]}
            top={4}
            cursor={'pointer'}
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
              setReShowRePreview(true);

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
        <Box pt={[3, 6]}>
          <Flex px={[4, 8]} alignItems={'center'}>
            <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
              分段预览({totalChunks}组)
            </Box>
            {totalChunks > 50 && (
              <Box ml={2} fontSize={'sm'} color={'myhGray.500'}>
                仅展示部分
              </Box>
            )}
          </Flex>
          <Box px={[4, 8]} overflow={'overlay'}>
            {files.map((file) =>
              file.chunks.slice(0, 50).map((chunk, i) => (
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
                    <Box
                      flexShrink={0}
                      px={3}
                      py={'1px'}
                      border={theme.borders.base}
                      borderRadius={'md'}
                    >
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
                                  chunks: [...file.chunks.slice(0, i), ...file.chunks.slice(i + 1)]
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
                    contentEditable={!chunk.a}
                    dangerouslySetInnerHTML={{
                      __html: chunk.a ? `q:${chunk.q}\na:${chunk.a}` : chunk.q
                    }}
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
                                  chunks: [...file.chunks.slice(0, i), ...file.chunks.slice(i + 1)]
                                }
                              : stateFile
                          )
                        );
                      } else {
                        // update chunk
                        setFiles((stateFiles) =>
                          stateFiles.map((stateFile) =>
                            file.id === stateFile.id
                              ? {
                                  ...stateFile,
                                  chunks: stateFile.chunks.map((chunk, index) => ({
                                    ...chunk,
                                    index: i === index ? val : chunk.q
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
  );
};

export const SelectorContainer = ({
  fileExtension,
  showUrlFetch,
  showCreateFile,
  fileTemplate,
  tip,
  children
}: {
  fileExtension: string;
  showUrlFetch?: boolean;
  showCreateFile?: boolean;
  fileTemplate?: FileSelectProps['fileTemplate'];
  tip?: string;
  children: React.ReactNode;
}) => {
  const { files, setPreviewFile, isUnselectedFile, setFiles, chunkLen, chunkOverlapRatio } =
    useImportStore();
  return (
    <Box
      h={'100%'}
      overflowY={'auto'}
      flex={['auto', '1 0 400px']}
      {...(isUnselectedFile
        ? {}
        : {
            maxW: ['auto', '500px']
          })}
      p={[4, 8]}
    >
      <FileSelect
        fileExtension={fileExtension}
        onPushFiles={(files) => {
          setFiles((state) => files.concat(state));
        }}
        chunkLen={chunkLen}
        overlapRatio={chunkOverlapRatio}
        showUrlFetch={showUrlFetch}
        showCreateFile={showCreateFile}
        fileTemplate={fileTemplate}
        tip={tip}
        py={isUnselectedFile ? '100px' : 5}
      />
      {!isUnselectedFile && (
        <Box py={4} px={2} maxH={'400px'} overflowY={'auto'}>
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
      )}
      {!isUnselectedFile && <>{children}</>}
    </Box>
  );
};
