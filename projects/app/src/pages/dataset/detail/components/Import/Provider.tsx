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
import { formatModelPrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constant';
import { Box, Flex, Image, useTheme } from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import DeleteIcon, { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import MyIcon from '@fastgpt/web/components/common/Icon';
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
  totalTokens: number;
  onclickUpload: (e?: { prompt?: string }) => void;
  onReSplitChunks: () => void;
  price: number;
  uploading: boolean;
  chunkLen: number;
  chunkOverlapRatio: number;
  setChunkLen: Dispatch<number>;
  customSplitChar?: string;
  setCustomSplitChar: Dispatch<string>;
  showRePreview: boolean;
  setReShowRePreview: Dispatch<SetStateAction<boolean>>;
};
const StateContext = createContext<useImportStoreType>({
  onclickUpload: function (e?: { prompt?: string }): void {
    throw new Error('Function not implemented.');
  },
  uploading: false,
  files: [],

  previewFile: undefined,

  successChunks: 0,

  isUnselectedFile: false,
  totalChunks: 0,
  totalTokens: 0,
  onReSplitChunks: function (): void {
    throw new Error('Function not implemented.');
  },
  price: 0,
  chunkLen: 0,
  chunkOverlapRatio: 0,
  customSplitChar: undefined,
  setCustomSplitChar: function (value: string): void {
    throw new Error('Function not implemented.');
  },
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
  inputPrice,
  outputPrice,
  collectionTrainingType,
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
  inputPrice: number;
  outputPrice: number;
  collectionTrainingType: `${TrainingModeEnum}`;
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
  const [customSplitChar, setCustomSplitChar] = useState<string>();
  const [previewFile, setPreviewFile] = useState<FileItemType>();
  const [showRePreview, setReShowRePreview] = useState(false);

  const isUnselectedFile = useMemo(() => files.length === 0, [files]);

  const totalChunks = useMemo(
    () => files.reduce((sum, file) => sum + file.chunks.length, 0),
    [files]
  );

  const totalTokens = useMemo(() => files.reduce((sum, file) => sum + file.tokens, 0), [files]);

  const price = useMemo(() => {
    if (collectionTrainingType === TrainingModeEnum.qa) {
      const inputTotal = totalTokens * inputPrice;
      const outputTotal = totalTokens * 0.5 * outputPrice;

      return formatModelPrice2Read(inputTotal + outputTotal);
    }
    return formatModelPrice2Read(totalTokens * inputPrice);
  }, [collectionTrainingType, inputPrice, outputPrice, totalTokens]);

  /* 
    start upload data 
    1. create training bill
    2. create collection
    3. upload chunks
  */
  const { mutate: onclickUpload, isLoading: uploading } = useRequest({
    mutationFn: async (props?: { prompt?: string }) => {
      const { prompt } = props || {};
      let totalInsertion = 0;
      for await (const file of files) {
        // create training bill
        const billId = await postCreateTrainingBill({
          name: file.filename,
          vectorModel,
          agentModel
        });

        // create a file collection and training bill
        const collectionId = await postDatasetCollection({
          datasetId,
          parentId,
          name: file.filename,
          type: file.type,

          trainingType: collectionTrainingType,
          chunkSize: chunkLen,
          chunkSplitter: customSplitChar,
          qaPrompt: collectionTrainingType === TrainingModeEnum.qa ? prompt : '',

          fileId: file.fileId,
          rawLink: file.rawLink,

          rawTextLength: file.rawText.length,
          hashRawText: hashStr(file.rawText),
          metadata: file.metadata
        });

        // upload chunks
        const chunks = file.chunks;
        const { insertLen } = await chunksUpload({
          collectionId,
          billId,
          trainingMode: collectionTrainingType,
          chunks,
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
        title: t('core.dataset.import.Import Success Tip', { num }),
        status: 'success'
      });
      onUploadSuccess();
    },
    errorToast: t('core.dataset.import.Import Failed')
  });

  const onReSplitChunks = useCallback(async () => {
    try {
      setPreviewFile(undefined);

      setFiles((state) =>
        state.map((file) => {
          const { chunks, tokens } = splitText2Chunks({
            text: file.rawText,
            chunkLen,
            overlapRatio: chunkOverlapRatio,
            customReg: customSplitChar ? [customSplitChar] : []
          });

          return {
            ...file,
            tokens,
            chunks: chunks.map((chunk) => ({
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
        title: getErrText(error, t('core.dataset.import.Set Chunk Error'))
      });
    }
  }, [chunkLen, chunkOverlapRatio, customSplitChar, t, toast]);

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
    totalTokens,
    price,
    onReSplitChunks,
    onclickUpload,
    uploading,
    chunkLen,
    customSplitChar,
    setCustomSplitChar,
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
  const { t } = useTranslation();
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
            // contentEditable
            // dangerouslySetInnerHTML={{ __html: previewFile.rawText }}
            fontSize={'sm'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            // onBlur={(e) => {
            //   // @ts-ignore
            //   const val = e.target.innerText;
            //   setReShowRePreview(true);

            //   setFiles((state) =>
            //     state.map((file) =>
            //       file.id === previewFile.id
            //         ? {
            //             ...file,
            //             text: val
            //           }
            //         : file
            //     )
            //   );
            // }}
          >
            {previewFile.rawText}
          </Box>
        </Box>
      ) : (
        <Box pt={[3, 6]}>
          <Flex px={[4, 8]} alignItems={'center'}>
            <Box fontSize={['lg', 'xl']} fontWeight={'bold'}>
              {t('core.dataset.import.Total Chunk Preview', { totalChunks })}
            </Box>
            {totalChunks > 50 && (
              <Box ml={2} fontSize={'sm'} color={'myhGray.500'}>
                {t('core.dataset.import.Only Show First 50 Chunk')}
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
                  <Box px={4} fontSize={'sm'} whiteSpace={'pre-wrap'} wordBreak={'break-all'}>
                    {chunk.a ? `q:${chunk.q}\na:${chunk.a}` : chunk.q}
                  </Box>
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
            maxW: ['auto', '450px']
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
                bg: 'primary.50',
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
                  setPreviewFile(undefined);
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
