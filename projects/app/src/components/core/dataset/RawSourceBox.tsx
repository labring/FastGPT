import React, { useMemo } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';
import type { readCollectionSourceBody } from '@/pages/api/core/dataset/collection/read';

type Props = BoxProps &
  readCollectionSourceBody & {
    sourceName?: string;
    collectionId: string;
    sourceId?: string;
    canView?: boolean;
  };

const RawSourceBox = ({
  sourceId,
  sourceName = '',
  canView = true,

  collectionId,
  appId,
  chatId,
  chatItemId,
  shareId,
  outLinkUid,
  teamId,
  teamToken,

  ...props
}: Props) => {
  const { t } = useTranslation();
  const { fileT } = useI18n();

  const canPreview = !!sourceId && canView;

  const icon = useMemo(() => getSourceNameIcon({ sourceId, sourceName }), [sourceId, sourceName]);
  const read = getCollectionSourceAndOpen({
    collectionId,
    appId,
    chatId,
    chatItemId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  return (
    <MyTooltip
      label={canPreview ? fileT('click_to_view_raw_source') : ''}
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
          {sourceName || t('common:common.UnKnow Source')}
        </Box>
      </Box>
    </MyTooltip>
  );
};

export default RawSourceBox;
