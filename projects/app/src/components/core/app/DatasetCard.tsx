import React from 'react';
import { type FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton, { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import FormResourceCard from './FormResourceCard';

type DatasetCardProps = {
  dataset: SelectedDatasetType;
  onDelete?: (datasetId: string) => void;
  flexProps?: FlexProps;
};

/**
 * 单个已选知识库卡片，展示后端补齐的删除态和当前操作者无权限态。
 */
const DatasetCard = React.memo(function DatasetCard({
  dataset,
  onDelete,
  flexProps
}: DatasetCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const hasError = !!dataset.error;
  const hasPreviewButton = !hasError;
  const hasDeleteButton = !!onDelete;

  const errorText =
    dataset.error === 'resource_no_permission'
      ? t('common:core.workflow.check.resource_no_permission')
      : dataset.error
        ? t('common:dataset_deleted')
        : '';
  const tooltipLabel = errorText || dataset.name;

  return (
    <FormResourceCard
      avatar={<Avatar src={dataset.avatar} w={'1.5rem'} borderRadius={'sm'} />}
      name={dataset.name}
      isUnavailable={hasError}
      tooltipLabel={tooltipLabel}
      errorText={errorText}
      flexProps={flexProps}
      actions={
        hasPreviewButton || hasDeleteButton ? (
          <>
            {hasPreviewButton && (
              <MyIconButton
                icon={'common/viewLight'}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push({
                    pathname: '/dataset/detail',
                    query: {
                      datasetId: dataset.datasetId
                    }
                  });
                }}
              />
            )}
            {hasDeleteButton && (
              <MyDeleteIconButton
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(dataset.datasetId);
                }}
              />
            )}
          </>
        ) : undefined
      }
    />
  );
});

export default DatasetCard;
