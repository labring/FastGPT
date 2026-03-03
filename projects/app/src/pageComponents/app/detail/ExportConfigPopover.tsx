import React, { useCallback, useState } from 'react';
import { Box, Checkbox, Divider, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { fileDownload } from '@/web/common/file/utils';
import { type AppChatConfigType, type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { filterSensitiveFormData } from '@/web/core/app/utils';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { type StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

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

  const [filterSensitiveInfo, setFilterSensitiveInfo] = useState<boolean>(true);

  const onExportWorkflow = useCallback(
    async (mode: 'copy' | 'json') => {
      let config = '';

      if (appForm) {
        config = JSON.stringify(
          filterSensitiveInfo ? filterSensitiveFormData(appForm) : appForm,
          null,
          2
        );
      } else if (getWorkflowData) {
        const workflowData = getWorkflowData();
        if (!workflowData) return;
        config = JSON.stringify(
          {
            nodes: filterSensitiveInfo
              ? filterSensitiveNodesData(workflowData.nodes)
              : workflowData.nodes,
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
        copyData(
          config,
          filterSensitiveInfo
            ? t('app:export_filtered_sensitive_config_successful')
            : t('app:export_config_successful')
        );
      } else if (mode === 'json') {
        fileDownload({
          text: config,
          type: 'application/json;charset=utf-8',
          filename: `${appName}.json`
        });
      }
    },
    [appForm, appName, chatConfig, copyData, getWorkflowData, t, filterSensitiveInfo]
  );

  return (
    <MyPopover
      placement={'right-start'}
      offset={[0, 20]}
      hasArrow
      trigger={'hover'}
      w={'8.6rem'}
      Trigger={
        <MyBox display={'flex'} cursor={'pointer'} onClick={(e) => e.stopPropagation()}>
          <MyIcon name={'export'} w={'16px'} mr={2} />
          <Box fontSize={'sm'}>{t('app:export_configs')}</Box>
        </MyBox>
      }
    >
      {({ onClose }) => (
        <Box p={1} onClick={(e) => e.stopPropagation()}>
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
            <Box fontSize={'mini'}>{t('common:copy_to_clipboard')}</Box>
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
            <Box fontSize={'mini'}>{t('common:export_to_json')}</Box>
          </Flex>

          <Divider />

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
            onClick={() => setFilterSensitiveInfo(!filterSensitiveInfo)}
          >
            <Checkbox
              size="sm"
              colorScheme="primary"
              isChecked={filterSensitiveInfo}
              pointerEvents={'none'}
            >
              <Box fontSize={'mini'}>{t('common:filter_sensitive_info')}</Box>
            </Checkbox>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default React.memo(ExportConfigPopover);
