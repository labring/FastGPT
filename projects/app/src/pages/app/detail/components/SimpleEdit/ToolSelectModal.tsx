import React, { useMemo, useState } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, ModalBody } from '@chakra-ui/react';
import RowTabs from '@fastgpt/web/components/common/Tabs/RowTabs';
import { useWorkflowStore } from '@/web/core/workflow/store/workflow';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useQuery } from '@tanstack/react-query';
import EmptyTip from '@/components/EmptyTip';
import { FlowNodeTemplateType } from '@fastgpt/global/core/module/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { AddIcon } from '@chakra-ui/icons';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import MyBox from '@/components/common/MyBox';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

type Props = {
  selectedTools: FlowNodeTemplateType[];
  onAddTool: (tool: FlowNodeTemplateType) => void;
  onRemoveTool: (tool: FlowNodeTemplateType) => void;
};

enum TemplateTypeEnum {
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const ToolSelectModal = ({ onClose, ...props }: Props & { onClose: () => void }) => {
  const { t } = useTranslation();
  const {
    systemNodeTemplates,
    loadSystemNodeTemplates,
    teamPluginNodeTemplates,
    loadTeamPluginNodeTemplates
  } = useWorkflowStore();

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.teamPlugin);

  const templates = useMemo(() => {
    const map = {
      [TemplateTypeEnum.systemPlugin]: systemNodeTemplates.filter((item) => item.isTool),
      [TemplateTypeEnum.teamPlugin]: teamPluginNodeTemplates
    };
    return map[templateType];
  }, [systemNodeTemplates, teamPluginNodeTemplates, templateType]);

  const { mutate: onChangeTab } = useRequest({
    mutationFn: async (e: any) => {
      const val = e as TemplateTypeEnum;
      if (val === TemplateTypeEnum.systemPlugin) {
        await loadSystemNodeTemplates();
      } else if (val === TemplateTypeEnum.teamPlugin) {
        await loadTeamPluginNodeTemplates();
      }
      setTemplateType(val);
    },
    errorToast: t('core.module.templates.Load plugin error')
  });

  useQuery(['systemNodeTemplates'], () => loadTeamPluginNodeTemplates());

  return (
    <MyModal
      isOpen
      title={t('core.app.Tool call')}
      iconSrc="core/app/toolCall"
      onClose={onClose}
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
      overflow={'none'}
    >
      <Box px={[3, 6]} pt={4}>
        <RowTabs
          list={[
            {
              icon: 'core/modules/teamPlugin',
              label: t('core.module.template.Team Plugin'),
              value: TemplateTypeEnum.teamPlugin
            },
            {
              icon: 'core/modules/systemPlugin',
              label: t('core.module.template.System Plugin'),
              value: TemplateTypeEnum.systemPlugin
            }
          ]}
          py={'5px'}
          px={'15px'}
          value={templateType}
          onChange={onChangeTab}
        />
      </Box>
      <Box mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList templates={templates} {...props} />
      </Box>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  selectedTools,
  onAddTool,
  onRemoveTool
}: Props & { templates: FlowNodeTemplateType[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { mutate: onClickAdd, isLoading } = useRequest({
    mutationFn: async (template: FlowNodeTemplateType) => {
      const res = await getPreviewPluginModule(template.id);
      // check inputs valid
      for (const input of res.inputs) {
        if ([ModuleInputKeyEnum.switch, ModuleInputKeyEnum.pluginId].includes(input.key as any))
          continue;
        if (input.type === FlowNodeInputTypeEnum.target && !input.toolDescription) {
          return toast({
            status: 'warning',
            title: t('core.app.ToolCall.This plugin cannot be called as a tool')
          });
        }
      }
      return res;
    },
    onSuccess(res: FlowNodeTemplateType) {
      onAddTool(res);
    },
    errorToast: t('core.module.templates.Load plugin error')
  });

  return templates.length === 0 ? (
    <EmptyTip text={t('core.app.ToolCall.No plugin')} />
  ) : (
    <MyBox isLoading={isLoading}>
      {templates.map((item, i) => {
        const selected = !!selectedTools.find((tool) => tool.id === item.id);
        return (
          <Flex
            key={item.id}
            alignItems={'center'}
            p={[4, 5]}
            _notLast={{
              borderBottomWidth: '1px',
              borderBottomColor: 'myGray.150'
            }}
          >
            <Avatar
              src={item.avatar}
              w={['26px', '32px']}
              objectFit={'contain'}
              borderRadius={'0'}
            />
            <Box ml={5} flex={'1 0 0'}>
              <Box color={'black'}>{t(item.name)}</Box>
              <Box className="textEllipsis3" color={'myGray.500'} fontSize={['xs', 'sm']}>
                {t(item.intro)}
              </Box>
            </Box>
            {selected ? (
              <Button
                size={'sm'}
                variant={'grayDanger'}
                leftIcon={<MyIcon name={'delete'} w={'14px'} />}
                onClick={() => onRemoveTool(item)}
              >
                {t('common.Remove')}
              </Button>
            ) : (
              <Button
                size={'sm'}
                variant={'whiteBase'}
                leftIcon={<AddIcon fontSize={'10px'} />}
                onClick={() => onClickAdd(item)}
              >
                {t('common.Add')}
              </Button>
            )}
          </Flex>
        );
      })}
    </MyBox>
  );
});
