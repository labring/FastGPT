import React, { useCallback, useMemo, useState } from 'react';
import { ModalBody, Box, useTheme, Flex, Progress, Link, Image } from '@chakra-ui/react';
import { getDatasetDataItemById } from '@/web/core/dataset/api';
import { useLoading } from '@/web/common/hooks/useLoading';
import { useToast } from '@/web/common/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyIcon from '@/components/Icon';
import InputDataModal, {
  RawSourceText,
  type InputDataType
} from '@/pages/dataset/detail/components/InputDataModal';
import MyModal from '../MyModal';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import MyTooltip from '../MyTooltip';
import NextLink from 'next/link';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const QuoteModal = ({
  rawSearch = [],
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { setIsLoading, Loading } = useLoading();
  const [editInputData, setEditInputData] = useState<InputDataType & { collectionId: string }>();

  const isShare = useMemo(() => router.pathname === '/chat/share', [router.pathname]);

  /**
   * click edit, get new DataItem
   */
  const onclickEdit = useCallback(
    async (item: InputDataType) => {
      if (!item.id) return;
      try {
        setIsLoading(true);
        const data = await getDatasetDataItemById(item.id);

        if (!data) {
          throw new Error('该数据已被删除');
        }

        setEditInputData(data);
      } catch (err) {
        toast({
          status: 'warning',
          title: getErrText(err)
        });
      }
      setIsLoading(false);
    },
    [setIsLoading, toast]
  );

  return (
    <>
      <MyModal
        isOpen={true}
        onClose={onClose}
        h={['90vh', '80vh']}
        isCentered
        minW={['90vw', '600px']}
        iconSrc="/imgs/modal/quote.svg"
        title={
          <Box>
            知识库引用({rawSearch.length}条)
            <Box fontSize={'10px'} color={'myGray.500'} fontWeight={'normal'}>
              注意: 修改知识库内容成功后，此处不会显示变更情况。点击编辑后，会显示知识库最新的内容。
            </Box>
          </Box>
        }
      >
        <ModalBody whiteSpace={'pre-wrap'} textAlign={'justify'} wordBreak={'break-all'}>
          {rawSearch.map((item, i) => (
            <Box
              key={i}
              flex={'1 0 0'}
              p={2}
              borderRadius={'lg'}
              border={theme.borders.base}
              _notLast={{ mb: 2 }}
              position={'relative'}
              overflow={'hidden'}
              _hover={{ '& .hover-data': { display: 'flex' } }}
              bg={i % 2 === 0 ? 'white' : 'myWhite.500'}
            >
              <Flex alignItems={'flex-end'} mb={3} fontSize={'sm'}>
                <RawSourceText
                  fontWeight={'bold'}
                  color={'black'}
                  sourceName={item.sourceName}
                  sourceId={item.sourceId}
                  canView={!isShare}
                />
                <Box flex={1} />
                {!isShare && (
                  <Link
                    as={NextLink}
                    className="hover-data"
                    display={'none'}
                    alignItems={'center'}
                    color={'myBlue.600'}
                    href={`/dataset/detail?datasetId=${item.datasetId}&currentTab=dataCard&collectionId=${item.collectionId}`}
                  >
                    {t('core.dataset.Go Dataset')}
                    <MyIcon name={'common/rightArrowLight'} w={'10px'} />
                  </Link>
                )}
              </Flex>

              <Box color={'black'}>{item.q}</Box>
              <Box color={'myGray.600'}>{item.a}</Box>
              {!isShare && (
                <Flex alignItems={'center'} fontSize={'sm'} mt={3} gap={4} color={'myGray.500'}>
                  {isPc && (
                    <MyTooltip label={t('core.dataset.data.id')}>
                      <Flex border={theme.borders.base} px={3} borderRadius={'md'}>
                        # {item.id}
                      </Flex>
                    </MyTooltip>
                  )}
                  <MyTooltip label={t('core.dataset.Quote Length')}>
                    <Flex alignItems={'center'}>
                      <MyIcon name="common/text/t" w={'14px'} mr={1} color={'myGray.500'} />
                      {item.q.length + (item.a?.length || 0)}
                    </Flex>
                  </MyTooltip>
                  {!isShare && item.score && (
                    <MyTooltip label={t('core.dataset.Similarity')}>
                      <Flex alignItems={'center'}>
                        <MyIcon name={'kbTest'} w={'12px'} />
                        <Progress
                          mx={2}
                          w={['60px', '90px']}
                          value={item.score * 100}
                          size="sm"
                          borderRadius={'20px'}
                          colorScheme="myGray"
                          border={theme.borders.base}
                        />
                        <Box>{item.score.toFixed(4)}</Box>
                      </Flex>
                    </MyTooltip>
                  )}
                  <Box flex={1} />
                  {item.id && (
                    <MyTooltip label={t('core.dataset.data.Edit')}>
                      <Box
                        bg={'rgba(255,255,255,0.9)'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        boxShadow={'-10px 0 10px rgba(255,255,255,1)'}
                      >
                        <MyIcon
                          name={'edit'}
                          w={['16px', '18px']}
                          h={['16px', '18px']}
                          cursor={'pointer'}
                          color={'myGray.600'}
                          _hover={{
                            color: 'myBlue.700'
                          }}
                          onClick={() => onclickEdit(item)}
                        />
                      </Box>
                    </MyTooltip>
                  )}
                </Flex>
              )}
            </Box>
          ))}
        </ModalBody>
        <Loading fixed={false} />
      </MyModal>
      {editInputData && editInputData.id && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => {
            console.log('更新引用成功');
          }}
          onDelete={() => {
            console.log('删除引用成功');
          }}
          defaultValue={editInputData}
          collectionId={editInputData.collectionId}
        />
      )}
    </>
  );
};

export default QuoteModal;
