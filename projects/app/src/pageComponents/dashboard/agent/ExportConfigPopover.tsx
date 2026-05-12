import React, { useCallback, useState } from 'react';
import { Box, Checkbox, Divider, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { fileDownload } from '@/web/common/file/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getAppDetailById } from '@/web/core/app/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';

/**
 * 应用列表页的导出配置Popover
 * 点击时动态获取应用详情并导出
 */
const ExportConfigPopover = ({ appName, appId }: { appName: string; appId: string }) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { toast } = useToast();
  const [filterSensitiveInfo, setFilterSensitiveInfo] = useState<boolean>(true);

  const { runAsync: fetchAndExport, loading } = useRequest(
    async (mode: 'copy' | 'json') => {
      // 获取应用详情
      const appDetail = await getAppDetailById(appId);
      if (!appDetail) {
        throw new Error(t('app:app_not_found'));
      }

      // 构建配置
      const config = JSON.stringify(
        {
          name: appDetail.name,
          intro: appDetail.intro,
          nodes: filterSensitiveInfo
            ? filterSensitiveNodesData(appDetail.modules)
            : appDetail.modules,
          edges: appDetail.edges,
          chatConfig: appDetail.chatConfig
        },
        null,
        2
      );

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
    {
      manual: true,
      onError: (err) => {
        toast({
          status: 'error',
          title: t('app:export_failed'),
          description: err.message
        });
      }
    }
  );

  const onExportWorkflow = useCallback(
    async (mode: 'copy' | 'json') => {
      await fetchAndExport(mode);
    },
    [fetchAndExport]
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
            opacity={loading ? 0.6 : 1}
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
            opacity={loading ? 0.6 : 1}
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
