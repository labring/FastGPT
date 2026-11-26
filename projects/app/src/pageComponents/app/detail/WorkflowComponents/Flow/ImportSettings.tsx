import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';
import { getModelList } from '@/web/core/ai/model/modelData';
import { Box, Button } from '@chakra-ui/react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import React, { useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useWorkflowSessionActions } from '@/web/core/workflow/editor/session/workflowSession';
import { materializeWorkflow } from '@/web/core/workflow/editor/codec';

const ImportAppConfigEditor = dynamic(() => import('@/pageComponents/app/ImportAppConfigEditor'), {
  ssr: false
});

type Props = {
  onClose: () => void;
};

const ImportSettings = ({ onClose }: Props) => {
  const { toast } = useToast();

  const { loadDocument } = useWorkflowSessionActions();
  const chatConfig = useContextSelector(AppContext, (v) => v.appDetail.chatConfig);
  const appType = useContextSelector(AppContext, (v) => v.appDetail.type);
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const showImportFailure = (message?: string) =>
    toast({
      title: t('app:import_configs_failed'),
      description: message ? <Box whiteSpace="pre-wrap">{message}</Box> : undefined,
      status: 'error'
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
            setModelsLoading(true);
            try {
              const modelList = await getModelList();
              const workflowConfig = await parseWorkflowImportConfig({
                config: JSON.parse(value),
                appType:
                  appType === AppTypeEnum.workflowTool
                    ? AppTypeEnum.workflowTool
                    : AppTypeEnum.workflow,
                t,
                models: modelList,
                modelCatalogLoaded: true
              });
              const result = loadDocument(
                materializeWorkflow({
                  input: workflowConfig,
                  chatConfig: workflowConfig.chatConfig ?? chatConfig,
                  t
                })
              );
              if (!result.ok) {
                showImportFailure(result.error?.message);
                return;
              }
              toast({
                title: t('app:import_configs_success'),
                status: 'success'
              });
              onClose();
            } catch {
              showImportFailure();
            } finally {
              setModelsLoading(false);
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
