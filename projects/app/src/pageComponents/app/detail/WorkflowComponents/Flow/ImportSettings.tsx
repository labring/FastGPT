import React, { useState } from 'react';
import { Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';
import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';
import { AppContext } from '../../context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

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
  const { getMyModelList } = useSystemStore();

  const { data: myModels } = useRequest(getMyModelList, {
    manual: false
  });

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
            try {
              const workflowConfig = parseWorkflowImportConfig({
                config: JSON.parse(value),
                appType:
                  appType === AppTypeEnum.workflowTool
                    ? AppTypeEnum.workflowTool
                    : AppTypeEnum.workflow,
                t
              });
              await removeUnauthModels({ modules: workflowConfig.nodes, allowedModels: myModels });
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
