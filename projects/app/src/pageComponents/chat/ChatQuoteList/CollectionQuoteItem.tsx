import Markdown from '@/components/Markdown';
import { Box, Flex } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { type MutableRefObject, useState } from 'react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import InputDataModal from '@/pageComponents/dataset/detail/components/InputDataModal';

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
  setQuoteIndex: (quoteIndex: number) => void;
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
        p={'12px'}
        cursor={hasBeenSearched ? 'pointer' : 'default'}
        bg={isCurrentSelected ? 'blue.50' : ''}
        position={'relative'}
        overflow={'hidden'}
        borderRadius={'6px'}
        border={'1px solid '}
        borderColor={isCurrentSelected ? 'primary.300' : 'transparent'}
        wordBreak={'break-all'}
        fontSize={'sm'}
        _hover={
          hasBeenSearched
            ? {
                bg: isCurrentSelected ? 'blue.50' : 'rgba(51, 112, 255, 0.08)',
                '& .hover-data': { visibility: 'visible' }
              }
            : {
                bg: 'rgba(51, 112, 255, 0.08)',
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
          bottom={'12px'}
          right={'12px'}
          gap={1.5}
          visibility={'hidden'}
        >
          <MyTooltip label={t('common:Copy')}>
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
