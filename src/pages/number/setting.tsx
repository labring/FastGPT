import React, { useCallback, useState } from 'react';
import {
  Card,
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Select,
  Input,
  IconButton,
  useDisclosure
} from '@chakra-ui/react';
import { DeleteIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { putUserInfo, getUserBills, getPayOrders, checkPayResult } from '@/api/user';
import { useToast } from '@/hooks/useToast';
import { useGlobalStore } from '@/store/global';
import { useUserStore } from '@/store/user';
import { UserType } from '@/types/user';
import { usePaging } from '@/hooks/usePaging';
import type { UserBillType } from '@/types/user';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { PaySchema } from '@/types/mongoSchema';
import dayjs from 'dayjs';
import { formatPrice } from '@/utils/user';
import WxConcat from '@/components/WxConcat';

const PayModal = dynamic(() => import('./components/PayModal'));

const NumberSetting = () => {
  const { userInfo, updateUserInfo, initUserInfo } = useUserStore();
  const { setLoading } = useGlobalStore();
  const { register, handleSubmit, control } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const [showPay, setShowPay] = useState(false);
  const { isOpen: isOpenWx, onOpen: onOpenWx, onClose: onCloseWx } = useDisclosure();
  const { toast } = useToast();
  const {
    fields: accounts,
    append: appendAccount,
    remove: removeAccount
  } = useFieldArray({
    control,
    name: 'accounts'
  });
  const { setPageNum, data: bills } = usePaging<UserBillType>({
    api: getUserBills,
    pageSize: 30
  });
  const [payOrders, setPayOrders] = useState<PaySchema[]>([]);

  const onclickSave = useCallback(
    async (data: UserUpdateParams) => {
      setLoading(true);
      try {
        await putUserInfo(data);
        updateUserInfo(data);
        toast({
          title: '更新成功',
          status: 'success'
        });
      } catch (error) {}
      setLoading(false);
    },
    [setLoading, toast, updateUserInfo]
  );

  useQuery(['init'], initUserInfo);

  useQuery(['initPayOrder'], getPayOrders, {
    onSuccess(res) {
      setPayOrders(res);
    }
  });

  const handleRefreshPayOrder = useCallback(
    async (payId: string) => {
      try {
        setLoading(true);
        await checkPayResult(payId);
        const res = await getPayOrders();
        setPayOrders(res);
      } catch (error: any) {
        toast({
          title: error?.message,
          status: 'warning'
        });
        console.log(error);
      }
      setLoading(false);
    },
    [setLoading, toast]
  );

  return (
    <>
      <Card px={6} py={4}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          账号信息
        </Box>
        <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 60px'}>邮箱:</Box>
            <Box>{userInfo?.email}</Box>
          </Flex>
        </Box>
        <Box mt={6}>
          <Flex alignItems={'center'}>
            <Box flex={'0 0 60px'}>余额:</Box>
            <Box>
              <strong>{userInfo?.balance}</strong> 元
            </Box>
            <Button size={'sm'} w={'80px'} ml={5} onClick={() => setShowPay(true)}>
              充值
            </Button>
          </Flex>
        </Box>
      </Card>
      <Card mt={6} px={6} py={4}>
        <Flex mb={5} justifyContent={'space-between'}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            关联账号
          </Box>
          <Box>
            {accounts.length === 0 && (
              <Button
                mr={5}
                variant="outline"
                onClick={() =>
                  appendAccount({
                    type: 'openai',
                    value: ''
                  })
                }
              >
                新增
              </Button>
            )}
            <Button onClick={handleSubmit(onclickSave)}>保存</Button>
          </Box>
        </Flex>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>账号类型</Th>
                <Th>值</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {accounts.map((item, i) => (
                <Tr key={item.id}>
                  <Td minW={'200px'}>
                    <Select
                      {...register(`accounts.${i}.type`, {
                        required: '类型不能为空'
                      })}
                    >
                      <option value="openai">openai</option>
                    </Select>
                  </Td>
                  <Td minW={'200px'} whiteSpace="pre-wrap" wordBreak={'break-all'}>
                    <Input
                      {...register(`accounts.${i}.value`, {
                        required: '账号不能为空'
                      })}
                    ></Input>
                  </Td>
                  <Td>
                    <IconButton
                      aria-label="删除账号"
                      icon={<DeleteIcon />}
                      colorScheme={'red'}
                      onClick={() => {
                        removeAccount(i);
                        handleSubmit(onclickSave)();
                      }}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>
      <Card mt={6} px={6} py={4}>
        <Flex alignItems={'flex-end'}>
          <Box fontSize={'xl'} fontWeight={'bold'}>
            充值记录
          </Box>
          <Button onClick={onOpenWx} size={'xs'} ml={4} variant={'outline'}>
            异常问题，wx联系
          </Button>
        </Flex>
        <TableContainer maxH={'400px'} overflowY={'auto'}>
          <Table>
            <Thead>
              <Tr>
                <Th>订单号</Th>
                <Th>时间</Th>
                <Th>金额</Th>
                <Th>消费</Th>
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
                  <Td whiteSpace="pre-wrap" wordBreak={'break-all'}>
                    {formatPrice(item.price)}元
                  </Td>
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
      </Card>
      <Card mt={6} px={6} py={4}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          使用记录(最新30条)
        </Box>
        <TableContainer maxH={'400px'} overflowY={'auto'}>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>内容长度</Th>
                <Th>消费</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {bills.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.time}</Td>
                  <Td whiteSpace="pre-wrap" wordBreak={'break-all'}>
                    {item.textLen}
                  </Td>
                  <Td>{item.price}元</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      </Card>
      {showPay && <PayModal onClose={() => setShowPay(false)} />}
      {/* wx 联系 */}
      {isOpenWx && <WxConcat onClose={onCloseWx} />}
    </>
  );
};

export default NumberSetting;
