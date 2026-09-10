import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton, { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

type DatasetCardProps = {
  dataset: SelectedDatasetType;
  onDelete?: (datasetId: string) => void;
  flexProps?: FlexProps;
};

const formCardShadow = '0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)';

const cardProps: FlexProps = {
  w: '100%',
  minW: 0,
  maxW: '100%',
  p: 2,
  bg: 'white',
  boxShadow: formCardShadow,
  borderRadius: 'md',
  border: 'base'
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
  const isMissing = dataset.error === 'resource_missing';
  const isUnavailable = hasError;
  const hasPreviewButton = !isUnavailable;
  const hasDeleteButton = !!onDelete;
  const hasController = hasPreviewButton || hasDeleteButton;

  const errorText = (() => {
    if (dataset.error === 'resource_no_permission') {
      return t('common:core.workflow.check.resource_no_permission');
    }
    if (dataset.error) {
      return t('common:dataset_deleted');
    }
    return '';
  })();

  return (
    <Flex
      overflow={'hidden'}
      alignItems={'center'}
      userSelect={'none'}
      {...cardProps}
      {...flexProps}
      border={flexProps?.border || cardProps.border}
      borderColor={isUnavailable ? 'red.600' : flexProps?.borderColor}
      _hover={{
        ...flexProps?._hover,
        borderColor: isUnavailable ? 'red.600' : 'primary.300',
        '& .dataset-card-controller': {
          display: 'flex'
        }
      }}
    >
      <Avatar src={dataset.avatar} w={'1.5rem'} borderRadius={'sm'} />
      <MyTooltip
        label={isMissing ? t('common:dataset_deleted') : dataset.name}
        showOnlyWhenOverflow
      >
        <Box
          ml={2}
          flex={'1 1 auto'}
          w={0}
          minW={0}
          className={'textEllipsis'}
          fontSize={'sm'}
          color={isUnavailable ? 'red.600' : 'myGray.900'}
        >
          {isMissing ? t('common:dataset_deleted') : dataset.name}
        </Box>
      </MyTooltip>

      {dataset.error && (
        <MyTag colorSchema="red" type="fill" className="unHoverStyle" flexShrink={0}>
          <MyIcon name="common/error" w="14px" mr={1} />
          <MyTooltip label={errorText} showOnlyWhenOverflow>
            <Box color="red.600" maxW="150px" className="textEllipsis">
              {errorText}
            </Box>
          </MyTooltip>
        </MyTag>
      )}

      {hasController && (
        <Box
          className="dataset-card-controller"
          ml={2}
          flexShrink={0}
          display={['flex', 'none']}
          alignItems={'center'}
        >
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
        </Box>
      )}
    </Flex>
  );
});

export default DatasetCard;
