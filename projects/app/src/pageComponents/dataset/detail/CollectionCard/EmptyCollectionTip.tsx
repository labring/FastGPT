import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

const EmptyCollectionTip = () => {
  const { t } = useTranslation();
  const onOpenWebsiteModal = useContextSelector(CollectionPageContext, (v) => v.onOpenWebsiteModal);
  const tagFilters = useContextSelector(CollectionPageContext, (v) => v.tagFilters);
  const setTagFilters = useContextSelector(CollectionPageContext, (v) => v.setTagFilters);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  if (tagFilters.length > 0) {
    return (
      <EmptyTip
        text={
          <Flex>
            <Box>{t('dataset:tag.filter_empty_prefix')}</Box>
            <Box
              color={'primary.700'}
              cursor={'pointer'}
              onClick={() => {
                setTagFilters([]);
              }}
            >
              {t('dataset:tag.filter_clear_items')}
            </Box>
          </Flex>
        }
      />
    );
  }

  return (
    <>
      {(datasetDetail.type === DatasetTypeEnum.dataset ||
        datasetDetail.type === DatasetTypeEnum.externalFile) && (
        <EmptyTip text={t('common:core.dataset.collection.Empty Tip')} />
      )}
      {datasetDetail.type === DatasetTypeEnum.websiteDataset && (
        <EmptyTip
          text={
            <Flex>
              {datasetDetail.status === DatasetStatusEnum.syncing && (
                <>{t('common:core.dataset.status.syncing')}</>
              )}
              {datasetDetail.status === DatasetStatusEnum.waiting && (
                <>{t('common:core.dataset.status.waiting')}</>
              )}
              {datasetDetail.status === DatasetStatusEnum.active && (
                <>
                  {!datasetDetail?.websiteConfig?.url ? (
                    <>
                      {t('common:core.dataset.collection.Website Empty Tip')}
                      {', '}
                      <Box
                        textDecoration={'underline'}
                        cursor={'pointer'}
                        onClick={onOpenWebsiteModal}
                      >
                        {t('common:core.dataset.collection.Click top config website')}
                      </Box>
                    </>
                  ) : (
                    <>{t('common:core.dataset.website.UnValid Website Tip')}</>
                  )}
                </>
              )}
            </Flex>
          }
        />
      )}
    </>
  );
};

export default EmptyCollectionTip;
