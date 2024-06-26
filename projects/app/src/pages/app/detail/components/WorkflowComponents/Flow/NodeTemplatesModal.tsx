import React, { useCallback, useMemo, useState } from 'react';
import { Box, Flex, IconButton, Input, InputGroup, InputLeftElement, css } from '@chakra-ui/react';
import type {
  FlowNodeTemplateType,
  nodeTemplateListType
} from '@fastgpt/global/core/workflow/type/index.d';
import { useViewport, XYPosition } from 'reactflow';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@/components/Avatar';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getPreviewPluginNode, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { workflowNodeTemplateList } from '@fastgpt/web/core/workflow/constants';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../context';
import { useI18n } from '@/web/context/I18n';
import { getTeamPlugTemplates } from '@/web/core/app/api/plugin';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import FolderPath from '@/components/common/folder/Path';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useWorkflowUtils } from './hooks/useUtils';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};
type RenderListProps = {
  templates: FlowNodeTemplateType[];
  onClose: () => void;
  parentId: ParentIdType;
  setParentId: React.Dispatch<React.SetStateAction<ParentIdType>>;
};

enum TemplateTypeEnum {
  'basic' = 'basic',
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const sliderWidth = 390;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');
  const { feConfigs } = useSystemStore();
  const { basicNodeTemplates, hasToolNode, nodeList } = useContextSelector(
    WorkflowContext,
    (v) => v
  );
  const [pluginBuffer, setPluginBuffer] = useState<{
    systemPlugin: FlowNodeTemplateType[];
    teamPlugin: FlowNodeTemplateType[];
  }>({
    [TemplateTypeEnum.systemPlugin]: [],
    [TemplateTypeEnum.teamPlugin]: []
  });

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const { data: templates = [], loading } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.basic) {
        return basicNodeTemplates.filter((item) => {
          // unique node filter
          if (item.unique) {
            const nodeExist = nodeList.some((node) => node.flowNodeType === item.flowNodeType);
            if (nodeExist) {
              return false;
            }
          }
          // special node filter
          if (item.flowNodeType === FlowNodeTypeEnum.lafModule && !feConfigs.lafEnv) {
            return false;
          }
          // tool stop
          if (!hasToolNode && item.flowNodeType === FlowNodeTypeEnum.stopTool) {
            return false;
          }
          return true;
        });
      }
      if (templateType === TemplateTypeEnum.systemPlugin) {
        if (pluginBuffer.systemPlugin.length === 0) {
          return getSystemPlugTemplates().then((res) => {
            setPluginBuffer((state) => ({
              ...state,
              systemPlugin: res
            }));
            return res;
          });
        } else {
          return pluginBuffer.systemPlugin;
        }
      }
      if (templateType === TemplateTypeEnum.teamPlugin) {
        if (pluginBuffer.teamPlugin.length === 0) {
          return getTeamPlugTemplates({
            parentId,
            searchKey,
            type: [AppTypeEnum.folder, AppTypeEnum.httpPlugin, AppTypeEnum.plugin]
          }).then((res) => {
            setPluginBuffer((state) => ({
              ...state,
              teamPlugin: res
            }));
            return res;
          });
        } else {
          return pluginBuffer.teamPlugin;
        }
      }
      return [];
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [basicNodeTemplates, nodeList, hasToolNode, templateType, searchKey, parentId]
    }
  );

  const { data: paths = [] } = useRequest2(() => getAppFolderPath(parentId), {
    manual: false,
    refreshDeps: [parentId]
  });

  const Render = useMemo(() => {
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
          fontSize={'sm'}
        />
        <MyBox
          isLoading={loading}
          display={'flex'}
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
          <Box pl={'20px'} mb={3} pr={'10px'} whiteSpace={'nowrap'} overflow={'hidden'}>
            <Flex flex={'1 0 0'} alignItems={'center'} gap={3}>
              <FillRowTabs
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
                onChange={(e) => setTemplateType(e as TemplateTypeEnum)}
              />
              {/* close icon */}
              <IconButton
                size={'sm'}
                icon={<MyIcon name={'common/backFill'} w={'14px'} color={'myGray.700'} />}
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
                    onChange={(e) => setSearchKey(e.target.value)}
                  />
                </InputGroup>
                <Box flex={1} />
                <Flex
                  alignItems={'center'}
                  cursor={'pointer'}
                  _hover={{
                    color: 'primary.600'
                  }}
                  fontSize={'sm'}
                  onClick={() => router.push('/app/list')}
                >
                  <Box>去创建</Box>
                  <MyIcon name={'common/rightArrowLight'} w={'14px'} />
                </Flex>
              </Flex>
            )}
            {templateType === TemplateTypeEnum.teamPlugin && !searchKey && parentId && (
              <Flex alignItems={'center'} mt={2}>
                <FolderPath paths={paths} FirstPathDom={null} onClick={setParentId} />
              </Flex>
            )}
          </Box>
          <RenderList
            templates={templates}
            onClose={onClose}
            parentId={parentId}
            setParentId={setParentId}
          />
        </MyBox>
      </>
    );
  }, [isOpen, onClose, loading, t, templateType, searchKey, parentId, paths, templates, router]);

  return Render;
};

