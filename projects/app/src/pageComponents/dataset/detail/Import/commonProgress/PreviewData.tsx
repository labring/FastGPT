import React, { useState } from 'react';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { getPreviewChunks } from '@/web/core/dataset/api';
import { type ImportSourceItemType } from '@/web/core/dataset/type';
import { getPreviewSourceReadType } from '../utils';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Markdown from '@/components/Markdown';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getLLMMaxChunkSize } from '@fastgpt/global/core/dataset/training/utils';

const PreviewData = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);

  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const sources = useContextSelector(DatasetImportContext, (v) => v.sources);
  const importSource = useContextSelector(DatasetImportContext, (v) => v.importSource);
  const processParamsForm = useContextSelector(DatasetImportContext, (v) => v.processParamsForm);

  const [previewFile, setPreviewFile] = useState<ImportSourceItemType>();

  const { data = { chunks: [], total: 0 }, loading: isLoading } = useRequest2(
    async () => {
      if (!previewFile) return { chunks: [], total: 0 };

      const chunkData = processParamsForm.getValues();

      if (importSource === ImportDataSourceEnum.fileCustom) {
        const chunkSplitter = processParamsForm.getValues('chunkSplitter');
        const { chunks } = splitText2Chunks({
          text: previewFile.rawText || '',
          chunkSize: chunkData.chunkSize,
          maxSize: getLLMMaxChunkSize(datasetDetail.agentModel),
          overlapRatio: 0.2,
          customReg: chunkSplitter ? [chunkSplitter] : []
        });
        return {
          chunks: chunks.map((chunk) => ({
            q: chunk,
            a: ''
          })),
          total: chunks.length
        };
      }

      return getPreviewChunks({
        datasetId,
        type: getPreviewSourceReadType(previewFile),
        sourceId:
          previewFile.dbFileId ||
          previewFile.link ||
          previewFile.externalFileUrl ||
          previewFile.apiFileId ||
          '',
        externalFileId: previewFile.externalFileId,

        ...chunkData,
        selector: processParamsForm.getValues('webSelector'),
        customPdfParse: processParamsForm.getValues('customPdfParse'),
        overlapRatio: 0.2
      });
    },
    {
      refreshDeps: [previewFile],
      manual: false,
      onSuccess(result) {
        if (!previewFile) return;
        if (!result || result.total === 0) {
          toast({
            title: t('dataset:preview_chunk_empty'),
            status: 'error'
          });
        }
      }
    }
  );

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex flex={'1 0 0'} border={'base'} borderRadius={'md'}>
        <Flex flexDirection={'column'} flex={'1 0 0'} borderRight={'base'}>
          <FormLabel fontSize={'md'} py={4} px={5} borderBottom={'base'}>
            {t('dataset:file_list')}
          </FormLabel>
          <Box flex={'1 0 0'} overflowY={'auto'} px={5} py={3}>
            {sources.map((source) => (
              <HStack
                key={source.id}
                bg={'myGray.50'}
                p={4}
                borderRadius={'md'}
                borderWidth={'1px'}
                borderColor={'transparent'}
                cursor={'pointer'}
                _hover={{
                  borderColor: 'primary.300'
                }}
                {...(previewFile?.id === source.id && {
                  borderColor: 'primary.500 !important',
                  bg: 'primary.50 !important'
                })}
                _notLast={{ mb: 3 }}
                onClick={() => setPreviewFile(source)}
              >
                <MyIcon name={source.icon as any} w={'1.25rem'} />
                <Box ml={1} flex={'1 0 0'} wordBreak={'break-all'} fontSize={'sm'}>
                  {source.sourceName}
                </Box>
              </HStack>
            ))}
          </Box>
        </Flex>
        <Flex flexDirection={'column'} flex={'1 0 0'}>
          <Flex py={4} px={5} borderBottom={'base'} justifyContent={'space-between'}>
            <FormLabel fontSize={'md'}>{t('dataset:preview_chunk')}</FormLabel>
            <Box fontSize={'xs'} color={'myGray.500'}>
              {t('dataset:preview_chunk_intro', { total: data.total })}
            </Box>
          </Flex>
          <MyBox isLoading={isLoading} flex={'1 0 0'} h={0}>
            <Box h={'100%'} overflowY={'auto'} px={5} py={3}>
              {previewFile ? (
                <>
                  {data.chunks.map((item, index) => (
                    <Box
                      key={index}
                      fontSize={'sm'}
                      color={'myGray.600'}
                      _notLast={{
                        mb: 3,
                        pb: 3,
                        borderBottom: 'base'
                      }}
                      _hover={{
                        bg: 'myGray.100'
                      }}
                    >
                      <Markdown source={item.q} />
                      <Markdown source={item.a} />
                    </Box>
                  ))}
                </>
              ) : (
                <EmptyTip text={t('dataset:preview_chunk_not_selected')} />
              )}
            </Box>
          </MyBox>
        </Flex>
      </Flex>
      <Flex mt={2} justifyContent={'flex-end'}>
        <Button onClick={goToNext}>{t('common:next_step')}</Button>
      </Flex>
    </Flex>
  );
};

export default React.memo(PreviewData);
