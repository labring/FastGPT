import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, IconButton, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import type {
  FlowNodeTemplateType,
  moduleTemplateListType
} from '@fastgpt/global/core/module/type.d';
import { useViewport, XYPosition } from 'reactflow';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@/components/Avatar';
import { onSetNodes, useFlowProviderStore } from './FlowProvider';
import { customAlphabet } from 'nanoid';
import { appModule2FlowNode } from '@/utils/adapt';
import { useTranslation } from 'next-i18next';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import EmptyTip from '@/components/EmptyTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { moduleTemplatesList } from '@fastgpt/global/core/module/template/constants';
import RowTabs from '@fastgpt/web/components/common/Tabs/RowTabs';
import { useWorkflowStore } from '@/web/core/workflow/store/workflow';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import ParentPaths from '@/components/common/ParentPaths';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
import { useQuery } from '@tanstack/react-query';
import { debounce } from 'lodash';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};
type RenderListProps = {
  templates: FlowNodeTemplateType[];
  onClose: () => void;
  currentParent?: { parentId: string; parentName: string };
  setCurrentParent: (e: { parentId: string; parentName: string }) => void;
};

enum TemplateTypeEnum {
  'basic' = 'basic',
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const sliderWidth = 380;

const ModuleTemplateList = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [currentParent, setCurrentParent] = useState<RenderListProps['currentParent']>();
  const [searchKey, setSearchKey] = useState('');
  const { feConfigs } = useSystemStore();

  const {
    basicNodeTemplates,
    systemNodeTemplates,
    loadSystemNodeTemplates,
    teamPluginNodeTemplates,
    loadTeamPluginNodeTemplates
  } = useWorkflowStore();
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const templates = useMemo(() => {
    const map = {
      [TemplateTypeEnum.basic]: basicNodeTemplates.filter((item) => {
        if (item.flowType === FlowNodeTypeEnum.lafModule && !feConfigs.lafEnv) {
          return false;
        }
        return true;
      }),
      [TemplateTypeEnum.systemPlugin]: systemNodeTemplates,
      [TemplateTypeEnum.teamPlugin]: teamPluginNodeTemplates.filter((item) =>
        searchKey ? item.pluginType !== PluginTypeEnum.folder : true
      )
    };
    return JSON.stringify(map[templateType]);
  }, [basicNodeTemplates, searchKey, systemNodeTemplates, teamPluginNodeTemplates, templateType]);

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

  useQuery(['teamNodeTemplate', currentParent?.parentId, searchKey], () =>
    loadTeamPluginNodeTemplates({
      parentId: currentParent?.parentId,
      searchKey,
      init: true
    })
  );

