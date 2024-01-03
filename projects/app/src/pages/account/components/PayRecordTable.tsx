import React, { useState, useCallback } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box
} from '@chakra-ui/react';
import { getPayOrders, checkPayResult } from '@/web/support/wallet/pay/api';
import type { PaySchema } from '@fastgpt/global/support/wallet/pay/type.d';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import { useToast } from '@/web/common/hooks/useToast';
import { useLoading } from '@/web/common/hooks/useLoading';
import MyIcon from '@fastgpt/web/components/common/Icon';

const PayRecordTable = () => {
  const { Loading, setIsLoading } = useLoading();
  const [payOrders, setPayOrders] = useState<PaySchema[]>([]);
  const { toast } = useToast();

  const { isInitialLoading, refetch } = useQuery(['initPayOrder'], getPayOrders, {
    onSuccess(res) {
      setPayOrders(res);
    }
  });

  const handleRefreshPayOrder = useCallback(
    async (payId: string) => {
      setIsLoading(true);

      try {
        const data = await checkPayResult(payId);
        toast({
          title: data,
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error?.message,
          status: 'warning'
        });
        console.log(error);
      }
      try {
        refetch();
      } catch (error) {}

      setIsLoading(false);
    },
    [refetch, setIsLoading, toast]
  );

  return (
    <Box position={'relative'} h={'100%'} overflow={'overlay'}>
      {!isInitialLoading && payOrders.length === 0 ? (
        <Flex h={'100%'} flexDirection={'column'} alignItems={'center'} justifyContent={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            无支付记录~
          </Box>
        </Flex>
      ) : (
        <TableContainer py={[0, 5]} px={[3, 8]}>
          <Table>
            <Thead>
              <Tr>
                <Th>订单号</Th>
                <Th>时间</Th>
                <Th>金额</Th>
                <Th>状态</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {payOrders.map((item) => (
                <Tr key={item._id}>
                  <Td>{item.orderId}</Td>
                  <Td>
                    {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Td>
                  <Td>{formatStorePrice2Read(item.price)}元</Td>
                  <Td>{item.status}</Td>
                  <Td>
                    {item.status === 'NOTPAY' && (
                      <Button onClick={() => handleRefreshPayOrder(item._id)} size={'sm'}>
                        更新
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
      <Loading loading={isInitialLoading} fixed={false} />
    </Box>
  );
};

export default PayRecordTable;
