'use client';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useRef, useState } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import type { BillItemType } from '@fastgpt/global/openapi/admin/wallet/pay/api';
import dayjs from 'dayjs';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/usage/tools';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  BillPayWayEnum,
  BillStatusEnum,
  BillTypeEnum
} from '@fastgpt/global/support/wallet/bill/constants';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MyTag from '@fastgpt/web/components/common/Tag';
import SingleSelectFilter from '@fastgpt/web/components/common/TagFilter/SingleSelectFilter';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getPays } from '@/web/admin/wallet/pay/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const BillTable = () => {
  const { t } = useClientTranslation('admin');
  const [username, setUsername] = useState<string>();
  const [billType, setBillType] = useState<BillTypeEnum | ''>('');
  const [billStatus, setBillStatus] = useState<BillStatusEnum | ''>(BillStatusEnum.SUCCESS);
  const [billDetail, setBillDetail] = useState<BillItemType>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const billTypeList: { label: string; value: BillTypeEnum | '' }[] = [
    { label: t('admin:all'), value: '' },
    { label: t('admin:balance_top_up'), value: BillTypeEnum.balance },
    { label: t('admin:plan_subscription'), value: BillTypeEnum.standSubPlan },
    { label: t('admin:dataset_storage_expansion'), value: BillTypeEnum.extraDatasetSub },
    { label: t('admin:ai_points_package'), value: BillTypeEnum.extraPoints },
    { label: t('admin:campaign_bonus'), value: BillTypeEnum.activityGift }
  ];

  const billStatusList: { label: string; value: BillStatusEnum | '' }[] = [
    { label: t('admin:all'), value: '' },
    { label: t('admin:success'), value: BillStatusEnum.SUCCESS },
    { label: t('admin:refunded'), value: BillStatusEnum.REFUND },
    { label: t('admin:unpaid'), value: BillStatusEnum.NOTPAY },
    { label: t('admin:closed'), value: BillStatusEnum.CLOSED }
  ];

  const billStatusTagMap = {
    [BillStatusEnum.SUCCESS]: { label: t('admin:success'), colorSchema: 'green' },
    [BillStatusEnum.REFUND]: { label: t('admin:refunded'), colorSchema: 'red' },
    [BillStatusEnum.NOTPAY]: { label: t('admin:unpaid'), colorSchema: 'yellow' },
    [BillStatusEnum.CLOSED]: { label: t('admin:closed'), colorSchema: 'gray' }
  } as const;

  const billTypeMap = {
    [BillTypeEnum.balance]: {
      label: t('admin:balance_top_up')
    },
    [BillTypeEnum.standSubPlan]: {
      label: t('admin:plan_subscription')
    },
    [BillTypeEnum.extraDatasetSub]: {
      label: t('admin:dataset_storage_expansion')
    },
    [BillTypeEnum.extraPoints]: {
      label: t('admin:ai_points_package')
    },
    [BillTypeEnum.activityGift]: {
      label: t('admin:campaign_bonus')
    }
  };

  const {
    data: bills,
    isLoading,
    Pagination,
    total,
    pageSize
  } = usePagination(getPays, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-pays-list',
    params: {
      type: billType === '' ? undefined : billType,
      status: billStatus === '' ? undefined : billStatus,
      username: username ?? ''
    },
    refreshDeps: [billType, billStatus, username],
    scrollContainerRef
  });

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        gap={2}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          {t('admin:payment_records')}
        </Box>
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder={t('admin:search_by_username')}
            onChange={(e) => setUsername(e.target.value)}
            h={'36px'}
          ></Input>
        </InputGroup>
        <SingleSelectFilter<BillTypeEnum | ''>
          storageKey={'admin.pays.type'}
          title={'套餐类型'}
          options={billTypeList}
          value={billType}
          onChange={setBillType}
          maxW={'220px'}
        />
        <SingleSelectFilter<BillStatusEnum | ''>
          storageKey={'admin.pays.status'}
          title={'状态'}
          options={billStatusList}
          value={billStatus}
          onChange={setBillStatus}
        />
      </Flex>

      <FixedTableContainer
        ref={scrollContainerRef}
        position={'relative'}
        flex={1}
        maxH={'none'}
        px={[4, 6]}
        py={6}
        footer={
          total > pageSize ? (
            <Flex mt={3} justifyContent={'center'}>
              <Pagination />
            </Flex>
          ) : undefined
        }
      >
        <Table>
          <Thead>
            <Tr>
              <Th>{t('admin:time')}</Th>
              <Th>{t('admin:team_id_2')}</Th>
              <Th>{t('admin:plan_type')}</Th>
              <Th>{t('admin:amount')}</Th>
              <Th>{t('admin:status')}</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {bills.map((item) => (
              <Tr key={item._id}>
                <Td>
                  {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                </Td>
                <Td>{item.teamId}</Td>
                <Td>{billTypeMap[item.type]?.label}</Td>
                <Td>{formatStorePrice2Read(item.price)}元</Td>
                <Td>
                  {billStatusTagMap[item.status] ? (
                    <MyTag colorSchema={billStatusTagMap[item.status].colorSchema} type={'fill'}>
                      {billStatusTagMap[item.status].label}
                    </MyTag>
                  ) : (
                    item.status
                  )}
                </Td>
                <Td>
                  <Button variant={'whiteBase'} size={'sm'} onClick={() => setBillDetail(item)}>
                    {t('admin:details')}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!isLoading && bills.length === 0 && (
          <Flex
            mt={'20vh'}
            flexDirection={'column'}
            alignItems={'center'}
            justifyContent={'center'}
          >
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              {t('admin:no_bills')}
            </Box>
          </Flex>
        )}
      </FixedTableContainer>

      {!!billDetail && (
        <BillDetailModal bill={billDetail} onClose={() => setBillDetail(undefined)} />
      )}
    </BoxPageRoot>
  );
};

export default BillTable;

function BillDetailModal({ bill, onClose }: { bill: BillItemType; onClose: () => void }) {
  const { t } = useClientTranslation('admin');
  const billPayWayMap = {
    [BillPayWayEnum.wx]: {
      label: t('admin:wechat_short')
    },
    [BillPayWayEnum.balance]: {
      label: t('admin:balance')
    },
    [BillPayWayEnum.alipay]: {
      label: t('admin:alipay_short')
    },
    [BillPayWayEnum.bank]: {
      label: t('admin:bank_transfer_short')
    },
    [BillPayWayEnum.coupon]: {
      label: t('admin:redemption_code')
    },
    [BillPayWayEnum.enterpriseAuth]: {
      label: t('admin:enterprise_verification_bonus')
    },
    [BillPayWayEnum.wecom]: {
      label: t('admin:wecom_short')
    }
  };
  const subModeMap = {
    [SubModeEnum.month]: {
      label: t('admin:monthly')
    },
    [SubModeEnum.year]: {
      label: t('admin:yearly')
    }
  };

  const standardSubLevelMap = {
    [StandardSubLevelEnum.free]: {
      label: t('admin:free_short')
    },
    [StandardSubLevelEnum.custom]: {
      label: t('admin:custom_short')
    },
    [StandardSubLevelEnum.basic]: {
      label: t('admin:basic_short')
    },
    [StandardSubLevelEnum.advanced]: {
      label: t('admin:advanced_short')
    },

    // deprecated
    [StandardSubLevelEnum.experience]: {
      label: t('admin:experience_short')
    },
    [StandardSubLevelEnum.team]: {
      label: t('admin:team')
    },
    [StandardSubLevelEnum.enterprise]: {
      label: t('admin:enterprise_short')
    }
  };
  const billTypeMap = {
    [BillTypeEnum.balance]: {
      label: t('admin:balance_top_up')
    },
    [BillTypeEnum.standSubPlan]: {
      label: t('admin:plan_subscription')
    },
    [BillTypeEnum.extraDatasetSub]: {
      label: t('admin:dataset_storage_expansion')
    },
    [BillTypeEnum.extraPoints]: {
      label: t('admin:ai_points_package')
    },
    [BillTypeEnum.activityGift]: {
      label: t('admin:campaign_bonus')
    }
  };

  return (
    <MyModal isOpen={true} onClose={onClose} title={'订单详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:order_no')}</Box>
        <Box>{bill.orderId}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:generated_at')}</Box>
        <Box>{dayjs(bill.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:top_up_member')}</Box>
        <Box>{bill.username || '-'}</Box>
      </Flex>
      {!!bill.metadata?.payWay && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:payment_method')}</Box>
          <Box>{billPayWayMap[bill.metadata.payWay]?.label}</Box>
        </Flex>
      )}
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:amount_2')}</Box>
        <Box>{formatStorePrice2Read(bill.price)}元</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:order_type')}</Box>
        <Box>{billTypeMap[bill.type]?.label}</Box>
      </Flex>
      {!!bill.metadata?.subMode && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:billing_cycle')}</Box>
          <Box>{subModeMap[bill.metadata.subMode]?.label}</Box>
        </Flex>
      )}
      {!!bill.metadata?.standSubLevel && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:subscription_plan')}</Box>
          <Box>{standardSubLevelMap[bill.metadata.standSubLevel]?.label}</Box>
        </Flex>
      )}
      {bill.metadata?.month !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:months')}</Box>
          <Box>{bill.metadata?.month}</Box>
        </Flex>
      )}
      {bill.metadata?.datasetSize !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:extra_dataset_storage_2')}</Box>
          <Box>{bill.metadata?.datasetSize}</Box>
        </Flex>
      )}
      {bill.metadata?.extraPoints !== undefined && (
        <Flex alignItems={'center'} pb={4}>
          <Box flex={'0 0 120px'}>{t('admin:extra_ai_points')}</Box>
          <Box>{bill.metadata.extraPoints}</Box>
        </Flex>
      )}
    </MyModal>
  );
}
