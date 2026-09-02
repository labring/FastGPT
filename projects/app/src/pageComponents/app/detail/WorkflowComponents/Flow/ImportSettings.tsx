import React, { useState } from 'react';
import { Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';
import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';
import { AppContext } from '../../context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useUserModelLists } from '@/web/core/ai/model/useUserModelLists';

const ImportAppConfigEditor = dynamic(() => import('@/pageComponents/app/ImportAppConfigEditor'), {
  ssr: false
});

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();

  const initData = useContextSelector(WorkflowUtilsContext, (v) => v.initData);
  const appType = useContextSelector(AppContext, (v) => v.appDetail.type);
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const { modelList, loading: modelsLoading, loaded: modelsLoaded } = useUserModelLists();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={t('app:import_configs')}
      size={'md'}
      footer={
        <Button
          px={5}
          py={2}
          isDisabled={!value}
          onClick={async () => {
            if (!value) {
              return onClose();
            }
            if (!modelsLoaded) {
              toast({
                title: t('common:model_catalog_load_failed'),
                status: 'error'
              });
              return;
            }
            try {
              const workflowConfig = await parseWorkflowImportConfig({
                config: JSON.parse(value),
                appType:
                  appType === AppTypeEnum.workflowTool
                    ? AppTypeEnum.workflowTool
                    : AppTypeEnum.workflow,
                t,
                models: modelList,
                modelCatalogLoaded: modelsLoaded
              });
              await initData(workflowConfig);
              toast({
                title: t('app:import_configs_success'),
                status: 'success'
              });
              onClose();
            } catch {
              toast({
                title: t('app:import_configs_failed'),
                status: 'error'
              });
            }
          }}
          isLoading={modelsLoading}
          fontWeight={'500'}
        >
          {t('common:Save')}
        </Button>
      }
    >
      <ImportAppConfigEditor value={value} onChange={setValue} rows={16} />
    </MyModal>
  );
};

export default React.memo(ImportSettings);
