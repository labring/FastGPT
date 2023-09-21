import React, { useState, useMemo } from 'react';
import { Box, Flex, Button, useTheme, Image } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation } from '@tanstack/react-query';
import { getErrText } from '@/utils/tools';
import MyIcon from '@/components/Icon';
import DeleteIcon, { hoverDeleteStyles } from '@/components/Icon/delete';
import { TrainingModeEnum } from '@/constants/plugin';
import FileSelect, { type FileItemType } from './FileSelect';
import { useRouter } from 'next/router';
import { useDatasetStore } from '@/store/dataset';
import { putMarkFilesUsed } from '@/api/core/dataset/file';
import { chunksUpload } from '@/utils/web/core/dataset';

const fileExtension = '.csv';

const CsvImport = ({ kbId }: { kbId: string }) => {
  const { kbDetail } = useDatasetStore();
  const maxToken = kbDetail.vectorModel?.maxToken || 2000;

  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();

  const [files, setFiles] = useState<FileItemType[]>([]);
  const [successChunks, setSuccessChunks] = useState(0);

  const totalChunk = useMemo(
    () => files.reduce((sum, file) => sum + file.chunks.length, 0),
    [files]
  );
  const emptyFiles = useMemo(() => files.length === 0, [files]);

  const { openConfirm, ConfirmModal } = useConfirm({
    content: `该任务无法终止，需要一定时间生成索引，请确认导入。如果余额不足，未完成的任务会被暂停，充值后可继续进行。`
  });

  const { mutate: onclickUpload, isLoading: uploading } = useMutation({
    mutationFn: async () => {
      // mark the file is used
      await putMarkFilesUsed({ fileIds: files.map((file) => file.id) });

      const chunks = files
        .map((file) => file.chunks)
        .flat()
        .filter((item) => item?.q);

      const filterChunks = chunks.filter((item) => item.q.length < maxToken * 1.5);

      if (filterChunks.length !== chunks.length) {
        toast({
          title: `${chunks.length - filterChunks.length}条数据超出长度，已被过滤`,
          status: 'info'
        });
      }

      // upload data
      const { insertLen } = await chunksUpload({
        kbId,
        chunks,
        mode: TrainingModeEnum.index,
        onUploading: (insertLen) => {
          setSuccessChunks(insertLen);
        }
      });

      toast({
        title: `去重后共导入 ${insertLen} 条数据，请耐心等待训练.`,
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
          tipText={
            'file.If the imported file is garbled, please convert CSV to UTF-8 encoding format'
          }
          onPushFiles={(files) => setFiles((state) => files.concat(state))}
          showUrlFetch={false}
          showCreateFile={false}
          py={emptyFiles ? '100px' : 5}
          isCsv
        />

        {!emptyFiles && (
          <>
            <Box py={4} minH={['auto', '100px']} px={2} maxH={'400px'} overflow={'auto'}>
              {files.map((item) => (
                <Flex
                  key={item.id}
                  w={'100%'}
                  _notLast={{ mb: 5 }}
                  px={5}
                  py={2}
                  boxShadow={'1px 1px 5px rgba(0,0,0,0.15)'}
                  borderRadius={'md'}
                  position={'relative'}
                  alignItems={'center'}
                  _hover={{ ...hoverDeleteStyles }}
                >
                  <Image src={'/imgs/files/csv.svg'} w={'16px'} alt={''} />
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

            <Flex mt={3}>
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
        <Box flex={'2 0 0'} w={['100%', 0]} h={'100%'} pt={[4, 8]} overflow={'overlay'}>
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
              file.chunks.slice(0, 100).map((item, i) => (
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
                    {item.source && <Box ml={1}>({item.source})</Box>}
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
                    {`${item.q}\n${item.a}`}
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}
      <ConfirmModal />
    </Box>
  );
};

export default CsvImport;
