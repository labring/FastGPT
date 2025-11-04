import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import { type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { theme } from '@fastgpt/web/styles/theme';
import DeleteIcon, { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import ToolSelectModal, { childAppSystemKey } from './ToolSelectModal';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import ConfigToolModal from './ConfigToolModal';
import { getWebLLMModel } from '@/web/common/system/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import { PluginStatusEnum, PluginStatusMap } from '@fastgpt/global/core/plugin/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';

const ToolSelect = ({
  appForm,
  setAppForm
}: {
  appForm: AppSimpleEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppSimpleEditFormType>>;
}) => {
  const { t } = useTranslation();

  const [configTool, setConfigTool] = useState<
    AppSimpleEditFormType['selectedTools'][number] | null
  >(null);

  const {
    isOpen: isOpenToolsSelect,
    onOpen: onOpenToolsSelect,
    onClose: onCloseToolsSelect
  } = useDisclosure();
  const selectedModel = getWebLLMModel(appForm.aiSettings.model);

  return (
    <>
      <Flex alignItems={'center'}>
        <Flex alignItems={'center'} flex={1}>
          <MyIcon name={'core/app/toolCall'} w={'20px'} />
          <FormLabel ml={2}>{t('common:core.app.Tool call')}</FormLabel>
          <QuestionTip ml={1} label={t('app:plugin_dispatch_tip')} />
        </Flex>
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          mr={'-5px'}
          size={'sm'}
          fontSize={'sm'}
          onClick={onOpenToolsSelect}
        >
          {t('common:Choose')}
        </Button>
      </Flex>
      <Grid
        mt={appForm.selectedTools.length > 0 ? 2 : 0}
        gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
        gridGap={[2, 4]}
      >
        {appForm.selectedTools.map((item) => {
          const toolError = formatToolError(item.pluginData?.error);
          const status = item.status || item.pluginData?.status;

          return (
            <MyTooltip key={item.id} label={item.intro}>
              <Flex
                overflow={'hidden'}
                alignItems={'center'}
                p={2.5}
                bg={'white'}
                boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                borderRadius={'md'}
                border={theme.borders.base}
                borderColor={toolError ? 'red.600' : ''}
                _hover={{
                  ...hoverDeleteStyles,
                  borderColor: toolError ? 'red.600' : 'primary.300'
                }}
                cursor={'pointer'}
                onClick={() => {
                  if (
                    item.inputs
                      .filter((input) => !childAppSystemKey.includes(input.key))
                      .every(
                        (input) =>
                          input.toolDescription ||
                          input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) ||
                          input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
                      ) ||
                    toolError ||
                    item.flowNodeType === FlowNodeTypeEnum.tool ||
                    item.flowNodeType === FlowNodeTypeEnum.toolSet
                  ) {
                    return;
                  }
                  setConfigTool(item);
                }}
              >
                <Avatar src={item.avatar} w={'1.5rem'} h={'1.5rem'} borderRadius={'sm'} />
                <Box
                  flex={'1 0 0'}
                  ml={2}
                  gap={2}
                  className={'textEllipsis'}
                  fontSize={'sm'}
                  color={'myGray.900'}
                >
                  {item.name}
                </Box>
                {status !== undefined && status !== PluginStatusEnum.Normal && (
                  <MyTooltip label={t(PluginStatusMap[status].tooltip)}>
                    <MyTag mr={2} colorSchema={PluginStatusMap[status].tagColor} type="borderFill">
                      {t(PluginStatusMap[status].label)}
                    </MyTag>
                  </MyTooltip>
                )}
                {toolError && (
                  <Flex
                    bg={'red.50'}
                    alignItems={'center'}
                    h={6}
                    px={2}
                    rounded={'6px'}
                    fontSize={'xs'}
                    fontWeight={'medium'}
                  >
                    <MyIcon name={'common/errorFill'} w={'14px'} mr={1} />
                    <Box color={'red.600'}>{t(toolError as any)}</Box>
                  </Flex>
                )}
                <DeleteIcon
                  ml={2}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAppForm((state: AppSimpleEditFormType) => ({
                      ...state,
                      selectedTools: state.selectedTools.filter((tool) => tool.id !== item.id)
                    }));
                  }}
                />
              </Flex>
            </MyTooltip>
          );
        })}
      </Grid>

      {isOpenToolsSelect && (
        <ToolSelectModal
          selectedTools={appForm.selectedTools}
          chatConfig={appForm.chatConfig}
          selectedModel={selectedModel}
          onAddTool={(e) => {
            setAppForm((state) => ({
              ...state,
              selectedTools: [...state.selectedTools, e]
            }));
          }}
          onRemoveTool={(e) => {
            setAppForm((state) => ({
              ...state,
              selectedTools: state.selectedTools.filter((item) => item.pluginId !== e.id)
            }));
          }}
          onClose={onCloseToolsSelect}
        />
      )}
      {configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={() => setConfigTool(null)}
          onAddTool={(e) => {
            setAppForm((state) => ({
              ...state,
              selectedTools: state.selectedTools.map((item) =>
                item.pluginId === configTool.pluginId ? e : item
              )
            }));
          }}
        />
      )}
    </>
  );
};

export default React.memo(ToolSelect);
