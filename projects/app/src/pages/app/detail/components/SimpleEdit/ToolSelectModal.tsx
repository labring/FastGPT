import React, { useMemo, useState } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  ModalBody
} from '@chakra-ui/react';
import RowTabs from '@fastgpt/web/components/common/Tabs/RowTabs';
import { useWorkflowStore } from '@/web/core/workflow/store/workflow';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import ParentPaths from '@/components/common/ParentPaths';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import { debounce } from 'lodash';

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
  const [currentParent, setCurrentParent] = useState<{
    parentId: string;
    parentName: string;
  }>();
  const [searchKey, setSearchKey] = useState('');

  const templates = useMemo(() => {
    const map = {
      [TemplateTypeEnum.systemPlugin]: systemNodeTemplates.filter(
        (item) => item.isTool && item.name.toLowerCase().includes(searchKey.toLowerCase())
      ),
      [TemplateTypeEnum.teamPlugin]: teamPluginNodeTemplates.filter((item) =>
        searchKey ? item.pluginType !== PluginTypeEnum.folder : true
      )
    };
    return map[templateType];
  }, [searchKey, systemNodeTemplates, teamPluginNodeTemplates, templateType]);

  const { mutate: onChangeTab } = useRequest({
    mutationFn: async (e: any) => {
      const val = e as TemplateTypeEnum;
      if (val === TemplateTypeEnum.systemPlugin) {
        await loadSystemNodeTemplates();
      } else if (val === TemplateTypeEnum.teamPlugin) {
        await loadTeamPluginNodeTemplates({
          parentId: currentParent?.parentId
        });
      }
      setTemplateType(val);
    },
    errorToast: t('core.module.templates.Load plugin error')
  });

  const { isLoading } = useQuery(['teamNodeTemplate', currentParent?.parentId, searchKey], () =>
    loadTeamPluginNodeTemplates({
      parentId: currentParent?.parentId,
      searchKey,
      init: true
    })
  );

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
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'space-between'} w={'full'}>
        <RowTabs
          list={[
            {
              icon: 'core/modules/teamPlugin',
              label: t('core.app.ToolCall.Team'),
              value: TemplateTypeEnum.teamPlugin
            },
            {
              icon: 'core/modules/systemPlugin',
              label: t('core.app.ToolCall.System'),
              value: TemplateTypeEnum.systemPlugin
            }
          ]}
          py={'5px'}
          px={'15px'}
          value={templateType}
          onChange={onChangeTab}
        />
        <InputGroup w={300}>
          <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
            <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
          </InputLeftElement>
          <Input
            bg={'myGray.50'}
            placeholder={t('plugin.Search plugin')}
            onChange={debounce((e) => setSearchKey(e.target.value), 200)}
          />
        </InputGroup>
      </Box>
      {templateType === TemplateTypeEnum.teamPlugin && !searchKey && currentParent && (
        <Flex mt={2} px={[3, 6]}>
          <ParentPaths
            paths={[currentParent]}
            FirstPathDom={null}
            onClick={() => {
              setCurrentParent(undefined);
            }}
            fontSize="md"
          />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList
          templates={templates}
          isLoadingData={isLoading}
          setCurrentParent={setCurrentParent}
          {...props}
        />
      </MyBox>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  selectedTools,
  isLoadingData,
  onAddTool,
  onRemoveTool,
  setCurrentParent
}: Props & {
  templates: FlowNodeTemplateType[];
  isLoadingData: boolean;
  setCurrentParent: (e: { parentId: string; parentName: string }) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { mutate: onClickAdd, isLoading } = useRequest({
    mutationFn: async (template: FlowNodeTemplateType) => {
      const res = await getPreviewPluginModule(template.id);

      // check inputs valid
      for (const input of res.inputs) {
        if (
          [
            ModuleInputKeyEnum.switch,
            ModuleInputKeyEnum.pluginStart,
            ModuleInputKeyEnum.pluginId
          ].includes(input.key as any)
        ) {
          continue;
        }

        if (!input.toolDescription) {
          return toast({
            status: 'warning',
            title: t('core.app.ToolCall.This plugin cannot be called as a tool')
          });
        }
      }
      return res;
    },
    onSuccess(res: FlowNodeTemplateType) {
      res && onAddTool(res);
    },
    errorToast: t('core.module.templates.Load plugin error')
  });

  return templates.length === 0 && !isLoadingData ? (
    <EmptyTip text={t('core.app.ToolCall.No plugin')} />
  ) : (
    <MyBox>
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
            _hover={{
              bg: 'myGray.50'
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
            ) : item.pluginType === PluginTypeEnum.folder ? (
              <Button
                size={'sm'}
                variant={'whiteBase'}
                onClick={() => setCurrentParent({ parentId: item.id, parentName: item.name })}
              >
                {t('common.Open')}
              </Button>
            ) : (
              <Button
                size={'sm'}
                variant={'whiteBase'}
                leftIcon={<AddIcon fontSize={'10px'} />}
                isLoading={isLoading}
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
