import React, { useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ImagePreviewToken from '@/components/core/dataset/ImagePreviewToken';
import {
  useSearchTestStore,
  type SearchTestStoreItemType
} from '@/web/core/dataset/store/searchTest';

const TestHistories = ({
  datasetId,
  datasetTestItem,
  onSelect,
  onClearSelect
}: {
  datasetId: string;
  datasetTestItem?: SearchTestStoreItemType;
  onSelect: (item: SearchTestStoreItemType) => void;
  onClearSelect: () => void;
}) => {
  const { t } = useTranslation();
  const { datasetTestList, delDatasetTestItemById } = useSearchTestStore();

  // The store is shared across dataset pages; show only the current dataset's test records.
  const testHistories = useMemo(
    () => datasetTestList.filter((item) => item.datasetId === datasetId),
    [datasetId, datasetTestList]
  );

  return (
    <>
      <Flex alignItems={'center'} color={'myGray.900'}>
        <Box fontSize={'md'} fontWeight={500}>
          {t('common:core.dataset.test.test history')}
        </Box>
      </Flex>
      <Box mt={3} display={'flex'} flexDirection={'column'} gap={2}>
        {testHistories.map((item) => (
          <Flex
            key={item.id}
            position={'relative'}
            py={2}
            px={3}
            alignItems={'center'}
            borderColor={'borderColor.low'}
            borderWidth={'1px'}
            borderRadius={'md'}
            _hover={{
              borderColor: 'primary.300',
              boxShadow: '1',
              '& .delete': {
                visibility: 'visible'
              },
              '& .time': {
                visibility: 'hidden'
              }
            }}
            cursor={'pointer'}
            fontSize={'sm'}
            {...(item.id === datasetTestItem?.id && {
              bg: 'primary.50'
            })}
            onClick={() => onSelect(item)}
          >
            <Box
              flex={1}
              mr={2}
              wordBreak={'break-all'}
              fontWeight={'400'}
              display={'flex'}
              alignItems={'center'}
              flexWrap={'wrap'}
              gap={1}
            >
              {!!item.text && <Box as={'span'}>{item.text}</Box>}
              <ImagePreviewToken
                images={item.queryImageRefs || []}
                datasetId={datasetId}
                containerProps={{
                  as: 'span',
                  display: 'inline-flex',
                  gap: 1
                }}
                tokenProps={{
                  px: 0,
                  py: 0,
                  border: 'none',
                  bg: 'transparent',
                  color: 'inherit'
                }}
              />
            </Box>
            <Box className="time" flex={'0 0 auto'} fontSize={'xs'} color={'myGray.500'}>
              {t(formatTimeToChatTime(item.time) as any).replace('#', ':')}
            </Box>
            <MyTooltip label={t('common:core.dataset.test.delete test history')}>
              <Box className="delete" visibility={'hidden'} w={'0.8rem'} h={'0.8rem'} ml={1}>
                <MyIcon
                  name={'delete'}
                  w={'0.8rem'}
                  _hover={{ color: 'red.600' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    delDatasetTestItemById(item.id);
                    if (datasetTestItem?.id === item.id) {
                      onClearSelect();
                    }
                  }}
                />
              </Box>
            </MyTooltip>
          </Flex>
        ))}
      </Box>
    </>
  );
};

export default React.memo(TestHistories);
