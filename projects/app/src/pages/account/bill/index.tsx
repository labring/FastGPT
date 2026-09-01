'use client';
import { Box, Button, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import ApplyInvoiceModal from '@/pageComponents/account/bill/ApplyInvoiceModal';
import { useRouter } from 'next/router';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { accountPageRootStyles, accountTitleTextStyles } from '@/pageComponents/account/styles';

export enum InvoiceTabEnum {
  bill = 'bill',
  invoice = 'invoice',
  invoiceHeader = 'invoiceHeader'
}

const BillTable = dynamic(() => import('@/pageComponents/account/bill/BillTable'));
const InvoiceHeaderForm = dynamic(() => import('@/pageComponents/account/bill/InvoiceHeaderForm'));
const InvoiceTable = dynamic(() => import('@/pageComponents/account/bill/InvoiceTable'));
const BillAndInvoice = () => {
  const { t } = useClientTranslation(['account_bill', 'account']);
  const router = useRouter();
  const { invoiceTab = InvoiceTabEnum.bill } = router.query as { invoiceTab: `${InvoiceTabEnum}` };

  const [isOpenInvoiceModal, setIsOpenInvoiceModal] = useState(false);
  const [recordsRefreshKey, setRecordsRefreshKey] = useState(0);

  return (
    <AccountContainer>
      <Flex {...accountPageRootStyles} flexDirection={'column'}>
        <Flex
          display={['none', 'flex']}
          h={'64px'}
          flexShrink={0}
          px={6}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          <Box as={'h1'} {...accountTitleTextStyles}>
            {t('account:bills_and_invoices')}
          </Box>
        </Flex>
        <Flex flex={['0 0 auto', '1 0 0']} minH={0} flexDirection={'column'} py={[2, 6]}>
          <Flex
            px={[2, 6]}
            justifyContent={'space-between'}
            alignItems={['stretch', 'center']}
            flexDirection={['column', 'row']}
            pb={'0.75rem'}
          >
            <Box w={['100%', 'auto']}>
              <FillRowTabs
                w={['100%', 'auto']}
                size={'sm'}
                scrollPositionKey={'account-bill-tabs'}
                list={[
                  { label: t('account_bill:bill_record'), value: InvoiceTabEnum.bill },
                  {
                    label: t('account_bill:support_wallet_bill_tag_invoice'),
                    value: InvoiceTabEnum.invoice
                  },
                  {
                    label: t('account_bill:default_header'),
                    value: InvoiceTabEnum.invoiceHeader
                  }
                ]}
                value={invoiceTab}
                onChange={(e) => {
                  router.replace({
                    query: {
                      ...router.query,
                      invoiceTab: e
                    }
                  });
                }}
              ></FillRowTabs>
            </Box>
            {invoiceTab !== InvoiceTabEnum.invoiceHeader && (
              <Flex mt={[3, 0]} w={['100%', 'auto']} justifyContent={'flex-end'}>
                <Button
                  w={['100%', 'auto']}
                  variant={'primary'}
                  px="0"
                  onClick={() => setIsOpenInvoiceModal(true)}
                >
                  <Flex alignItems={'center'} px={'20px'}>
                    <Box px={'1.25rem'} py={'0.5rem'}>
                      {t('account_bill:support_wallet_invoicing')}
                    </Box>
                  </Flex>
                </Button>
              </Flex>
            )}
          </Flex>
          <Box
            flex={['0 0 auto', '1 0 0']}
            h={['auto', 0]}
            minH={0}
            overflow={['visible', 'hidden']}
          >
            {invoiceTab === InvoiceTabEnum.bill && <BillTable key={recordsRefreshKey} />}
            {invoiceTab === InvoiceTabEnum.invoice && <InvoiceTable key={recordsRefreshKey} />}
            {invoiceTab === InvoiceTabEnum.invoiceHeader && <InvoiceHeaderForm />}
          </Box>
        </Flex>
        {isOpenInvoiceModal && (
          <ApplyInvoiceModal
            onClose={() => {
              setIsOpenInvoiceModal(false);
            }}
            onSuccess={() => {
              setIsOpenInvoiceModal(false);
              setRecordsRefreshKey((key) => key + 1);
            }}
          />
        )}
      </Flex>
    </AccountContainer>
  );
};

export default BillAndInvoice;
