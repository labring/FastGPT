import Markdown from '@/components/Markdown';
import { Box, Flex } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { Dispatch, MutableRefObject, SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import InputDataModal from '@/pageComponents/dataset/detail/InputDataModal';

const CollectionQuoteItem = ({
  quoteRefs,
  quoteIndex,
  setQuoteIndex,
  refreshList,
  canEdit,

  updated,
  isCurrentSelected,
  q,
  a,
  dataId,
  collectionId
}: {
  quoteRefs: MutableRefObject<Map<string, HTMLDivElement | null>>;
  quoteIndex: number;
  setQuoteIndex: Dispatch<SetStateAction<number>>;
  refreshList: () => void;
  canEdit: boolean;

  updated?: boolean;
  isCurrentSelected: boolean;
  q: string;
  a?: string;
  dataId: string;
  collectionId: string;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const hasBeenSearched = quoteIndex !== undefined && quoteIndex > -1;
  const [editInputData, setEditInputData] = useState<{ dataId: string; collectionId: string }>();

  return (
    <>
      <Box
        ref={(el: HTMLDivElement | null) => {
          quoteRefs.current.set(dataId, el);
        }}
        p={2}
        py={2}
        cursor={hasBeenSearched ? 'pointer' : 'default'}
        bg={isCurrentSelected ? '#FFF9E7' : hasBeenSearched ? '#FFFCF2' : ''}
        position={'relative'}
        overflow={'hidden'}
        border={'1px solid '}
        borderColor={isCurrentSelected ? 'yellow.200' : 'transparent'}
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
        {updated && (
          <Flex mt={2}>
            <Box
              bg={'green.50'}
              border={'1px solid'}
              borderRadius={'xs'}
              borderColor={'green.100'}
              px={1}
              color={'green.600'}
            >
              {t('common:core.dataset.data.Updated')}
            </Box>
            <Box flex={1} borderBottom={'1px dashed'} borderColor={'green.200'} />
          </Flex>
        )}
        <Markdown source={q} />
        {!!a && (
          <Box>
            <Markdown source={a} />
          </Box>
        )}
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
              {q.length + (a?.length || 0)}
            </Flex>
          </MyTooltip>
          {canEdit && (
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
                    dataId,
                    collectionId
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
              onClick={() => copyData(`${q}${a ? '\n' + a : ''}`)}
            >
              <MyIcon name="copy" w={'14px'} color={'myGray.500'} />
            </Flex>
          </MyTooltip>
        </Flex>
      </Box>
      {editInputData && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={refreshList}
          dataId={editInputData.dataId}
          collectionId={editInputData.collectionId}
        />
      )}
    </>
  );
};

export default CollectionQuoteItem;
