import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { DatasetStatusEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';

const EmptyCollectionTip = () => {
  const { t, i18n } = useTranslation();
  const onOpenWebsiteModal = useContextSelector(CollectionPageContext, (v) => v.onOpenWebsiteModal);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const hasDatabaseConfig = useContextSelector(CollectionPageContext, (v) => v.hasDatabaseConfig);
  const handleOpenConfigPage = useContextSelector(
    CollectionPageContext,
    (v) => v.handleOpenConfigPage
  );

  return (
    <>
      {(datasetDetail.type === DatasetTypeEnum.dataset ||
        datasetDetail.type === DatasetTypeEnum.externalFile) && (
        <EmptyTip text={t('common:core.dataset.collection.Empty Tip')} />
      )}
      {datasetDetail.type === DatasetTypeEnum.websiteDataset && (
        <EmptyTip
          text={
            <Flex whiteSpace={'pre-wrap'}>
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
                      {i18n.language === 'en' ? ' ' : ''}
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
      {datasetDetail.type === DatasetTypeEnum.database && (
        <EmptyTip
          text={
            !hasDatabaseConfig ? (
              <Flex>
                {t('common:no_database_connection')}
                {i18n.language === 'en' ? ' ' : ''}
                <Box
                  textDecoration={'underline'}
                  cursor={'pointer'}
                  onClick={() => handleOpenConfigPage('create')}
                >
                  {t('common:click_config_database')}
                </Box>
              </Flex>
            ) : (
              t('common:core.dataset.collection.Empty Tip')
            )
          }
        />
      )}
    </>
  );
};

export default EmptyCollectionTip;
