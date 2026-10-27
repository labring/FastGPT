import { Box, Flex, Grid } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { PluginStatusEnum, PluginStatusMap } from '@fastgpt/global/core/plugin/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import DebugToolTag from '@fastgpt/web/components/core/plugin/tool/DebugToolTag';
import { getSelectedToolCardState } from './SelectedToolCard.utils';

type Props = {
  tool: SelectedToolItemType;
  onConfig?: (tool: SelectedToolItemType) => void;
  onDelete?: (tool: SelectedToolItemType) => void;
};

/**
 * Agent 工具卡片。
 * 统一展示工具的错误态（已删除/无权限/已停用）与待配置态，Agent V2 与工作流 Agent 节点复用。
 */
const SelectedToolCard = ({ tool, onConfig, onDelete }: Props) => {
  const { t } = useTranslation();
  const { status, errorMessage, hasToolError, isWaitingForConfig, isDebugTool } =
    getSelectedToolCardState({ tool, t });

  return (
    <MyTooltip label={errorMessage || tool.intro}>
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
        <Avatar src={tool.avatar} w={'28px'} h={'28px'} borderRadius={'sm'} />
        <MyTooltip label={tool.name} showOnlyWhenOverflow shouldWrapChildren={false}>
          <Box
            minW={0}
            className={'textEllipsis'}
            fontSize={'sm'}
            color={hasToolError ? 'red.600' : 'myGray.900'}
          >
            {tool.name}
          </Box>
        </MyTooltip>

        <Flex gap={1} minW={0} justifySelf={'end'} alignItems={'center'}>
          {status === PluginStatusEnum.SoonOffline && (
            <MyTooltip label={t('app:tool_soon_offset_tips')}>
              <MyTag
                display={'block'}
                className="unHoverStyle"
                colorSchema={PluginStatusMap[status].tagColor}
                type="borderFill"
              >
                {t('app:toolkit_status_soon_offline')}
              </MyTag>
            </MyTooltip>
          )}
          {hasToolError && (
            <MyTag colorSchema="red" type="fill" className="unHoverStyle">
              <MyIcon name={'common/error'} w={'14px'} mr={1} />
              <Box color={'red.600'} maxW={'150px'} className="textEllipsis">
                {errorMessage}
              </Box>
            </MyTag>
          )}
          {isWaitingForConfig && (
            <MyTag colorSchema="blue" type="fill" className="unHoverStyle">
              {t('app:wait_for_config')}
            </MyTag>
          )}
          {isDebugTool && <DebugToolTag className="unHoverStyle" />}
          {onConfig && !hasToolError && (
            <MyIconButton
              className="hoverStyle"
              display={'none'}
              icon="common/setting"
              tip={t('app:tool_param_config')}
              onClick={(e) => {
                e.stopPropagation();
                onConfig(tool);
              }}
            />
          )}
          {onDelete && (
            <Box className="delete" display={['flex', 'none']} ml={0.5}>
              <MyIconButton
                icon="delete"
                hoverBg="red.50"
                hoverColor="red.600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(tool);
                }}
              />
            </Box>
          )}
        </Flex>
      </Grid>
    </MyTooltip>
  );
};

export default SelectedToolCard;
