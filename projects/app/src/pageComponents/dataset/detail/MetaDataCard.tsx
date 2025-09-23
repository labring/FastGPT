import React, { useMemo } from 'react';
import { Box, Flex, Button } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import { useRouter } from 'next/router';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import {
  DatasetCollectionDataProcessModeMap,
  DatasetCollectionTypeMap,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import MyIcon from '@fastgpt/web/components/common/Icon';

const MetaDataCard = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { collectionId = '' } = router.query as {
    collectionId: string;
    datasetId: string;
  };

  const readSource = getCollectionSourceAndOpen({
    collectionId
  });
  const { data: collection, loading: isLoading } = useRequest2(
    () => getDatasetCollectionById(collectionId),
    {
      onError: () => {
        router.replace({
          query: {
            datasetId
          }
        });
      },
      manual: false
    }
  );

  const metadataList = useMemo<{ label?: string; value?: any }[]>(() => {
    if (!collection) return [];

    const webSelector = collection?.metadata?.webPageSelector;

    return [
      {
        label: t('common:core.dataset.collection.id'),
        value: collection?._id
      },
      {
        label: t('common:core.dataset.collection.metadata.source'),
        value: t(DatasetCollectionTypeMap[collection.type]?.name as any)
      },
      {
        label: t('dataset:collection_name'),
        value: collection.file?.filename || collection?.rawLink || collection?.name
      },
      ...(collection.file
        ? [
            {
              label: t('common:core.dataset.collection.metadata.source size'),
              value: formatFileSize(collection.file.length)
            }
          ]
        : []),
      {
        label: t('common:core.dataset.collection.metadata.Createtime'),
        value: formatTime2YMDHM(collection.createTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Updatetime'),
        value: formatTime2YMDHM(collection.updateTime)
      },
      ...(collection.customPdfParse !== undefined
        ? [
            {
              label: t('dataset:collection_metadata_custom_pdf_parse'),
              value: collection.customPdfParse ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.rawTextLength !== undefined
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Raw text length'),
              value: collection.rawTextLength
            }
          ]
        : []),
      ...(DatasetCollectionDataProcessModeMap[collection.trainingType]
        ? [
            {
              label: t('dataset:collection.training_type'),
              value: t(DatasetCollectionDataProcessModeMap[collection.trainingType]?.label as any)
            }
          ]
        : []),
      ...(collection.indexPrefixTitle !== undefined
        ? [
            {
              label: t('dataset:index_prefix_title'),
              value: collection.indexPrefixTitle ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.imageIndex !== undefined
        ? [
            {
              label: t('dataset:data_index_image'),
              value: collection.imageIndex ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.autoIndexes !== undefined
        ? [
            {
              label: t('dataset:auto_indexes'),
              value: collection.autoIndexes ? 'Yes' : 'No'
            }
          ]
        : []),
      ...(collection.chunkSize !== undefined
        ? [
            {
              label: t('dataset:chunk_size'),
              value: collection.chunkSize
            }
          ]
        : []),
      ...(collection.indexSize !== undefined
        ? [
            {
              label: t('dataset:index_size'),
              value: collection.indexSize
            }
          ]
        : []),
      ...(webSelector !== undefined
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Web page selector'),
              value: webSelector
            }
          ]
        : []),
      ...(collection.tags
        ? [
            {
              label: t('dataset:collection_tags'),
              value: collection.tags?.join(', ') || '-'
            }
          ]
        : [])
    ];
  }, [collection, t]);

  return (
    <MyBox isLoading={isLoading} w={'100%'} h={'100%'} p={6} overflow={'auto'}>
      <Box fontSize={'md'} fontWeight={'bold'} color={'myGray.900'} pb={4}>
        {t('common:core.dataset.collection.metadata.metadata')}
      </Box>
      {metadataList.map(
        (item, i) =>
          item.label &&
          item.value && (
            <Box key={i} mb={3} wordBreak={'break-all'}>
              <Box color={'myGray.500'} fontSize={'xs'}>
                {item.label}
              </Box>
              <Box color={'myGray.900'} fontSize={'sm'}>
                {item.value}
              </Box>
            </Box>
          )
      )}
      {collection?.sourceId && (
        <Button variant={'whitePrimary'} onClick={readSource}>
          <Flex py={2} px={3}>
            <MyIcon name="visible" w={'1rem'} mr={'0.38rem'} />
            <Box>{t('common:core.dataset.collection.metadata.read source')}</Box>
          </Flex>
        </Button>
      )}
    </MyBox>
  );
};

export default React.memo(MetaDataCard);
