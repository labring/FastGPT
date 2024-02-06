import React, { useMemo, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

import RowTabs from '@fastgpt/web/components/common/Tabs/RowTabs';
import { ImportSourceItemType } from '@/web/core/dataset/type';

enum PreviewListEnum {
  chunks = 'chunks',
  sources = 'sources'
}

const Preview = ({
  sources,
  showPreviewChunks
}: {
  sources: ImportSourceItemType[];
  showPreviewChunks: boolean;
}) => {
  const { t } = useTranslation();
  const [previewListType, setPreviewListType] = useState(
    showPreviewChunks ? PreviewListEnum.chunks : PreviewListEnum.sources
  );

  const chunks = useMemo(() => {
    const oneSourceChunkLength = Math.max(4, Math.floor(50 / sources.length));
    return sources
      .map((source) =>
        source.chunks.slice(0, oneSourceChunkLength).map((chunk, i) => ({
          ...chunk,
          index: i + 1,
          sourceName: source.sourceName,
          sourceIcon: source.icon
        }))
      )
      .flat();
  }, [sources]);

  return (
    <Box h={'100%'} display={['block', 'flex']} flexDirection={'column'} flex={'1 0 0'}>
      <Box>
        <RowTabs
          list={[
            ...(showPreviewChunks
              ? [
                  {
                    icon: 'common/viewLight',
                    label: t('core.dataset.import.Preview chunks'),
                    value: PreviewListEnum.chunks
                  }
                ]
              : []),
            {
              icon: 'core/dataset/fileCollection',
              label: t('core.dataset.import.Sources list'),
              value: PreviewListEnum.sources
            }
          ]}
          value={previewListType}
          onChange={(e) => setPreviewListType(e as PreviewListEnum)}
        />
      </Box>
      <Box mt={3} flex={'1 0 0'} overflow={'auto'}>
        {previewListType === PreviewListEnum.chunks ? (
          <>
            {chunks.map((chunk, i) => (
              <Box
                key={i}
                p={4}
                bg={'white'}
                mb={3}
                borderRadius={'md'}
                borderWidth={'1px'}
                borderColor={'borderColor.low'}
                boxShadow={'2'}
                whiteSpace={'pre-wrap'}
              >
                <Flex mb={1} alignItems={'center'} fontSize={'sm'}>
                  <Box
                    flexShrink={0}
                    px={1}
                    color={'primary.600'}
                    borderWidth={'1px'}
                    borderColor={'primary.200'}
                    bg={'primary.50'}
                    borderRadius={'sm'}
                  >
                    # {chunk.index}
                  </Box>
                  <Flex ml={2} fontWeight={'bold'} alignItems={'center'} gap={1}>
                    <MyIcon name={chunk.sourceIcon as any} w={'14px'} />
                    {chunk.sourceName}
                  </Flex>
                </Flex>
                <Box fontSize={'xs'} whiteSpace={'pre-wrap'} wordBreak={'break-all'}>
                  <Box color={'myGray.900'}>{chunk.q}</Box>
                  <Box color={'myGray.500'}>{chunk.a}</Box>
                </Box>
              </Box>
            ))}
          </>
        ) : (
          <>
            {sources.map((source) => (
              <Flex
                key={source.id}
                bg={'white'}
                p={4}
                borderRadius={'md'}
                borderWidth={'1px'}
                borderColor={'borderColor.low'}
                boxShadow={'2'}
                mb={3}
              >
                <MyIcon name={source.icon as any} w={'16px'} />
                <Box mx={1} flex={'1 0 0'} className="textEllipsis">
                  {source.sourceName}
                </Box>
                {showPreviewChunks && (
                  <Box>
                    {t('core.dataset.import.File chunk amount', { amount: source.chunks.length })}
                  </Box>
                )}
              </Flex>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
};

export default React.memo(Preview);
