import React, { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  Box,
  Button,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useColorModeValue,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useLoading } from '@/hooks/useLoading';
import dayjs from 'dayjs';
import { useCopyData } from '@/utils/tools';
import { useUserStore } from '@/store/user';
import MyIcon from '@/components/Icon';
import { getPromotionRecords } from '@/api/user';
import { usePagination } from '@/hooks/usePagination';
import { PromotionRecordType } from '@/api/response/user';
import { PromotionTypeMap } from '@/constants/user';
import { getPromotionInitData } from '@/api/user';
import Image from 'next/image';

const OpenApi = () => {
  const { Loading } = useLoading();
  const { userInfo, initUserInfo } = useUserStore();
  const { copyData } = useCopyData();
  const {
    isOpen: isOpenWithdraw,
    onClose: onCloseWithdraw,
    onOpen: onOpenWithdraw
  } = useDisclosure();

  useQuery(['init'], initUserInfo);
  const { data: { invitedAmount = 0, historyAmount = 0, residueAmount = 0 } = {} } = useQuery(
    ['getPromotionInitData'],
    getPromotionInitData
  );

  const {
    data: promotionRecords,
    isLoading,
    Pagination,
    total
  } = usePagination<PromotionRecordType>({
    api: getPromotionRecords
  });

  return (
    <Box py={[5, 10]} px={'5vw'}>
      <Card px={6} py={4} position={'relative'}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          我的邀请
        </Box>
        <Box my={2} color={'blackAlpha.600'} fontSize={'sm'}>
          你可以通过邀请链接邀请好友注册 FastGpt 账号。好友在 FastGpt
          平台的每次充值，你都会获得一定比例的佣金。
        </Box>
        <Flex my={2} alignItems={'center'}>
          <Box>当前剩余佣金: ￥</Box>
          <Box mx={2} fontSize={'xl'} lineHeight={1} fontWeight={'bold'}>
            {residueAmount}
          </Box>
        </Flex>
        <Flex>
          <Button
            mr={4}
            variant={'outline'}
            onClick={() => {
              copyData(`${location.origin}/?inviterId=${userInfo?._id}`, '已复制邀请链接');
            }}
          >
            复制邀请链接
          </Button>
          <Button
            leftIcon={<MyIcon name="withdraw" w={'22px'} />}
            px={4}
            title={residueAmount < 50 ? '最低提现额度为50元' : ''}
            isDisabled={residueAmount < 50}
            onClick={onOpenWithdraw}
          >
            提现
          </Button>
        </Flex>
      </Card>
      <Card mt={4} px={6} py={4} position={'relative'}>
        <Flex alignItems={'center'} mb={3} justifyContent={['space-between', 'flex-start']}>
          <Box w={'120px'}>佣金比例</Box>
          <Box fontWeight={'bold'}>{userInfo?.promotion.rate || 15}%</Box>
        </Flex>
        <Flex alignItems={'center'} mb={3} justifyContent={['space-between', 'flex-start']}>
          <Box w={'120px'}>已注册用户数</Box>
          <Box fontWeight={'bold'}>{invitedAmount}人</Box>
        </Flex>
        <Flex alignItems={'center'} justifyContent={['space-between', 'flex-start']}>
          <Box w={'120px'}>累计佣金</Box>
          <Box fontWeight={'bold'}>￥ {historyAmount}</Box>
        </Flex>
      </Card>
      <Card mt={4} px={6} py={4} position={'relative'}>
        <Box fontSize={'xl'} fontWeight={'bold'}>
          佣金记录 ({total})
        </Box>
        <TableContainer position={'relative'}>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>类型</Th>
                <Th>金额</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {promotionRecords.map((item) => (
                <Tr key={item._id}>
                  <Td>
                    {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Td>
                  <Td>{PromotionTypeMap[item.type]}</Td>
                  <Td>{item.amount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <Loading loading={isLoading} fixed={false} />
        </TableContainer>
        <Flex mt={4} px={4} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      </Card>
      <Modal isOpen={isOpenWithdraw} onClose={onCloseWithdraw}>
        <ModalOverlay />
        <ModalContent color={useColorModeValue('blackAlpha.700', 'white')}>
          <ModalHeader>提现联系</ModalHeader>
          <ModalCloseButton />
          <ModalBody textAlign={'center'}>
            <Image
              style={{ margin: 'auto' }}
              src={'/imgs/wx300-2.jpg'}
              width={200}
              height={200}
              alt=""
            />
            <Box mt={2}>
              微信号:
              <Box as={'span'} userSelect={'all'}>
                YNyiqi
              </Box>
            </Box>
            <Box>发送你的邀请链接和需要提现的金额</Box>
          </ModalBody>

          <ModalFooter>
            <Button variant={'outline'} onClick={onCloseWithdraw}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default OpenApi;
