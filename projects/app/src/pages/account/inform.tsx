import React from 'react';
import { Box, Button, Flex, useTheme } from '@chakra-ui/react';
import { getInforms, readInform } from '@/web/support/user/inform/api';
import type { UserInformSchema } from '@fastgpt/global/support/user/inform/type';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AccountContainer, { TabEnum } from './components/AccountContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';

const InformTable = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { Loading } = useLoading();

  const {
    data: informs,
    isLoading,
    total,
    pageSize,
    Pagination,
    getData,
    pageNum
  } = usePagination<UserInformSchema>({
    api: getInforms,
    pageSize: 20
  });

  return (
    <AccountContainer>
      <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
        <Box px={[3, 8]} position={'relative'} flex={'1 0 0'} h={0} overflowY={'auto'}>
          {informs.map((item) => (
            <Box
              key={item._id}
              border={theme.borders.md}
              py={2}
              px={4}
              borderRadius={'md'}
              position={'relative'}
              _notLast={{ mb: 3 }}
            >
              <Flex alignItems={'center'}>
                <Box fontWeight={'bold'}>{item.title}</Box>
                <Box ml={2} color={'myGray.500'} flex={'1 0 0'}>
                  ({t(formatTimeToChatTime(item.time) as any).replace('#', ':')})
                </Box>
                {!item.read && (
                  <Button
                    variant={'whitePrimary'}
                    size={'xs'}
                    onClick={async () => {
                      if (!item.read) {
                        await readInform(item._id);
                        getData(pageNum);
                      }
                    }}
                  >
                    {t('account_inform:read')}
                  </Button>
                )}
              </Flex>
              <Box mt={2} fontSize={'sm'} color={'myGray.600'} whiteSpace={'pre-wrap'}>
                {item.content}
              </Box>
              {!item.read && (
                <>
                  <Box
                    w={'5px'}
                    h={'5px'}
                    borderRadius={'10px'}
                    bg={'red.600'}
                    position={'absolute'}
                    top={'8px'}
                    left={'8px'}
                  />
                </>
              )}
            </Box>
          ))}
          {!isLoading && informs.length === 0 && (
            <EmptyTip text={t('account_inform:no_notifications')}></EmptyTip>
          )}
        </Box>

        {total > pageSize && (
          <Flex w={'100%'} mt={4} px={[3, 8]} justifyContent={'flex-end'}>
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
