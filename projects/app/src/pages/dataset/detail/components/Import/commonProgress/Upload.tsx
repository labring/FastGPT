import React, { useEffect, useState } from 'react';
import {
  Box,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  Progress,
  Flex,
  Button
} from '@chakra-ui/react';
import { useImportStore, type FormType } from '../Provider';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@/web/common/hooks/useRequest';
import { postCreateTrainingBill } from '@/web/support/wallet/bill/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { chunksUpload, fileCollectionCreate } from '@/web/core/dataset/utils';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { TabEnum } from '../../../index';
import { postCreateDatasetLinkCollection, postDatasetCollection } from '@/web/core/dataset/api';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { checkTeamDatasetSizeLimit } from '@/web/support/user/team/api';

const Upload = ({ showPreviewChunks }: { showPreviewChunks: boolean }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { datasetDetail } = useDatasetStore();
  const { parentId, sources, processParamsForm, chunkSize, totalChunks, uploadRate } =
    useImportStore();
  const [uploadList, setUploadList] = useState<
    (ImportSourceItemType & {
      uploadedFileRate: number;
      uploadedChunksRate: number;
    })[]
  >([]);

  const { handleSubmit } = processParamsForm;

  const { mutate: startUpload, isLoading } = useRequest({
    mutationFn: async ({ mode, customSplitChar, qaPrompt, webSelector }: FormType) => {
      if (uploadList.length === 0) return;

      await checkTeamDatasetSizeLimit(totalChunks);

      let totalInsertion = 0;

      // Batch create collection and upload chunks
      for await (const item of uploadList) {
        const billId = await postCreateTrainingBill({
          name: item.sourceName,
          datasetId: datasetDetail._id
        });

        // create collection
        const collectionId = await (async () => {
          const commonParams = {
            parentId,
            trainingType: mode,
            datasetId: datasetDetail._id,
            chunkSize,
            chunkSplitter: customSplitChar,
            qaPrompt,

            name: item.sourceName,
            rawTextLength: item.rawText.length,
            hashRawText: hashStr(item.rawText)
          };
          if (item.file) {
            return fileCollectionCreate({
              file: item.file,
              data: {
                ...commonParams,
                collectionMetadata: {
                  relatedImgId: item.id
                }
              },
              percentListen: (e) => {
                setUploadList((state) =>
                  state.map((uploadItem) =>
                    uploadItem.id === item.id
                      ? {
                          ...uploadItem,
                          uploadedFileRate: e
                        }
                      : uploadItem
                  )
                );
              }
            });
          } else if (item.link) {
            const { collectionId } = await postCreateDatasetLinkCollection({
              ...commonParams,
              link: item.link,
              metadata: {
                webPageSelector: webSelector
              }
            });
            setUploadList((state) =>
              state.map((uploadItem) =>
                uploadItem.id === item.id
                  ? {
                      ...uploadItem,
                      uploadedFileRate: 100
                    }
                  : uploadItem
              )
            );
            return collectionId;
          } else if (item.rawText) {
            // manual collection
            return postDatasetCollection({
              ...commonParams,
              type: DatasetCollectionTypeEnum.virtual
            });
          }
          return '';
        })();

        if (!collectionId) continue;

        // upload chunks
        const chunks = item.chunks;
        const { insertLen } = await chunksUpload({
          collectionId,
          billId,
          trainingMode: mode,
          chunks,
          rate: uploadRate,
          onUploading: (e) => {
            setUploadList((state) =>
              state.map((uploadItem) =>
                uploadItem.id === item.id
                  ? {
                      ...uploadItem,
                      uploadedChunksRate: e
                    }
                  : uploadItem
              )
            );
          },
          prompt: qaPrompt
        });
        totalInsertion += insertLen;
      }

      return totalInsertion;
    },
    onSuccess(num) {
      if (showPreviewChunks) {
        toast({
          title: t('core.dataset.import.Import Success Tip', { num }),
          status: 'success'
        });
      } else {
        toast({
          title: t('core.dataset.import.Upload success'),
          status: 'success'
        });
      }

      // close import page
      router.replace({
        query: {
          ...router.query,
          currentTab: TabEnum.collectionCard
        }
      });
    },
    errorToast: t('common.file.Upload failed')
  });

  useEffect(() => {
    setUploadList(
      sources.map((item) => {
        return {
          ...item,
          uploadedFileRate: item.file ? 0 : -1,
          uploadedChunksRate: 0
        };
      })
    );
  }, []);

  return (
    <Box>
      <TableContainer>
        <Table variant={'simple'} fontSize={'sm'} draggable={false}>
          <Thead draggable={false}>
            <Tr bg={'myGray.100'} mb={2}>
              <Th borderLeftRadius={'md'} overflow={'hidden'} borderBottom={'none'} py={4}>
                {t('core.dataset.import.Source name')}
              </Th>
              {showPreviewChunks ? (
                <>
                  <Th borderBottom={'none'} py={4}>
                    {t('core.dataset.Chunk amount')}
                  </Th>
                  <Th borderBottom={'none'} py={4}>
                    {t('core.dataset.import.Upload file progress')}
                  </Th>
                  <Th borderRightRadius={'md'} overflow={'hidden'} borderBottom={'none'} py={4}>
                    {t('core.dataset.import.Data file progress')}
                  </Th>
                </>
              ) : (
                <>
                  <Th borderBottom={'none'} py={4}>
                    {t('core.dataset.import.Upload status')}
                  </Th>
                </>
              )}
            </Tr>
          </Thead>
          <Tbody>
            {uploadList.map((item) => (
              <Tr key={item.id}>
                <Td display={'flex'} alignItems={'center'}>
                  <MyIcon name={item.icon as any} w={'16px'} mr={1} />
                  {item.sourceName}
                </Td>
                {showPreviewChunks ? (
                  <>
                    <Td>{item.chunks.length}</Td>
                    <Td>
                      {item.uploadedFileRate === -1 ? (
                        '-'
                      ) : (
                        <Flex alignItems={'center'} fontSize={'xs'}>
                          <Progress
                            value={item.uploadedFileRate}
                            h={'6px'}
                            w={'100%'}
                            maxW={'210px'}
                            size="sm"
                            borderRadius={'20px'}
                            colorScheme={'blue'}
                            bg="myGray.200"
                            hasStripe
                            isAnimated
                            mr={2}
                          />
                          {`${item.uploadedFileRate}%`}
                        </Flex>
                      )}
                    </Td>
                    <Td>
                      <Flex alignItems={'center'} fontSize={'xs'}>
                        <Progress
                          value={item.uploadedChunksRate}
                          h={'6px'}
                          w={'100%'}
                          maxW={'210px'}
                          size="sm"
                          borderRadius={'20px'}
                          colorScheme={'purple'}
                          bg="myGray.200"
                          hasStripe
                          isAnimated
                          mr={2}
                        />
                        {`${item.uploadedChunksRate}%`}
                      </Flex>
                    </Td>
                  </>
                ) : (
                  <>
                    <Td color={item.uploadedFileRate === 100 ? 'green.600' : 'myGray.600'}>
                      {item.uploadedFileRate === 100 ? t('common.Finish') : t('common.Waiting')}
                    </Td>
                  </>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      <Flex justifyContent={'flex-end'} mt={4}>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => startUpload(data))}>
          {uploadList.length > 0
            ? `${t('core.dataset.import.Total files', { total: uploadList.length })} | `
            : ''}
          {t('core.dataset.import.Start upload')}
        </Button>
      </Flex>
    </Box>
  );
};

export default Upload;
