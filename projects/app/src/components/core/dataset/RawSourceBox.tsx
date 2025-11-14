import React, { useMemo } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { readCollectionSourceBody } from '@/pages/api/core/dataset/collection/read';
import type { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

type Props = BoxProps &
  readCollectionSourceBody & {
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

  return (
    <MyTooltip
      label={canPreview ? t('file:click_to_view_raw_source') : ''}
      shouldWrapChildren={false}
    >
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
        <MyIcon name={icon as any} w={['1rem', '1.25rem']} mr={2} />
        <Box
          maxW={['200px', '300px']}
          className={props.className ?? 'textEllipsis'}
          wordBreak={'break-all'}
        >
          {sourceName || t('common:unknow_source')}
        </Box>
      </Box>
    </MyTooltip>
  );
};

export default RawSourceBox;
