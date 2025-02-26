import { ScoreItemType } from '@/components/core/dataset/QuoteItem';
import { DatasetDataListItemType } from '@/global/core/dataset/type';
import { Box, Flex } from '@chakra-ui/react';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { Dispatch, MutableRefObject, SetStateAction, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ScoreTag from './ScoreTag';
import dynamic from 'next/dynamic';

const InputDataModal = dynamic(() => import('@/pageComponents/dataset/detail/InputDataModal'));

const QuoteItem = ({
  index,
  item,
  setQuoteIndex,
  quoteRefs,
  isCurrentSelected = false,
  quoteIndex,
  score,
  icon,
  chatItemId,
  isFullTextReader,
  canEditData,
  refreshList
}: {
  index: number;
  item: DatasetDataListItemType & { sourceName?: string };
  quoteIndex?: number;
  setQuoteIndex: Dispatch<SetStateAction<number>>;
  quoteRefs?: MutableRefObject<(HTMLDivElement | null)[]>;
  isCurrentSelected?: boolean;
  score?: { primaryScore?: ScoreItemType; secondaryScore: ScoreItemType[] };
  icon?: string;
  isFullTextReader?: boolean;
  chatItemId?: string;
  canEditData?: boolean;
  refreshList: () => void;
}) => {
  const { copyData } = useCopyData();
  const { t } = useTranslation();

  const [editInputData, setEditInputData] = useState<{ dataId: string; collectionId: string }>();
  const hasBeenSearched = quoteIndex !== undefined && quoteIndex > -1;

  return (
    <>
      <Box
        ref={
          quoteRefs
            ? (el: HTMLDivElement | null) => {
                quoteRefs.current[index] = el;
              }
            : undefined
        }
        p={2}
        py={item.updatedData ? 0 : 2}
        cursor={hasBeenSearched ? 'pointer' : 'default'}
        bg={isCurrentSelected ? '#FFF9E7' : hasBeenSearched ? '#FFFCF2' : ''}
        position={'relative'}
        overflow={'hidden'}
        border={'1px solid '}
        borderColor={isCurrentSelected ? 'yellow.200' : 'transparent'}
        borderLeftColor={item.updatedData && !isCurrentSelected ? 'myGray.200' : ''}
        borderBottomColor={
          isCurrentSelected ? 'yellow.200' : isFullTextReader ? 'transparent' : 'myGray.150'
        }
        wordBreak={'break-all'}
        fontSize={'sm'}
        _hover={
          hasBeenSearched
            ? {
                '& .hover-data': { visibility: 'visible' }
              }
            : {
                bg: 'linear-gradient(180deg,  #FBFBFC 7.61%, #F0F1F6 100%)',
                borderTopColor: 'myGray.50',
                '& .hover-data': { visibility: 'visible' }
              }
        }
        onClick={(e) => {
          e.stopPropagation();

          if (hasBeenSearched) {
            setQuoteIndex(quoteIndex);
          }
        }}
      >
        {!isFullTextReader && (
          <Flex gap={2} alignItems={'center'} mb={2}>
            <Box
              alignItems={'center'}
              fontSize={'xs'}
              border={'sm'}
              borderRadius={'sm'}
              _hover={{
                '.controller': {
                  display: 'flex'
                }
              }}
              overflow={'hidden'}
              display={'inline-flex'}
              height={6}
            >
              <Flex
                color={'myGray.500'}
                bg={'myGray.150'}
                w={4}
                justifyContent={'center'}
                fontSize={'10px'}
                h={'full'}
                alignItems={'center'}
              >
                {index + 1}
              </Flex>
              <Flex px={1.5}>
                <MyIcon name={icon as any} mr={1} flexShrink={0} w={'12px'} />
                <Box
                  className="textEllipsis3"
                  wordBreak={'break-all'}
                  flex={'1 0 0'}
                  fontSize={'mini'}
                  color={'myGray.900'}
                >
                  {item.sourceName}
                </Box>
              </Flex>
            </Box>
            {score && (
              <Box className="hover-data" visibility={'hidden'}>
                <ScoreTag {...score} />
              </Box>
            )}
          </Flex>
        )}
        {item.updatedData && (
          <Flex>
            <Box
              bg={'myGray.50'}
              border={'1px solid'}
              borderRadius={'xs'}
              borderColor={'myGray.150'}
              px={1}
            >
              {t('common:core.chat.quote.beforeUpdate')}
            </Box>
            <Box flex={1} borderBottom={'1px dashed'} borderColor={'myGray.250'} />
          </Flex>
        )}
        <Markdown source={item.q} />
        {!!item.a && (
          <Box>
            <Markdown source={item.a} />
          </Box>
        )}
        {item.updatedData && (
          <Flex mt={2}>
            <Box
              bg={'green.50'}
              border={'1px solid'}
              borderRadius={'xs'}
              borderColor={'green.100'}
              px={1}
              color={'green.600'}
            >
              {t('common:core.chat.quote.afterUpdate')}
            </Box>
            <Box flex={1} borderBottom={'1px dashed'} borderColor={'green.200'} />
          </Flex>
        )}
        {!!item.updatedData?.q && <Markdown source={item.updatedData?.q} isUpdatedQuote />}
        {!!item.updatedData?.a && <Markdown source={item.updatedData?.a} isUpdatedQuote />}
        <Flex
          className="hover-data"
          position={'absolute'}
          bottom={2}
          right={5}
          gap={1.5}
          visibility={'hidden'}
        >
          <MyTooltip label={t('common:core.dataset.Quote Length')}>
            <Flex
              alignItems={'center'}
              fontSize={'10px'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              bg={'white'}
              rounded={'sm'}
              px={2}
              py={1}
              boxShadow={
                '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
              }
            >
              <MyIcon name="common/text/t" w={'14px'} mr={1} color={'myGray.500'} />
              {item.q.length + (item.a?.length || 0)}
            </Flex>
          </MyTooltip>
          {isFullTextReader && canEditData && (
            <MyTooltip label={t('common:core.dataset.data.Edit')}>
              <Flex
                alignItems={'center'}
                fontSize={'10px'}
                border={'1px solid'}
                borderColor={'myGray.200'}
                bg={'white'}
                rounded={'sm'}
                px={1}
                py={1}
                boxShadow={
                  '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                }
                cursor={'pointer'}
                onClick={() =>
                  setEditInputData({
                    dataId: item._id,
                    collectionId: item.collectionId
                  })
                }
              >
                <MyIcon name="common/edit" w={'14px'} color={'myGray.500'} />
              </Flex>
            </MyTooltip>
          )}
          <MyTooltip label={t('common:common.Copy')}>
            <Flex
              alignItems={'center'}
              fontSize={'10px'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              bg={'white'}
              rounded={'sm'}
              px={1}
              py={1}
              boxShadow={
                '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
              }
              cursor={'pointer'}
              onClick={() => {
                copyData(item.q + '\n' + item.a);
              }}
            >
              <MyIcon name="copy" w={'14px'} color={'myGray.500'} />
            </Flex>
          </MyTooltip>
        </Flex>
      </Box>
      {editInputData && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => {
            console.log('onSuccess');
            refreshList();
          }}
          dataId={editInputData.dataId}
          collectionId={editInputData.collectionId}
          chatItemId={chatItemId}
        />
      )}
    </>
  );
};

export default QuoteItem;
