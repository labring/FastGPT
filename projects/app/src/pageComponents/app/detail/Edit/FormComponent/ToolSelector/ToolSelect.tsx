import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import ToolSelectModal from './ToolSelectModal';

import Avatar from '@fastgpt/web/components/common/Avatar';
import ConfigToolModal from '../../component/ConfigToolModal';
import { getWebLLMModel } from '@/web/common/system/utils';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { formatToolError } from '@fastgpt/global/core/app/utils';
import { PluginStatusEnum, PluginStatusMap } from '@fastgpt/global/core/plugin/type';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { checkNeedsUserConfiguration } from '../../ChatAgent/utils';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model';

const ToolSelect = ({
  selectedModel,
  selectedTools = [],
  fileSelectConfig = {},
  onAddTool,
  onUpdateTool,
  onRemoveTool
}: {
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

          const hasFormInput = checkNeedsUserConfiguration(item);
          const isUnconfigured = item.configStatus === 'waitingForConfig';

          return (
            <MyTooltip key={item.id} label={item.intro}>
              <Flex
                overflow={'hidden'}
                alignItems={'center'}
                p={2.5}
                bg={'white'}
                boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                borderRadius={'md'}
                border={'base'}
                borderColor={toolError ? 'red.600' : ''}
                userSelect={'none'}
                _hover={{
                  borderColor: toolError ? 'red.600' : 'primary.300',
                  '.delete': {
                    display: 'block'
                  },
                  '.hoverStyle': {
                    display: 'block'
                  },
                  '.unHoverStyle': {
                    display: 'none'
                  }
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
                    <MyTag
                      display={'block'}
                      className="unHoverStyle"
                      mr={2}
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

                {/* Edit icon */}
                {hasFormInput && !toolError && (
                  <MyIconButton
                    className="hoverStyle"
                    display={['block', 'none']}
                    icon="common/setting"
                    onClick={() => setConfigTool(item)}
                  />
                )}

                {/* Delete icon */}
                <Box className="hoverStyle" display={['block', 'none']} ml={0.5}>
                  <MyIconButton
                    icon="delete"
                    hoverBg="red.50"
                    hoverColor="red.600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTool(item.id);
                    }}
                  />
                </Box>
              </Flex>
            </MyTooltip>
          );
        })}
      </Grid>

      {isOpenToolsSelect && (
        <ToolSelectModal
          selectedTools={selectedTools}
          fileSelectConfig={fileSelectConfig}
          selectedModel={selectedModel}
          onAddTool={(e) => {
            onAddTool(e);
          }}
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
              configStatus: 'active'
            });
          }}
        />
      )}
    </>
  );
};

export default React.memo(ToolSelect);
