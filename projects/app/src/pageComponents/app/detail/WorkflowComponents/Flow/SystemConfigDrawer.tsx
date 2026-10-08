import React, { useMemo } from 'react';
import { Box, CloseButton, Flex, IconButton, Portal, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AppContext } from '../../context';
import { getAppChatConfig } from '@fastgpt/global/core/workflow/utils';
import { SystemConfigForm } from './components/SystemConfigForm';
import { PluginConfigForm } from './nodes/NodePluginIO/PluginConfigForm';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import AppDetailPanelModal, {
  APP_DETAIL_PANEL_WIDTH_PX
} from '../../components/AppDetailPanelModal';
import { useAppEditorUIState } from '@/components/core/app/useAppEditorUIState';
import WorkflowBuilderGuidePopover from '../WorkflowBuilder/GuidePopover';
import { useWorkflowBuilderUI } from '../WorkflowBuilder/context';
import WorkflowToolbarTooltip from '../WorkflowBuilder/WorkflowToolbarTooltip';

/** 画布左侧工具栏中的系统配置入口，同时承载首次引导的第一步。 */
export const SystemConfigButton = React.memo(() => {
  const { t } = useTranslation();
  const { guideStep, toggleLeftPanel, completeGuideStep } = useWorkflowBuilderUI();

  return (
    <WorkflowBuilderGuidePopover
      isOpen={guideStep === 'systemConfig'}
      title={t('workflow:workflow_builder_guide_system_title')}
      description={t('workflow:workflow_builder_guide_system_description')}
      onConfirm={() => completeGuideStep('systemConfig')}
    >
      <Box>
        <WorkflowToolbarTooltip
          isDisabled={guideStep === 'systemConfig'}
          label={t('workflow:template.system_config')}
        >
          <IconButton
            icon={
              <MyIcon name={'core/app/configDrawerSetting'} boxSize={'18px'} color={'#485264'} />
            }
            w={8}
            minW={8}
            h={8}
            p={'7px'}
            borderRadius={'6px'}
            aria-label={t('workflow:template.system_config')}
            variant={'unstyled'}
            _hover={{ bg: 'myGray.50' }}
            onClick={() => toggleLeftPanel('systemConfig')}
          />
        </WorkflowToolbarTooltip>
      </Box>
    </WorkflowBuilderGuidePopover>
  );
});
SystemConfigButton.displayName = 'SystemConfigButton';

const SystemConfigDrawer = () => {
  const { t } = useTranslation();
  const { activeLeftPanel, closeLeftPanel } = useWorkflowBuilderUI();
  const isOpen = activeLeftPanel === 'systemConfig';
  const onClose = () => closeLeftPanel('systemConfig');
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const isWorkflowTool = appDetail.type === AppTypeEnum.workflowTool;
  const setAppDetail = useContextSelector(AppContext, (v) => v.setAppDetail);
  const { isWelcomeTextFolded, toggleWelcomeTextFold } = useAppEditorUIState(appDetail._id);

  const chatConfig = useMemo(
    () =>
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        isPublicFetch: true
      }),
    [appDetail.chatConfig]
  );

  return (
    <>
      <Portal>
        <AppDetailPanelModal
          isOpen={isOpen}
          onClose={onClose}
          width={['100%', `${APP_DETAIL_PANEL_WIDTH_PX}px`]}
          height={['100vh', 'calc(100vh - 67px)']}
          top={[0, '67px']}
          position={'fixed'}
          placement={'left'}
          animationMode={'slideFromLeft'}
          showMask={false}
          header={
            <Flex w={'100%'} justifyContent={'space-between'} alignItems={'center'}>
              <Text
                color={'myGray.900'}
                fontSize={'md'}
                fontWeight={'medium'}
                lineHeight={'24px'}
                letterSpacing={0}
              >
                {t('workflow:template.system_config')}
              </Text>
              <CloseButton size={'sm'} onClick={onClose} />
            </Flex>
          }
        >
          <Box
            w={'100%'}
            h={'100%'}
            minW={['100vw', `${APP_DETAIL_PANEL_WIDTH_PX}px`]}
            minH={0}
            px={6}
            pb={6}
            overflowY={'auto'}
            overflowX={'hidden'}
            sx={{
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }}
          >
            {isWorkflowTool ? (
              <PluginConfigForm chatConfig={chatConfig} setAppDetail={setAppDetail} />
            ) : (
              <SystemConfigForm
                chatConfig={chatConfig}
                setAppDetail={setAppDetail}
                mode={'drawer'}
                isWelcomeTextFolded={isWelcomeTextFolded}
                onToggleWelcomeTextFold={toggleWelcomeTextFold}
              />
            )}
          </Box>
        </AppDetailPanelModal>
      </Portal>
    </>
  );
};

export default React.memo(SystemConfigDrawer);
