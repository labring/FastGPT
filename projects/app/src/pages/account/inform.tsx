'use client';
import React, { useState } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { getInforms, readInform } from '@/web/support/user/inform/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import Markdown from '@/components/Markdown';
import NotificationDetailsModal from '@/pageComponents/account/NotificationDetailsModal';

const InformTable = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { Loading } = useLoading();
  const [selectedInform, setSelectedInform] = useState<any>(null);

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
    defaultPageSize: 20
  });

  return (
    <AccountContainer>
      <Flex flexDirection="column" py={[0, 5]} h="100%" position="relative">
        <Box
          px={[3, 8]}
          position="relative"
          flex="1 0 0"
          h={0}
          overflowY="auto"
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
              maxH="168px"
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
              <Flex alignItems="center">
                <Box {...textStyles.title}>
                  {item.teamId ? `【${item.teamName}】` : ''}
                  {item.title}
                </Box>
                <Flex ml={3} flex={1} alignItems="center">
                  <Box {...textStyles.time}>
                    {t(formatTimeToChatTime(item.time) as any).replace('#', ':')}
                  </Box>
                  {!item.read && <Box w={2} h={2} borderRadius="full" bg="red.600" ml={3} />}
                </Flex>

                <MyTag
                  colorSchema={item.teamId ? 'green' : 'blue'}
                  mr={2}
                  fontSize="xs"
                  fontWeight="medium"
                  showDot={false}
                  type="fill"
                >
                  {item.teamId ? t('account_inform:team') : t('account_inform:system')}
                </MyTag>
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

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account_inform', 'account']))
    }
  };
}

export default InformTable;
