import React from 'react';
import {
  Grid,
  Box,
  Flex,
  BoxProps,
  useTheme,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { getPromotionInitData, getPromotionRecords } from '@/web/support/activity/promotion/api';
import { useUserStore } from '@/web/support/user/useUserStore';

import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import type { PromotionRecordType } from '@/global/support/api/userRes.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dayjs from 'dayjs';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const Promotion = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { userInfo } = useUserStore();
  const { Loading } = useLoading();

  const {
    data: promotionRecords,
    isLoading,
    total,
    pageSize,
    Pagination
  } = usePagination<PromotionRecordType>({
    api: getPromotionRecords,
    pageSize: 20
  });

  const { data: { invitedAmount = 0, earningsAmount = 0 } = {} } = useQuery(
    ['getPromotionInitData'],
    getPromotionInitData
  );

  const statisticsStyles: BoxProps = {
    p: [4, 5],
    border: theme.borders.base,
    textAlign: 'center',
    fontSize: ['md', 'lg'],
    borderRadius: 'md'
  };
  const titleStyles: BoxProps = {
    mt: 2,
    fontSize: ['lg', '28px'],
    fontWeight: 'bold'
  };

  return (
    <Flex flexDirection={'column'} py={[0, 5]} px={5} h={'100%'} position={'relative'}>
      <Grid gridTemplateColumns={['1fr 1fr', 'repeat(2,1fr)', 'repeat(4,1fr)']} gridGap={5}>
        <Box {...statisticsStyles}>
          <Box>{t('user.Amount of inviter')}</Box>
          <Box {...titleStyles}>{invitedAmount}</Box>
        </Box>
        <Box {...statisticsStyles}>
          <Box>{t('user.Amount of earnings')}</Box>
          <Box {...titleStyles}>{earningsAmount}</Box>
        </Box>
        <Box {...statisticsStyles}>
          <Flex alignItems={'center'} justifyContent={'center'}>
            <Box>{t('user.Promotion Rate')}</Box>
            <QuestionTip ml={1} label={t('user.Promotion rate tip')}></QuestionTip>
          </Flex>
          <Box {...titleStyles}>{userInfo?.promotionRate || 15}%</Box>
        </Box>
        <Box {...statisticsStyles}>
          <Flex alignItems={'center'} justifyContent={'center'}>
            <Box>{t('user.Invite Url')}</Box>
            <QuestionTip ml={1} label={t('user.Invite url tip')}></QuestionTip>
          </Flex>
          <Button
            mt={4}
            variant={'whitePrimary'}
            fontSize={'sm'}
            onClick={() => {
              copyData(`${location.origin}/?hiId=${userInfo?._id}`);
            }}
          >
            {t('user.Copy invite url')}
          </Button>
        </Box>
      </Grid>
      <Box mt={5}>
        <TableContainer position={'relative'} overflow={'hidden'} minH={'100px'}>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>类型</Th>
                <Th>金额(￥)</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {promotionRecords.map((item) => (
                <Tr key={item._id}>
                  <Td>
                    {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Td>
                  <Td>{t(`user.promotion.${item.type}`)}</Td>
                  <Td>{item.amount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>

        {!isLoading && promotionRecords.length === 0 && <EmptyTip text="无邀请记录~"></EmptyTip>}
        {total > pageSize && (
          <Flex mt={4} justifyContent={'flex-end'}>
            <Pagination />
          </Flex>
        )}
        <Loading loading={isLoading} fixed={false} />
      </Box>
    </Flex>
  );
};

export default Promotion;
