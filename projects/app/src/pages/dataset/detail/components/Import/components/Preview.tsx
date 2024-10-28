import React, { useState } from 'react';
import { Box, Flex, Grid, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
const PreviewRawText = dynamic(() => import('./PreviewRawText'));
const PreviewChunks = dynamic(() => import('./PreviewChunks'));

const Preview = ({ showPreviewChunks }: { showPreviewChunks: boolean }) => {
  const { t } = useTranslation();

  const { sources } = useContextSelector(DatasetImportContext, (v) => v);
  const [previewRawTextSource, setPreviewRawTextSource] = useState<ImportSourceItemType>();
  const [previewChunkSource, setPreviewChunkSource] = useState<ImportSourceItemType>();

  return (
    <Box h={'100%'} w={'100%'} display={['block', 'flex']} flexDirection={'column'}>
      <Flex alignItems={'center'}>
        <MyIcon name={'core/dataset/fileCollection'} w={'20px'} />
        <Box fontSize={'md'}>{t('common:core.dataset.import.Sources list')}</Box>
      </Flex>
      <Box mt={3} flex={'1 0 0'} width={'100%'} overflowY={'auto'}>
        <Grid w={'100%'} gap={3} gridTemplateColumns={['1fr', '1fr', '1fr', '1fr', '1fr 1fr']}>
          {sources.map((source) => (
            <Flex
              key={source.id}
              bg={'white'}
              p={4}
              borderRadius={'md'}
              borderWidth={'1px'}
              borderColor={'borderColor.low'}
              boxShadow={'2'}
              alignItems={'center'}
            >
              <MyIcon name={source.icon as any} w={['1rem', '1.25rem']} />
              <Box mx={1} flex={'1 0 0'} wordBreak={'break-all'} fontSize={'sm'}>
                {source.sourceName}
              </Box>
              {showPreviewChunks && (
                <Box fontSize={'xs'} color={'myGray.600'}>
                  <MyMenu
                    Button={
                      <IconButton
                        icon={<MyIcon name={'common/viewLight'} w={'14px'} p={2} />}
                        aria-label={''}
                        size={'sm'}
                        variant={'whitePrimary'}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: (
                              <Flex alignItems={'center'}>
                                <MyIcon name={'core/dataset/fileCollection'} w={'14px'} mr={2} />
                                {t('common:core.dataset.import.Preview raw text')}
                              </Flex>
                            ),
                            onClick: () => setPreviewRawTextSource(source)
                          },
                          {
                            label: (
                              <Flex alignItems={'center'}>
                                <MyIcon name={'core/dataset/splitLight'} w={'14px'} mr={2} />
                                {t('common:core.dataset.import.Preview chunks')}
                              </Flex>
                            ),
                            onClick: () => setPreviewChunkSource(source)
                          }
                        ]
                      }
                    ]}
                  />
                </Box>
              )}
            </Flex>
          ))}
        </Grid>
      </Box>
      {!!previewRawTextSource && (
        <PreviewRawText
          previewSource={previewRawTextSource}
          onClose={() => setPreviewRawTextSource(undefined)}
        />
      )}
      {!!previewChunkSource && (
        <PreviewChunks
          previewSource={previewChunkSource}
          onClose={() => setPreviewChunkSource(undefined)}
        />
      )}
    </Box>
  );
};

export default React.memo(Preview);
