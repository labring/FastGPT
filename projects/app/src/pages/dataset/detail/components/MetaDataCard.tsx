import React, { useMemo, useState } from 'react';
import { Box, Flex, Button, IconButton, Input, Textarea, HStack } from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollectionById } from '@/web/core/dataset/api';
import { useRouter } from 'next/router';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatFileSize } from '@fastgpt/global/common/file/tools';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { DatasetCollectionTypeMap, TrainingTypeMap } from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';

const MetaDataCard = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { collectionId = '' } = router.query as {
    collectionId: string;
    datasetId: string;
  };
  const readSource = getCollectionSourceAndOpen(collectionId);
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
  const metadataList = useMemo(() => {
    if (!collection) return [];

    const webSelector =
      collection?.datasetId?.websiteConfig?.selector || collection?.metadata?.webPageSelector;

    return [
      {
        label: t('common:core.dataset.collection.metadata.source'),
        value: t(DatasetCollectionTypeMap[collection.type]?.name as any)
      },
      {
        label: t('common:core.dataset.collection.metadata.source name'),
        value: collection.file?.filename || collection?.rawLink || collection?.name
      },
      {
        label: t('common:core.dataset.collection.metadata.source size'),
        value: collection.file ? formatFileSize(collection.file.length) : '-'
      },
      {
        label: t('common:core.dataset.collection.metadata.Createtime'),
        value: formatTime2YMDHM(collection.createTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Updatetime'),
        value: formatTime2YMDHM(collection.updateTime)
      },
      {
        label: t('common:core.dataset.collection.metadata.Raw text length'),
        value: collection.rawTextLength ?? '-'
      },
      {
        label: t('common:core.dataset.collection.metadata.Training Type'),
        value: t(TrainingTypeMap[collection.trainingType]?.label as any)
      },
      {
        label: t('common:core.dataset.collection.metadata.Chunk Size'),
        value: collection.chunkSize || '-'
      },
      ...(webSelector
        ? [
            {
              label: t('common:core.dataset.collection.metadata.Web page selector'),
              value: webSelector
            }
          ]
        : []),
      {
        ...(collection.tags
          ? [
              {
                label: t('dataset:collection_tags'),
                value: collection.tags?.join(', ') || '-'
              }
            ]
          : [])
      }
    ];
  }, [collection, t]);

  return (
    <MyBox isLoading={isLoading} w={'100%'} h={'100%'} p={6}>
      <Box fontSize={'lg'} pb={4}>
        {t('common:core.dataset.collection.metadata.metadata')}
      </Box>
      <Box fontSize={'sm'} color={'myGray.500'} mb={5}>
        {t('common:core.dataset.collection.id')}:{' '}
        <Box as={'span'} userSelect={'all'}>
          {collection?._id}
        </Box>
      </Box>
      {metadataList.map((item, i) => (
        <Flex key={i} alignItems={'center'} mb={5} wordBreak={'break-all'} fontSize={'sm'}>
          <Box color={'myGray.500'} flex={'0 0 100px'}>
            {item.label}
          </Box>
          <Box>{item.value}</Box>
        </Flex>
      ))}
      {collection?.sourceId && (
        <Button variant={'whitePrimary'} onClick={readSource}>
          {t('common:core.dataset.collection.metadata.read source')}
        </Button>
      )}
    </MyBox>
  );
};

export default React.memo(MetaDataCard);
