import { Box, Button, Flex } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import ApplyInvoiceModal from './ApplyInvoiceModal';

const TabEnum = {
  bill: 'bill',
  invoice: 'invoice',
  invoiceHeader: 'voiceHeader'
};
const BillTable = dynamic(() => import('./BillTable'));
const InvoiceHeaderForm = dynamic(() => import('./InvoiceHeaderForm'));
const InvoiceTable = dynamic(() => import('./InvoiceTable'));
const BillAndInvoice = () => {
  const [currentTab, setCurrentTab] = useState(TabEnum.bill);
  const [isOpenInvoiceModal, setIsOpenInvoiceModal] = useState(false);

  const { t } = useTranslation();
  return (
    <>
      <Box p={['1rem', '2rem']}>
        <Flex justifyContent={'space-between'} alignItems={'center'} pb={'0.75rem'}>
          <FillRowTabs
            list={[
              { label: t('common:support.wallet.bill_tag.bill'), value: TabEnum.bill },
              { label: t('common:support.wallet.bill_tag.invoice'), value: TabEnum.invoice },
              {
                label: t('common:support.wallet.bill_tag.default_header'),
                value: TabEnum.invoiceHeader
              }
            ]}
            value={currentTab}
            onChange={setCurrentTab}
          ></FillRowTabs>
          {currentTab !== TabEnum.invoiceHeader && (
            <Button variant={'primary'} px="0" onClick={() => setIsOpenInvoiceModal(true)}>
              <Flex alignItems={'center'} px={'20px'}>
                <Box px={'1.25rem'} py={'0.5rem'}>
                  {t('common:support.wallet.invoicing')}
                </Box>
              </Flex>
            </Button>
          )}
        </Flex>
        <Box h={'100%'}>
          {currentTab === TabEnum.bill && <BillTable />}
          {currentTab === TabEnum.invoice && <InvoiceTable />}
          {currentTab === TabEnum.invoiceHeader && <InvoiceHeaderForm />}
        </Box>
        {isOpenInvoiceModal && <ApplyInvoiceModal onClose={() => setIsOpenInvoiceModal(false)} />}
      </Box>
    </>
  );
};

export default BillAndInvoice;
