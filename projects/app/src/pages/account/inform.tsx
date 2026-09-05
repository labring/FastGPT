'use client';
import React, { useRef, useState } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { getInforms, readInform } from '@/web/support/user/inform/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import Markdown from '@/components/Markdown';
import NotificationDetailsModal from '@/pageComponents/account/NotificationDetailsModal';
import {
  accountContentScrollStyles,
  accountPageRootStyles,
  accountTitleTextStyles
} from '@/pageComponents/account/styles';

const InformTable = () => {
  const { t } = useClientTranslation(['account_inform', 'account']);
  const theme = useTheme();
  const { Loading } = useLoading();
  const [selectedInform, setSelectedInform] = useState<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const textStyles = {
    title: {
      color: '#111824',
      fontSize: 'md',
      fontWeight: 'bold',
      lineHeight: 6,
      letterSpacing: '0.15px'
    },
    time: {
      color: '#667085',
      fontSize: 'sm',
      lineHeight: 5,
      letterSpacing: '0.25px'
    }
  };

  const {
    data: informs,
    isLoading,
    total,
    pageSize,
    Pagination,
    getData,
    pageNum
  } = usePagination(getInforms, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'account-inform-notifications',
    scrollContainerRef
  });

  return (
    <AccountContainer>
      <Flex
        {...accountPageRootStyles}
        minH={['100%', 0]}
        flexDirection="column"
        position="relative"
        pb={[0, 6]}
      >
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={[3, 6]}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('account:notifications')}
          </Box>
        </Flex>
        <Box
          ref={scrollContainerRef}
          px={[3, 6]}
          pt={[4, 6]}
          position="relative"
          {...accountContentScrollStyles}
          display="flex"
          flexDirection="column"
          alignItems="center"
        >
          {informs.map((item) => (
            <Box
              key={item._id}
              border={theme.borders.md}
              py={5}
              px={6}
              maxH={['none', '168px']}
              maxW="800px"
              minW="200px"
              width="100%"
              borderRadius="md"
              position="relative"
              _notLast={{ mb: 4 }}
              _hover={{
                border: '1px solid #94B5FF',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (!item.read) {
                  readInform(item._id).then(() => getData(pageNum));
                }
                setSelectedInform(item);
              }}
            >
              <Flex alignItems={['stretch', 'center']} flexDirection={['column', 'row']}>
                <Box {...textStyles.title}>
                  {item.teamId ? `【${item.teamName}】` : ''}
                  {item.title}
                </Box>
                <Flex mt={[1, 0]} ml={[0, 3]} flex={1} alignItems="center">
                  <Box {...textStyles.time}>{t(formatTimeToChatTime(item.time))}</Box>
                  {!item.read && <Box w={2} h={2} borderRadius="full" bg="red.600" ml={3} />}

                  <MyTag
                    colorSchema={item.teamId ? 'green' : 'blue'}
                    ml="auto"
                    mr={2}
                    fontSize="xs"
                    fontWeight="medium"
                    showDot={false}
                    type="fill"
                  >
                    {item.teamId ? t('account_inform:team') : t('account_inform:system')}
                  </MyTag>
                </Flex>
              </Flex>

              <Box
                mt={2}
                fontSize="sm"
                fontWeight={400}
                color="#485264"
                overflow="hidden"
                maxHeight={24}
                sx={{
                  lineHeight: '16px',
                  '& h1, & h2, & h3, & h4, & h5, & h6': {
                    my: '0 !important',
                    py: 0.5,
                    display: 'block',
                    lineHeight: 'normal'
                  },
                  '& p': {
                    my: 0
                  },
                  '& ol, & ul': {
                    paddingInlineStart: '1.25em'
                  }
                }}
                noOfLines={6}
              >
                <Markdown source={item.content} />
              </Box>
            </Box>
          ))}

          {!isLoading && informs.length === 0 && (
            <EmptyTip text={t('account_inform:no_notifications')} />
          )}
        </Box>

        {selectedInform && (
          <NotificationDetailsModal
            inform={selectedInform}
            onClose={() => setSelectedInform(null)}
          />
        )}

        {total > pageSize && (
          <Flex mt={4} justifyContent="center">
            <Pagination />
          </Flex>
        )}
        <Loading loading={isLoading && informs.length === 0} fixed={false} />
      </Flex>
    </AccountContainer>
  );
};

export default InformTable;
