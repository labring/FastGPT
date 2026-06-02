import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton, { MyDeleteIconButton } from '@fastgpt/web/components/common/Icon/button';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';

type DatasetCardProps = {
  dataset: SelectedDatasetType;
  onDelete?: (datasetId: string) => void;
  showPreview?: boolean;
  flexProps?: FlexProps;
};

const formCardShadow = '0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)';

const cardProps: FlexProps = {
  position: 'relative',
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
 * 单个已选知识库卡片，仅消费后端补齐的 isDeleted 状态来展示正常态或删除态。
 */
const DatasetCard = React.memo(function DatasetCard({
  dataset,
  onDelete,
  showPreview = true,
  flexProps
}: DatasetCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const isDeleted = !!dataset.isDeleted;
  const hasController = showPreview || onDelete;
  const hasPreviewButton = showPreview && !isDeleted;

  return (
    <Flex
      overflow={'hidden'}
      alignItems={'center'}
      userSelect={'none'}
      {...cardProps}
      {...flexProps}
      border={flexProps?.border || cardProps.border}
      borderColor={isDeleted ? 'red.600' : flexProps?.borderColor}
      _hover={{
        ...flexProps?._hover,
        borderColor: isDeleted ? 'red.600' : 'primary.300',
        '& .dataset-card-controller': {
          opacity: 1,
          pointerEvents: 'auto'
        }
      }}
    >
      <Avatar src={dataset.avatar} w={'1.5rem'} borderRadius={'sm'} />
      <Box
        ml={2}
        flex={'1 0 0'}
        w={0}
        minW={0}
        pr={hasController ? (hasPreviewButton && onDelete ? 14 : 8) : 0}
        className={'textEllipsis'}
        fontSize={'sm'}
        color={isDeleted ? 'red.600' : 'myGray.900'}
      >
        {isDeleted ? t('common:dataset_deleted') : dataset.name}
      </Box>

      {hasController && (
        <Box
          className="dataset-card-controller"
          position={'absolute'}
          right={2}
          top={'50%'}
          transform={'translateY(-50%)'}
          display={'flex'}
          alignItems={'center'}
          opacity={[1, 0]}
          pointerEvents={['auto', 'none']}
          bg={'white'}
        >
          {showPreview && !isDeleted && (
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
          {onDelete && (
            <MyDeleteIconButton
              onClick={(e) => {
                e.stopPropagation();
                onDelete(dataset.datasetId);
              }}
            />
          )}
        </Box>
      )}
    </Flex>
  );
});

export default DatasetCard;