export default React.memo(NodeTemplatesModal);

const RenderList = React.memo(function RenderList({
  templates,
  onClose,
  parentId,
  setParentId
}: RenderListProps) {
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { isPc } = useSystemStore();
  const { x, y, zoom } = useViewport();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();
  const reactFlowWrapper = useContextSelector(WorkflowContext, (v) => v.reactFlowWrapper);
  const setNodes = useContextSelector(WorkflowContext, (v) => v.setNodes);
  const { computedNewNodeName } = useWorkflowUtils();

  const formatTemplates = useMemo<nodeTemplateListType>(() => {
    const copy: nodeTemplateListType = JSON.parse(JSON.stringify(workflowNodeTemplateList(t)));
    templates.forEach((item) => {
      const index = copy.findIndex((template) => template.type === item.templateType);
      if (index === -1) return;
      copy[index].list.push(item);
    });
    return copy.filter((item) => item.list.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, parentId]);

  const onAddNode = useCallback(
    async ({ template, position }: { template: FlowNodeTemplateType; position: XYPosition }) => {
      if (!reactFlowWrapper?.current) return;

      const templateNode = await (async () => {
        try {
          // get plugin preview module
          if (template.flowNodeType === FlowNodeTypeEnum.pluginModule) {
            setLoading(true);
            const res = await getPreviewPluginNode({ appId: template.id });

            setLoading(false);
            return res;
          }

          // base node
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

      const node = nodeTemplate2FlowNode({
        template: {
          ...templateNode,
          name: computedNewNodeName({
            templateName: t(templateNode.name),
            flowNodeType: templateNode.flowNodeType,
            pluginId: templateNode.pluginId
          }),
          intro: t(templateNode.intro || '')
        },
        position: { x: mouseX, y: mouseY - 20 },
        selected: true
      });

      setNodes((state) =>
        state
          .map((node) => ({
            ...node,
            selected: false
          }))
          // @ts-ignore
          .concat(node)
      );
    },
    [computedNewNodeName, reactFlowWrapper, setLoading, setNodes, t, toast, x, y, zoom]
  );

  const Render = useMemo(() => {
    return templates.length === 0 ? (
      <EmptyTip text={appT('module.No Modules')} />
    ) : (
      <Box flex={'1 0 0'} overflow={'overlay'} px={'20px'}>
        <Box mx={'auto'}>
          {formatTemplates.map((item, i) => (
            <Box
              key={item.type}
              css={css({
                span: {
                  display: 'block'
                }
              })}
            >
              {item.label && (
                <Flex>
                  <Box fontSize={'sm'} fontWeight={'bold'} flex={1}>
                    {t(item.label)}
                  </Box>
                </Flex>
              )}

              <>
                {item.list.map((template) => (
                  <MyTooltip
                    key={template.id}
                    placement={'right'}
                    label={
                      <Box>
                        <Flex alignItems={'center'}>
                          <Avatar
                            src={template.avatar}
                            w={'24px'}
                            objectFit={'contain'}
                            borderRadius={'0'}
                          />
                          <Box fontWeight={'bold'} ml={3}>
                            {t(template.name)}
                          </Box>
                        </Flex>
                        <Box mt={2}>{t(template.intro || 'core.workflow.Not intro')}</Box>
                      </Box>
                    }
                  >
                    <Flex
                      alignItems={'center'}
                      p={5}
                      cursor={'pointer'}
                      _hover={{ bg: 'myWhite.600' }}
                      borderRadius={'sm'}
                      draggable={template.pluginType !== AppTypeEnum.folder}
                      onDragEnd={(e) => {
                        if (e.clientX < sliderWidth) return;
                        onAddNode({
                          template,
                          position: { x: e.clientX, y: e.clientY }
                        });
                      }}
                      onClick={(e) => {
                        if (
                          template.pluginType === AppTypeEnum.folder ||
                          template.pluginType === AppTypeEnum.httpPlugin
                        ) {
                          return setParentId(template.id);
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
                        w={'1.7rem'}
                        objectFit={'contain'}
                        borderRadius={'0'}
                      />
                      <Box color={'black'} fontSize={'sm'} ml={5} flex={'1 0 0'}>
                        {t(template.name)}
                      </Box>
                    </Flex>
                  </MyTooltip>
                ))}
              </>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [appT, formatTemplates, isPc, onAddNode, onClose, setParentId, t, templates.length]);

  return Render;
});
