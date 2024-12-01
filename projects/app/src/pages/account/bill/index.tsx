import { Box, Button, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import ApplyInvoiceModal from './components/ApplyInvoiceModal';
import { useRouter } from 'next/router';
import AccountContainer, { TabEnum } from '../components/AccountContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';

export enum InvoiceTabEnum {
  bill = 'bill',
  invoice = 'invoice',
  invoiceHeader = 'invoiceHeader'
}

const BillTable = dynamic(() => import('./components/BillTable'));
const InvoiceHeaderForm = dynamic(() => import('./components/InvoiceHeaderForm'));
const InvoiceTable = dynamic(() => import('./components/InvoiceTable'));
const BillAndInvoice = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { invoiceTab = InvoiceTabEnum.bill } = router.query as { invoiceTab: `${InvoiceTabEnum}` };

  const [isOpenInvoiceModal, setIsOpenInvoiceModal] = useState(false);

  return (
    <AccountContainer>
      <Box p={['1rem', '2rem']}>
        <Flex justifyContent={'space-between'} alignItems={'center'} pb={'0.75rem'}>
          <FillRowTabs
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
          {invoiceTab !== InvoiceTabEnum.invoiceHeader && (
            <Button variant={'primary'} px="0" onClick={() => setIsOpenInvoiceModal(true)}>
              <Flex alignItems={'center'} px={'20px'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {t('account_bill:support_wallet_invoicing')}
                </Box>
              </Flex>
            </Button>
          )}
        </Flex>
        <Box h={'100%'}>
          {invoiceTab === InvoiceTabEnum.bill && <BillTable />}
          {invoiceTab === InvoiceTabEnum.invoice && <InvoiceTable />}
          {invoiceTab === InvoiceTabEnum.invoiceHeader && <InvoiceHeaderForm />}
        </Box>
        {isOpenInvoiceModal && (
          <ApplyInvoiceModal
            onClose={() => {
              setIsOpenInvoiceModal(false);
            }}
          />
        )}
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account_bill', 'account']))
    }
  };
}

export default BillAndInvoice;
