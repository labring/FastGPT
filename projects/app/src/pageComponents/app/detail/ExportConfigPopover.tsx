import React, { useCallback } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { fileDownload } from '@/web/common/file/utils';
import { AppChatConfigType, AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { filterSensitiveFormData } from '@/web/core/app/utils';
import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

const ExportConfigPopover = ({
  appForm,
  getWorkflowData,

  chatConfig,
  appName
}: {
  appName: string;
  chatConfig?: AppChatConfigType;
} & RequireOnlyOne<{
  getWorkflowData: () =>
    | {
        nodes: StoreNodeItemType[];
        edges: StoreEdgeItemType[];
      }
    | undefined;
  appForm: AppSimpleEditFormType;
}>) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  const onExportWorkflow = useCallback(
    async (mode: 'copy' | 'json') => {
      let config = '';

      if (appForm) {
        config = JSON.stringify(filterSensitiveFormData(appForm), null, 2);
      } else if (getWorkflowData) {
        const workflowData = getWorkflowData();
        if (!workflowData) return;
        config = JSON.stringify(
          {
            nodes: filterSensitiveNodesData(workflowData.nodes),
            edges: workflowData.edges,
            chatConfig
          },
          null,
          2
        );
      }

      if (!config) {
        return;
      }

      if (mode === 'copy') {
        copyData(config, t('app:export_config_successful'));
      } else if (mode === 'json') {
        fileDownload({
          text: config,
          type: 'application/json;charset=utf-8',
          filename: `${appName}.json`
        });
      }
    },
    [appForm, appName, chatConfig, copyData, getWorkflowData, t]
  );

  return (
    <MyPopover
      placement={'right-start'}
      offset={[0, 20]}
      hasArrow
      trigger={'hover'}
      w={'8.6rem'}
      Trigger={
        <MyBox display={'flex'} cursor={'pointer'}>
          <MyIcon name={'export'} w={'16px'} mr={2} />
          <Box fontSize={'sm'}>{t('app:export_configs')}</Box>
        </MyBox>
      }
    >
      {({ onClose }) => (
        <Box p={1}>
          <Flex
            py={'0.38rem'}
            px={1}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={() => onExportWorkflow('copy')}
          >
            <MyIcon name={'copy'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:common.copy_to_clipboard')}</Box>
          </Flex>
          <Flex
            py={'0.38rem'}
            px={1}
            color={'myGray.600'}
            _hover={{
              bg: 'myGray.05',
              color: 'primary.600',
              cursor: 'pointer'
            }}
            borderRadius={'xs'}
            onClick={() => onExportWorkflow('json')}
          >
            <MyIcon name={'configmap'} w={'1rem'} mr={2} />
            <Box fontSize={'mini'}>{t('common:common.export_to_json')}</Box>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default React.memo(ExportConfigPopover);
