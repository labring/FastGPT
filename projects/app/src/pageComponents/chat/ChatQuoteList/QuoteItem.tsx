import { ScoreItemType } from '@/components/core/dataset/QuoteItem';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import ScoreTag from './ScoreTag';
import Markdown from '@/components/Markdown';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';

const QuoteItem = ({
  index,
  icon,
  sourceName,
  score,
  q,
  a
}: {
  index: number;
  icon: string;
  sourceName: string;
  score: { primaryScore?: ScoreItemType; secondaryScore: ScoreItemType[] };
  q: string;
  a?: string;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const isDeleted = !q;

  return (
    <Box
      p={2}
      position={'relative'}
      overflow={'hidden'}
      border={'1px solid transparent'}
      borderBottomColor={'myGray.150'}
      wordBreak={'break-all'}
      fontSize={'sm'}
      _hover={{
        bg: 'linear-gradient(180deg,  #FBFBFC 7.61%, #F0F1F6 100%)',
        borderTopColor: 'myGray.50',
        '& .hover-data': { visibility: 'visible' }
      }}
    >
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
              {sourceName}
            </Box>
          </Flex>
        </Box>
        {score && !isDeleted && (
          <Box className="hover-data" visibility={'hidden'}>
            <ScoreTag {...score} />
          </Box>
        )}
      </Flex>
      {!isDeleted ? (
        <>
          <Markdown source={q} />
          {!!a && (
            <Box>
              <Markdown source={a} />
            </Box>
          )}
        </>
      ) : (
        <Flex
          justifyContent={'center'}
          alignItems={'center'}
          h={'full'}
          py={2}
          bg={'#FAFAFA'}
          color={'myGray.500'}
        >
          <MyIcon name="common/info" w={'14px'} mr={1} color={'myGray.500'} />
          {t('chat:chat.quote.deleted')}
        </Flex>
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
              copyData(q + '\n' + a);
            }}
          >
            <MyIcon name="copy" w={'14px'} color={'myGray.500'} />
          </Flex>
        </MyTooltip>
      </Flex>
    </Box>
  );
};

export default QuoteItem;
