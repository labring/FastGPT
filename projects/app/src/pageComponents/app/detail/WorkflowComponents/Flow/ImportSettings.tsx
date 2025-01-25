import React, { useState } from 'react';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';

const ImportAppConfigEditor = dynamic(() => import('@/pageComponents/app/ImportAppConfigEditor'), {
  ssr: false
});

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();

  const initData = useContextSelector(WorkflowContext, (v) => v.initData);
  const { t } = useTranslation();
  const [value, setValue] = useState('');

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="common/importLight"
      iconColor="primary.600"
      title={t('app:import_configs')}
      size={'md'}
    >
      <ModalBody>
        <ImportAppConfigEditor value={value} onChange={setValue} rows={16} />
      </ModalBody>
      <ModalFooter justifyItems={'flex-end'}>
        <Button
          px={5}
          py={2}
          onClick={async () => {
            if (!value) {
              return onClose();
            }
            try {
              const data = JSON.parse(value);
              await initData(data);
              toast({
                title: t('app:import_configs_success'),
                status: 'success'
              });
              onClose();
            } catch (error) {
              toast({
                title: t('app:import_configs_failed')
              });
            }
          }}
          fontWeight={'500'}
        >
          {t('common:common.Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
