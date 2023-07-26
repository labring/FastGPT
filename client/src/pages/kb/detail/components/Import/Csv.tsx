import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Button, useTheme, Image } from '@chakra-ui/react';
import { useToast } from '@/hooks/useToast';
import { useConfirm } from '@/hooks/useConfirm';
import { useMutation } from '@tanstack/react-query';
import { postKbDataFromList } from '@/api/plugins/kb';
import { getErrText } from '@/utils/tools';
import { vectorModelList } from '@/store/static';
import MyIcon from '@/components/Icon';
import DeleteIcon, { hoverDeleteStyles } from '@/components/Icon/delete';
import { customAlphabet } from 'nanoid';
import { TrainingModeEnum } from '@/constants/plugin';
import FileSelect from './FileSelect';
import { useRouter } from 'next/router';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);
import { readCsvContent } from '@/utils/file';

const fileExtension = '.csv';

type FileItemType = {
  id: string;
  filename: string;
  chunks: { q: string; a: string }[];
};

const CsvImport = ({ kbId }: { kbId: string }) => {
  const model = vectorModelList[0]?.model;
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();

  const [selecting, setSelecting] = useState(false);
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

  const onSelectFile = useCallback(
    async (files: File[]) => {
      setSelecting(true);
      try {
        let promise = Promise.resolve();
        files.forEach((file) => {
          promise = promise.then(async () => {
            const { header, data } = await readCsvContent(file);
            if (header[0] !== 'question' || header[1] !== 'answer') {
              throw new Error('csv 文件格式有误');
            }

            setFiles((state) => [
              {
                id: nanoid(),
                filename: file.name,
                chunks: data.map((item) => ({
                  q: item[0],
                  a: item[1]
                }))
              },
              ...state
            ]);
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

  const { mutate: onclickUpload, isLoading: uploading } = useMutation({
    mutationFn: async () => {
      const chunks: { a: string; q: string; source: string }[] = [];
      files.forEach((file) =>
        file.chunks.forEach((chunk) => {
          chunks.push({
            ...chunk,
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
          mode: TrainingModeEnum.index
        });

        success += insertLen;
        setSuccessChunks(success);
      }

      toast({
        title: `去重后共导入 ${success} 条数据，请耐心等待训练.`,
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

  return (
    <Box display={['block', 'flex']} h={['auto', '100%']}>
      <Box flex={1} minW={['auto', '400px']} w={['100%', 0]} p={[4, 8]}>
        <FileSelect
          fileExtension={fileExtension}
          onSelectFile={onSelectFile}
          isLoading={selecting}
          tipText={'如果导入文件乱码，请将 CSV 转成 utf-8 编码格式'}
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
                  position={'relative'}
                  alignItems={'center'}
                  _hover={{ ...hoverDeleteStyles }}
                >
                  <Image src={'/imgs/files/csv.svg'} w={'16px'} alt={''} />
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
      </Box>
      {!emptyFiles && (
        <Box flex={'2 0 0'} w={['100%', 0]} h={'100%'} pt={[4, 8]} overflow={'overlay'}>
          <Box px={[4, 8]} fontSize={['lg', 'xl']} fontWeight={'bold'}>
            数据预览({totalChunk}组)
          </Box>
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
                    {`q: ${item.q}\na: ${item.a}`}
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