  const Render = useMemo(() => {
    const parseTemplates = JSON.parse(templates) as FlowNodeTemplateType[];
    return (
      <>
        <Box
          zIndex={2}
          display={isOpen ? 'block' : 'none'}
          position={'absolute'}
          top={0}
          left={0}
          bottom={0}
          w={`${sliderWidth}px`}
          onClick={onClose}
        />
        <Flex
          zIndex={3}
          flexDirection={'column'}
          position={'absolute'}
          top={'10px'}
          left={0}
          pt={'20px'}
          pb={4}
          h={isOpen ? 'calc(100% - 20px)' : '0'}
          w={isOpen ? ['100%', `${sliderWidth}px`] : '0'}
          bg={'white'}
          boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
          borderRadius={'0 20px 20px 0'}
          transition={'.2s ease'}
          userSelect={'none'}
          overflow={isOpen ? 'none' : 'hidden'}
        >
          <Box mb={2} pl={'20px'} pr={'10px'} whiteSpace={'nowrap'} overflow={'hidden'}>
            <Flex flex={'1 0 0'} alignItems={'center'} gap={3}>
              <RowTabs
                list={[
                  {
                    icon: 'core/modules/basicNode',
                    label: t('core.module.template.Basic Node'),
                    value: TemplateTypeEnum.basic
                  },
                  {
                    icon: 'core/modules/systemPlugin',
                    label: t('core.module.template.System Plugin'),
                    value: TemplateTypeEnum.systemPlugin
                  },
                  {
                    icon: 'core/modules/teamPlugin',
                    label: t('core.module.template.Team Plugin'),
                    value: TemplateTypeEnum.teamPlugin
                  }
                ]}
                py={'5px'}
                value={templateType}
                onChange={onChangeTab}
              />
              {/* close icon */}
              <IconButton
                size={'sm'}
                icon={<MyIcon name={'common/backFill'} w={'14px'} color={'myGray.700'} />}
                w={'26px'}
                h={'26px'}
                borderColor={'myGray.300'}
                variant={'grayBase'}
                aria-label={''}
                onClick={onClose}
              />
            </Flex>
            {templateType === TemplateTypeEnum.teamPlugin && (
              <Flex mt={2} alignItems={'center'} h={10}>
                <InputGroup mr={4} h={'full'}>
                  <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
                    <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
                  </InputLeftElement>
                  <Input
                    h={'full'}
                    bg={'myGray.50'}
                    placeholder={t('plugin.Search plugin')}
                    onChange={debounce((e) => setSearchKey(e.target.value), 200)}
                  />
                </InputGroup>
                <Box flex={1} />
                <Flex
                  alignItems={'center'}
                  cursor={'pointer'}
                  _hover={{
                    color: 'primary.600'
                  }}
                  onClick={() => router.push('/plugin/list')}
                >
                  <Box>去创建</Box>
                  <MyIcon name={'common/rightArrowLight'} w={'14px'} />
                </Flex>
              </Flex>
            )}
            {templateType === TemplateTypeEnum.teamPlugin && !searchKey && currentParent && (
              <Flex alignItems={'center'} mt={2}>
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
          </Box>
          <RenderList
            templates={parseTemplates}
            onClose={onClose}
            currentParent={currentParent}
            setCurrentParent={setCurrentParent}
          />
        </Flex>
      </>
    );
  }, [currentParent, isOpen, onChangeTab, onClose, router, searchKey, t, templateType, templates]);

  return Render;
};

export default React.memo(ModuleTemplateList);

const RenderList = React.memo(function RenderList({
  templates,
  onClose,
  currentParent,
  setCurrentParent
}: RenderListProps) {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const { x, y, zoom } = useViewport();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();
  const { reactFlowWrapper, nodes } = useFlowProviderStore();

  const formatTemplates = useMemo<moduleTemplateListType>(() => {
    const copy: moduleTemplateListType = JSON.parse(JSON.stringify(moduleTemplatesList));
    templates.forEach((item) => {
      const index = copy.findIndex((template) => template.type === item.templateType);
      if (index === -1) return;
      copy[index].list.push(item);
    });
    return copy.filter((item) => item.list.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, currentParent]);

  const onAddNode = useCallback(
    async ({ template, position }: { template: FlowNodeTemplateType; position: XYPosition }) => {
      if (!reactFlowWrapper?.current) return;

      const templateModule = await (async () => {
        try {
          // get plugin preview module
          if (template.flowType === FlowNodeTypeEnum.pluginModule) {
            setLoading(true);
            const res = await getPreviewPluginModule(template.id);

            setLoading(false);
            return res;
          }
          return { ...template };
        } catch (e) {
          toast({
            status: 'error',
            title: getErrText(e, t('core.plugin.Get Plugin Module Detail Failed'))
          });
          setLoading(false);
          return Promise.reject(e);
        }
      })();

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const mouseX = (position.x - reactFlowBounds.left - x) / zoom - 100;
      const mouseY = (position.y - reactFlowBounds.top - y) / zoom;

      onSetNodes(
        nodes.concat(
          appModule2FlowNode({
            item: {
              ...templateModule,
              moduleId: nanoid(),
              position: { x: mouseX, y: mouseY - 20 }
            }
          })
        )
      );
    },
    [nodes, reactFlowWrapper, setLoading, t, toast, x, y, zoom]
  );

  return templates.length === 0 ? (
    <EmptyTip text={t('app.module.No Modules')} />
  ) : (
    <Box flex={'1 0 0'} overflow={'overlay'} px={'20px'}>
      <Box mx={'auto'}>
        {formatTemplates.map((item, i) => (
          <Box key={item.type}>
            {item.label && (
              <Flex>
                <Box fontWeight={'bold'} flex={1}>
                  {t(item.label)}
                </Box>
              </Flex>
            )}

            <>
              {item.list.map((template) => (
                <Flex
                  key={template.id}
                  alignItems={'center'}
                  p={5}
                  cursor={'pointer'}
                  _hover={{ bg: 'myWhite.600' }}
                  borderRadius={'sm'}
                  draggable={template.pluginType !== PluginTypeEnum.folder}
                  onDragEnd={(e) => {
                    if (e.clientX < sliderWidth) return;
                    onAddNode({
                      template: template,
                      position: { x: e.clientX, y: e.clientY }
                    });
                  }}
                  onClick={(e) => {
                    if (template.pluginType === PluginTypeEnum.folder) {
                      return setCurrentParent({
                        parentId: template.id,
                        parentName: template.name
                      });
                    }
                    if (isPc) {
                      return onAddNode({
                        template,
                        position: { x: sliderWidth * 1.5, y: 200 }
                      });
                    }
                    onAddNode({
                      template: template,
                      position: { x: e.clientX, y: e.clientY }
                    });
                    onClose();
                  }}
                >
                  <Avatar
                    src={template.avatar}
                    w={'34px'}
                    objectFit={'contain'}
                    borderRadius={'0'}
                  />
                  <Box ml={5} flex={'1 0 0'}>
                    <Box color={'black'}>{t(template.name)}</Box>
                    <Box className="textEllipsis3" color={'myGray.500'} fontSize={'sm'}>
                      {t(template.intro)}
                    </Box>
                  </Box>
                </Flex>
              ))}
            </>
          </Box>
        ))}
      </Box>
    </Box>
  );
});
