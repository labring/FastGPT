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
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

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
