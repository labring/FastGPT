import React from 'react';
import { useTranslation } from 'next-i18next';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getAgentToolRuntimeStatus } from '@fastgpt/global/core/app/formEdit/utils';
import {
  PluginStatusEnum,
  PluginStatusMap,
  type PluginStatusType
} from '@fastgpt/global/core/plugin/type';
import { isDebugToolSource, getToolIdentityKey } from '@fastgpt/global/core/app/tool/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import { getToolErrorMessage } from '@/web/core/workflow/check/message';
import FormResourceCard from './FormResourceCard';

/**
 * 渲染已选工具卡片列表（支持独立 ChatAgent 表单与工作流 Agent 节点复用）。
 * 复用通用 FormResourceCard 统一卡片尺寸、溢出截断、状态呈现与悬浮绝对定位操作按钮。
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
        const isSoonOffline = status === PluginStatusEnum.SoonOffline;
        const hasStatusTag = isSoonOffline || isUnconfigured || isDebugTool;

        return (
          <FormResourceCard
            key={getToolIdentityKey(item.pluginId || item.id, item.source)}
            compact={compact}
            avatar={
              <Avatar
                src={item.avatar}
                w={compact ? '18px' : avatarSize}
                h={compact ? '18px' : avatarSize}
                borderRadius={compact ? 'xs' : 'sm'}
              />
            }
            name={item.name}
            nameFontWeight={'medium'}
            isUnavailable={hasToolError}
            tooltipLabel={toolError || item.intro}
            errorText={toolError}
            statusContent={
              hasStatusTag ? (
                <>
                  {isSoonOffline && (
                    <MyTag colorSchema={PluginStatusMap[status].tagColor} type="borderFill">
                      {statusLabelMap[status]}
                    </MyTag>
                  )}
                  {isUnconfigured && (
                    <MyTag colorSchema="blue" type="fill">
                      {t('app:wait_for_config')}
                    </MyTag>
                  )}
                  {isDebugTool && <DebugToolTag />}
                </>
              ) : undefined
            }
            actions={
              <>
                {!hasToolError && (
                  <MyIconButton
                    icon="common/setting"
                    tip={t('app:tool_param_config')}
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfigTool(item);
                    }}
                  />
                )}
                <MyIconButton
                  icon="delete"
                  hoverBg="red.50"
                  hoverColor="red.600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTool((item.pluginId || item.id)!, item.source);
                  }}
                />
              </>
            }
            flexProps={
              compact
                ? undefined
                : {
                    h: cardHeight,
                    px: 3,
                    py: 0,
                    boxShadow: 'none',
                    borderRadius: 'md'
                  }
            }
          />
        );
      })}
    </>
  );
});

export default SelectedToolCardList;
