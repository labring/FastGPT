import React from 'react';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getAgentToolRuntimeStatus } from '@fastgpt/global/core/app/formEdit/utils';
import {
  PluginStatusEnum,
  PluginStatusMap,
  type PluginStatusType
} from '@fastgpt/global/core/plugin/type';
import { isDebugToolSource, getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import { getToolErrorMessage } from '@/web/core/workflow/check/message';

/**
 * 渲染已选工具卡片列表（支持独立 ChatAgent 表单与工作流 Agent 节点复用）。
 */
const SelectedToolCardList = React.memo(function SelectedToolCardList({
  selectedTools,
  onConfigTool,
  onRemoveTool,
  cardHeight = '46px',
  avatarSize = '28px',
  compact = false
}: {
  selectedTools: SelectedToolItemType[];
  onConfigTool: (tool: SelectedToolItemType) => void;
  onRemoveTool: (id: string, source?: string) => void;
  cardHeight?: number | string;
  avatarSize?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  const statusLabelMap: Partial<Record<PluginStatusType, string>> = {
    [PluginStatusEnum.SoonOffline]: t('app:toolkit_status_soon_offline'),
    [PluginStatusEnum.Offline]: t('common:error.tool_not_exist')
  };
  const statusTooltipMap: Partial<Record<PluginStatusType, string>> = {
    [PluginStatusEnum.SoonOffline]: t('app:tool_soon_offset_tips'),
    [PluginStatusEnum.Offline]: t('app:tool_offset_tips')
  };

  return (
    <>
      {selectedTools.map((item) => {
        const status = item.status ?? item.pluginData?.status;
        const runtimeStatus = getAgentToolRuntimeStatus(item);
        const toolError = getToolErrorMessage({
          status,
          error: item.pluginData?.error,
          t
        });
        const hasToolError = runtimeStatus === 'invalid' || runtimeStatus === 'offline';
        const isUnconfigured = runtimeStatus === 'waitingForConfig';
        const isDebugTool = isDebugToolSource(item.source);

        return (
          <MyTooltip
            key={getToolIdentityKey(item.pluginId || item.id, item.source)}
            label={toolError || item.intro}
            offset={[0, 8]}
            shouldWrapChildren={false}
          >
            <Grid
              overflow={'hidden'}
              alignItems={'center'}
              gridTemplateColumns={'auto minmax(0, 1fr) auto'}
              columnGap={compact ? 1.5 : 2}
              minW={0}
              h={compact ? 10 : cardHeight}
              px={3}
              py={compact ? 2.5 : 0}
              boxShadow={'none'}
              bg={'white'}
              borderRadius={compact ? 'md' : '6px'}
              border={'base'}
              borderColor={hasToolError ? 'red.600' : 'myGray.200'}
              userSelect={'none'}
              _hover={{
                borderColor: hasToolError ? 'red.600' : 'primary.300',
                '.delete': {
                  display: 'flex'
                },
                '.hoverStyle': {
                  display: 'flex'
                },
                '.unHoverStyle': {
                  display: 'none'
                }
              }}
            >
              <Avatar
                src={item.avatar}
                w={compact ? '18px' : avatarSize}
                h={compact ? undefined : avatarSize}
                borderRadius={compact ? 'xs' : 'sm'}
              />
              {compact ? (
                <Box
                  minW={0}
                  className={'textEllipsis'}
                  fontSize={['sm', 'sm']}
                  fontWeight={'medium'}
                  color={hasToolError ? 'red.600' : 'myGray.900'}
                >
                  {item.name}
                </Box>
              ) : (
                <MyTooltip
                  label={item.name}
                  showOnlyWhenOverflow
                  shouldWrapChildren={false}
                  offset={[0, 8]}
                >
                  <Box
                    minW={0}
                    className={'textEllipsis'}
                    fontSize={'sm'}
                    color={hasToolError ? 'red.600' : 'myGray.900'}
                  >
                    {item.name}
                  </Box>
                </MyTooltip>
              )}

              <Flex gap={1} minW={0} justifySelf={'end'} alignItems={'center'}>
                {status === PluginStatusEnum.SoonOffline && (
                  <MyTooltip label={statusTooltipMap[status]} offset={[0, 8]}>
                    <MyTag
                      display={'block'}
                      className="unHoverStyle"
                      colorSchema={PluginStatusMap[status].tagColor}
                      type="borderFill"
                    >
                      {statusLabelMap[status]}
                    </MyTag>
                  </MyTooltip>
                )}
                {toolError && (
                  <MyTag colorSchema="red" type="fill" className="unHoverStyle">
                    <MyIcon name={'common/error'} w={'14px'} mr={1} />
                    <Box color={'red.600'} maxW={'150px'} className="textEllipsis">
                      {toolError}
                    </Box>
                  </MyTag>
                )}
                {isUnconfigured && (
                  <MyTag colorSchema="blue" type="fill" className="unHoverStyle">
                    {t('app:wait_for_config')}
                  </MyTag>
                )}
                {isDebugTool && <DebugToolTag className="unHoverStyle" />}
                {!hasToolError && (
                  <MyIconButton
                    className="hoverStyle"
                    display={'none'}
                    icon="common/setting"
                    tip={t('app:tool_param_config')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfigTool(item);
                    }}
                  />
                )}
                <Box
                  className="delete"
                  display={compact ? 'none' : ['flex', 'none']}
                  ml={compact ? 0 : 0.5}
                >
                  <MyIconButton
                    icon="delete"
                    hoverBg="red.50"
                    hoverColor="red.600"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveTool((item.pluginId || item.id)!, item.source);
                    }}
                  />
                </Box>
              </Flex>
            </Grid>
          </MyTooltip>
        );
      })}
    </>
  );
});

export default SelectedToolCardList;
