import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import { type AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import ToolSelectModal from './ToolSelectModal';

import Avatar from '@fastgpt/web/components/common/Avatar';
import ConfigToolModal from '../../component/ConfigToolModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import { PluginStatusEnum, PluginStatusMap } from '@fastgpt/global/core/plugin/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import { countAgentGeneratedToolInputs } from './utils';

const ToolSelect = ({
  generatedSelectedTools,
  selectedModel,
  selectedTools = [],
  fileSelectConfig = {},
  onAddTool,
  onUpdateTool,
  onRemoveTool
}: {
  generatedSelectedTools?: SelectedToolItemType[];
  selectedModel: LLMModelItemType;
  selectedTools?: SelectedToolItemType[];
  fileSelectConfig?: AppFileSelectConfigType;
  onAddTool: (tool: SelectedToolItemType) => void;
  onUpdateTool: (tool: SelectedToolItemType) => void;
  onRemoveTool: (id: string) => void;
}) => {
  const { t } = useTranslation();

  const [configTool, setConfigTool] = useState<AppFormEditFormType['selectedTools'][number] | null>(
    null
  );

  const {
    isOpen: isOpenToolsSelect,
    onOpen: onOpenToolsSelect,
    onClose: onCloseToolsSelect
  } = useDisclosure();

  return (
    <>
      <Flex alignItems={'center'}>
        <Flex alignItems={'center'} flex={1}>
          <MyIcon name={'core/app/toolCall'} w={'20px'} />
          <FormLabel ml={2}>{t('app:tools')}</FormLabel>
          <QuestionTip ml={1} label={t('app:tools_tip')} />
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
        mt={selectedTools.length > 0 ? 2 : 0}
        gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
        gridGap={[2, 4]}
      >
        {selectedTools.map((item) => {
          const toolError = formatToolError(item.pluginData?.error);
          // 即将下架/已下架
          const status = item.status || item.pluginData?.status;

          const isUnconfigured = item.configStatus === 'waitingForConfig';
          const isDebugTool = isDebugToolSource(item.source);
          const agentGeneratedInputCount = countAgentGeneratedToolInputs(item);

          return (
            <MyTooltip key={item.id} label={item.intro}>
              <Grid
                overflow={'hidden'}
                alignItems={'center'}
                gridTemplateColumns={'auto minmax(0, 1fr) auto'}
                columnGap={2}
                minW={0}
                h={'46px'}
                px={3}
                py={0}
                bg={'white'}
                borderRadius={'6px'}
                border={'base'}
                borderColor={toolError ? 'red.600' : 'myGray.200'}
                userSelect={'none'}
                _hover={{
                  borderColor: toolError ? 'red.600' : 'primary.300',
                  '.delete': {
                    display: 'flex'
                  },
                  '.unHoverStyle': {
                    display: 'none'
                  }
                }}
              >
                <Avatar src={item.avatar} w={'28px'} h={'28px'} borderRadius={'sm'} />
                <Box minW={0} className={'textEllipsis'} fontSize={'sm'} color={'myGray.900'}>
                  {item.name}
                </Box>

                <Flex gap={1} minW={0} justifySelf={'end'} alignItems={'center'}>
                  {status !== undefined && status !== PluginStatusEnum.Normal && (
                    <MyTooltip label={t(PluginStatusMap[status].tooltip)}>
                      <MyTag
                        display={'block'}
                        className="unHoverStyle"
                        colorSchema={PluginStatusMap[status].tagColor}
                        type="borderFill"
                      >
                        {t(PluginStatusMap[status].label)}
                      </MyTag>
                    </MyTooltip>
                  )}
                  {toolError && (
                    <MyTag colorSchema="red" type="fill" className="unHoverStyle">
                      <MyIcon name={'common/error'} w={'14px'} mr={1} />
                      <Box color={'red.600'} maxW={'150px'} className="textEllipsis">
                        {t(toolError as any)}
                      </Box>
                    </MyTag>
                  )}
                  {isUnconfigured && (
                    <MyTag colorSchema="blue" type="fill" className="unHoverStyle">
                      {t('app:wait_for_config')}
                    </MyTag>
                  )}
                  {isDebugTool && <DebugToolTag className="unHoverStyle" />}
                  {agentGeneratedInputCount > 0 && (
                    <MyTag colorSchema="green" type="fill" className="unHoverStyle">
                      {t('common:core.workflow.inputType.agentGenerated')} ×
                      {agentGeneratedInputCount}
                    </MyTag>
                  )}
                  {!toolError && (
                    <MyIconButton
                      icon="common/setting"
                      tip={t('app:tool_param_config')}
                      onClick={() => setConfigTool(item)}
                    />
                  )}
                  <Box className="delete" display={['flex', 'none']} ml={0.5}>
                    <MyIconButton
                      icon="delete"
                      hoverBg="red.50"
                      hoverColor="red.600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveTool(item.pluginId!);
                      }}
                    />
                  </Box>
                </Flex>
              </Grid>
            </MyTooltip>
          );
        })}
      </Grid>

      {isOpenToolsSelect && (
        <ToolSelectModal
          generatedSelectedTools={generatedSelectedTools}
          selectedTools={selectedTools}
          fileSelectConfig={fileSelectConfig}
          selectedModel={selectedModel}
          onAddTool={onAddTool}
          onRemoveTool={(e) => {
            onRemoveTool(e.id);
          }}
          onClose={onCloseToolsSelect}
        />
      )}
      {configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={() => setConfigTool(null)}
          onAddTool={(e) => {
            onUpdateTool({
              ...e,
              configStatus: 'configured'
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(ToolSelect);
