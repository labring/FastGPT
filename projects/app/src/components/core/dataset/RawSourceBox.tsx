import React, { useMemo } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { ReadCollectionSourceBodyType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import type { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

type Props = BoxProps &
  ReadCollectionSourceBodyType & {
    collectionType?: DatasetCollectionTypeEnum;
    sourceName?: string;
    sourceId?: string;
    canView?: boolean;
  };

const RawSourceBox = ({
  sourceId,
  collectionType,
  sourceName = '',
  canView = true,

  collectionId,
  appId,
  chatId,
  chatItemDataId,
  shareId,
  outLinkUid,
  teamId,
  teamToken,

  ...props
}: Props) => {
  const { t } = useTranslation();

  const canPreview = !!sourceId && canView;

  const icon = useMemo(
    () => getCollectionIcon({ type: collectionType, sourceId, name: sourceName }),
    [collectionType, sourceId, sourceName]
  );
  const read = getCollectionSourceAndOpen({
    collectionId,
    appId,
    chatId,
    chatItemDataId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });
  const displaySourceName = sourceName || t('common:unknow_source');

  return (
    <Box
      color={'myGray.900'}
      fontWeight={'medium'}
      display={'inline-flex'}
      whiteSpace={'nowrap'}
      {...(canPreview
        ? {
            cursor: 'pointer',
            textDecoration: 'underline',
            onClick: read
          }
        : {})}
      {...props}
    >
      <MyIcon name={icon as any} w={['1rem', '1.25rem']} mr={2} flexShrink={0} />
      <MyTooltip label={displaySourceName} showOnlyWhenOverflow>
        <Box
          maxW={['200px', '300px']}
          className={props.className ?? 'textEllipsis'}
          wordBreak={'break-all'}
          minW={0}
        >
          {displaySourceName}
        </Box>
      </MyTooltip>
    </Box>
  );
};

export default RawSourceBox;
