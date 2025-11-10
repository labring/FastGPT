import React, { useState } from 'react';
import { Button, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';

const ImportAppConfigEditor = dynamic(() => import('@/pageComponents/app/ImportAppConfigEditor'), {
  ssr: false
});

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const { getMyModelList } = useSystemStore();

  const { data: myModels } = useRequest2(getMyModelList, {
    manual: false
  });

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
              removeUnauthModels({ modules: data.nodes, allowedModels: myModels });
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
          {t('common:Save')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(ImportSettings);
