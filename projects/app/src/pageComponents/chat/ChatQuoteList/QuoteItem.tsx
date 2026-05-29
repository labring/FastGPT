import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';

const QuoteItem = ({
  icon,
  sourceName,
  onClick,
  q,
  a
}: {
  icon: string;
  sourceName: string;
  onClick?: () => void;
  q: string;
  a?: string;
}) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const isDeleted = !q;

  return (
    <Box
      p={'12px'}
      position={'relative'}
      overflow={'hidden'}
      borderRadius={'6px'}
      border={'1px solid transparent'}
      wordBreak={'break-all'}
      fontSize={'12px'}
      cursor={onClick ? 'pointer' : 'default'}
      sx={{
        '.markdown': {
          fontSize: '12px'
        },
        '.markdown *': {
          fontSize: '12px'
        }
      }}
      _hover={{
        bg: 'rgba(17, 24, 36, 0.05)',
        '& .hover-data': { visibility: 'visible' }
      }}
      onClick={onClick}
    >
      <Flex gap={2} alignItems={'center'} mb={'8px'}>
        <Box alignItems={'center'} fontSize={'10px'} fontWeight={500} display={'inline-flex'}>
          <Flex>
            <MyIcon name={icon as any} mr={1} flexShrink={0} w={'12px'} />
            <Box
              className={'textEllipsis'}
              wordBreak={'break-all'}
              flex={'1 0 0'}
              color={'myGray.900'}
            >
              {sourceName}
            </Box>
          </Flex>
        </Box>
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
            onClick={(e) => {
              e.stopPropagation();
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
