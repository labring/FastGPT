import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Divider,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  css
} from '@chakra-ui/react';
import type {
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node.d';
import { useViewport, XYPosition } from 'reactflow';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getPreviewPluginNode,
  getSystemPlugTemplates,
  getSystemPluginPaths
} from '@/web/core/app/api/plugin';
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
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { cloneDeep } from 'lodash';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';

type ModuleTemplateListProps = {
  isOpen: boolean;
  onClose: () => void;
};
type RenderListProps = {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  onClose: () => void;
  parentId: ParentIdType;
  setParentId: React.Dispatch<React.SetStateAction<ParentIdType>>;
};

enum TemplateTypeEnum {
  'basic' = 'basic',
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const sliderWidth = 420;

const NodeTemplatesModal = ({ isOpen, onClose }: ModuleTemplateListProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');
  const { feConfigs } = useSystemStore();
  const { basicNodeTemplates, hasToolNode, nodeList, appId } = useContextSelector(
    WorkflowContext,
    (v) => v
  );

  const [templateType, setTemplateType] = useState(TemplateTypeEnum.basic);

  const { data: basicNodes } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.basic) {
        return basicNodeTemplates
          .filter((item) => {
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
          })
          .map<NodeTemplateListItemType>((item) => ({
            id: item.id,
            flowNodeType: item.flowNodeType,
            templateType: item.templateType,
            avatar: item.avatar,
            name: item.name,
            intro: item.intro
          }));
      }
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [basicNodeTemplates, nodeList, hasToolNode, templateType, searchKey, parentId]
    }
  );
  const { data: teamAndSystemApps, loading: isLoadingTeamApp } = useRequest2(
    async () => {
      if (templateType === TemplateTypeEnum.teamPlugin) {
        return getTeamPlugTemplates({
          parentId,
          searchKey,
          type: [AppTypeEnum.folder, AppTypeEnum.httpPlugin, AppTypeEnum.plugin]
        }).then((res) => res.filter((app) => app.id !== appId));
      }
      if (templateType === TemplateTypeEnum.systemPlugin) {
        return getSystemPlugTemplates({
          searchKey,
          parentId
        });
      }
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [templateType, searchKey, parentId]
    }
  );

  const isLoading = isLoadingTeamApp;
  const templates = useMemo(
    () => basicNodes || teamAndSystemApps || [],
    [basicNodes, teamAndSystemApps]
  );

  useEffect(() => {
    setParentId('');
  }, [templateType, searchKey]);

  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.teamPlugin) return getAppFolderPath(parentId);
      return getSystemPluginPaths(parentId);
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

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
          maxW={'100%'}
          onClick={onClose}
          fontSize={'sm'}
        />
        <MyBox
          isLoading={isLoading}
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
          {/* Header */}
          <Box pl={'20px'} mb={3} pr={'10px'} whiteSpace={'nowrap'} overflow={'hidden'}>
            {/* Tabs */}
            <Flex flex={'1 0 0'} alignItems={'center'} gap={3}>
              <Box flex={'1 0 0'}>
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
                  width={'100%'}
                  py={'5px'}
                  value={templateType}
                  onChange={(e) => setTemplateType(e as TemplateTypeEnum)}
                />
              </Box>
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
            {/* Search */}
            {(templateType === TemplateTypeEnum.teamPlugin ||
              templateType === TemplateTypeEnum.systemPlugin) && (
              <Flex mt={2} alignItems={'center'} h={10}>
                <InputGroup mr={4} h={'full'}>
                  <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
                    <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
                  </InputLeftElement>
                  <Input
                    h={'full'}
                    bg={'myGray.50'}
                    placeholder={t('common:plugin.Search plugin')}
                    onChange={(e) => setSearchKey(e.target.value)}
                  />
                </InputGroup>
                <Box flex={1} />
                {templateType === TemplateTypeEnum.teamPlugin && (
                  <Flex
                    alignItems={'center'}
                    cursor={'pointer'}
                    _hover={{
                      color: 'primary.600'
                    }}
                    fontSize={'sm'}
                    onClick={() => router.push('/app/list')}
                    gap={1}
                  >
                    <Box>去创建</Box>
                    <MyIcon name={'common/rightArrowLight'} w={'0.8rem'} />
                  </Flex>
                )}
                {templateType === TemplateTypeEnum.systemPlugin &&
                  feConfigs.systemPluginCourseUrl && (
                    <Flex
                      alignItems={'center'}
                      cursor={'pointer'}
                      _hover={{
                        color: 'primary.600'
                      }}
                      fontSize={'sm'}
                      onClick={() => window.open(feConfigs.systemPluginCourseUrl)}
                      gap={1}
                    >
                      <Box>贡献插件</Box>
                      <MyIcon name={'common/rightArrowLight'} w={'0.8rem'} />
                    </Flex>
                  )}
              </Flex>
            )}
            {/* paths */}
            {(templateType === TemplateTypeEnum.teamPlugin ||
              templateType === TemplateTypeEnum.systemPlugin) &&
              !searchKey &&
              parentId && (
                <Flex alignItems={'center'} mt={2}>
                  <FolderPath paths={paths} FirstPathDom={null} onClick={setParentId} />
                </Flex>
              )}
          </Box>
          <RenderList
            templates={templates}
            type={templateType}
            onClose={onClose}
            parentId={parentId}
            setParentId={setParentId}
          />
        </MyBox>
      </>
    );
  }, [isOpen, onClose, isLoading, t, templateType, searchKey, parentId, paths, templates, router]);

  return Render;
};

export default React.memo(NodeTemplatesModal);

const RenderList = React.memo(function RenderList({
  templates,
  type,
  onClose,
  parentId,
  setParentId
}: RenderListProps) {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { feConfigs } = useSystemStore();

  const { isPc } = useSystem();
  const isSystemPlugin = type === TemplateTypeEnum.systemPlugin;

  const { x, y, zoom } = useViewport();
  const { setLoading } = useSystemStore();
  const { toast } = useToast();
  const reactFlowWrapper = useContextSelector(WorkflowContext, (v) => v.reactFlowWrapper);
  const setNodes = useContextSelector(WorkflowContext, (v) => v.setNodes);
  const { computedNewNodeName } = useWorkflowUtils();

  const formatTemplates = useMemo<NodeTemplateListType>(() => {
    const copy: NodeTemplateListType = cloneDeep(workflowNodeTemplateList);
    templates.forEach((item) => {
      const index = copy.findIndex((template) => template.type === item.templateType);
      if (index === -1) return;
      copy[index].list.push(item);
    });
    return copy.filter((item) => item.list.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, parentId]);

  const onAddNode = useCallback(
    async ({
      template,
      position
    }: {
      template: NodeTemplateListItemType;
      position: XYPosition;
    }) => {
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
          const baseTemplate = moduleTemplatesFlat.find((item) => item.id === template.id);
          if (!baseTemplate) {
            throw new Error('baseTemplate not found');
          }
          return { ...baseTemplate };
        } catch (e) {
          toast({
            status: 'error',
            title: getErrText(e, t('common:core.plugin.Get Plugin Module Detail Failed'))
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
            templateName: t(templateNode.name as any),
            flowNodeType: templateNode.flowNodeType,
            pluginId: templateNode.pluginId
          }),
          intro: t(templateNode.intro as any)
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
              {item.label && formatTemplates.length > 1 && (
                <Flex>
                  <Box fontSize={'sm'} fontWeight={'500'} flex={1} color={'myGray.900'}>
                    {t(item.label as any)}
                  </Box>
                </Flex>
              )}

              <>
                {item.list.map((template) => (
                  <MyTooltip
                    key={template.id}
                    placement={'right'}
                    label={
                      <Box py={2}>
                        <Flex alignItems={'center'}>
                          <Avatar
                            src={template.avatar}
                            w={'1.75rem'}
                            objectFit={'contain'}
                            borderRadius={'sm'}
                          />
                          <Box fontWeight={'bold'} ml={3} color={'myGray.900'}>
                            {t(template.name as any)}
                          </Box>
                        </Flex>
                        <Box mt={2} color={'myGray.500'}>
                          {t(template.intro as any) || t('common:core.workflow.Not intro')}
                        </Box>
                        {isSystemPlugin && <CostTooltip cost={template.currentCost} />}
                      </Box>
                    }
                  >
                    <Flex
                      alignItems={'center'}
                      py={4}
                      px={3}
                      cursor={'pointer'}
                      _hover={{ bg: 'myWhite.600' }}
                      borderRadius={'sm'}
                      draggable={!template.isFolder}
                      onDragEnd={(e) => {
                        if (e.clientX < sliderWidth) return;
                        onAddNode({
                          template,
                          position: { x: e.clientX, y: e.clientY }
                        });
                      }}
                      onClick={(e) => {
                        if (template.isFolder) {
                          return setParentId(template.id);
                        }
                        if (isPc) {
                          return onAddNode({
                            template,
                            position: { x: sliderWidth * 1.5, y: 200 }
                          });
                        }
                        onAddNode({
                          template,
                          position: { x: e.clientX, y: e.clientY }
                        });
                        onClose();
                      }}
                    >
                      <Avatar
                        src={template.avatar}
                        w={'2rem'}
                        objectFit={'contain'}
                        borderRadius={'md'}
                      />
                      <Box
                        color={'myGray.900'}
                        fontWeight={'500'}
                        fontSize={'sm'}
                        ml={3}
                        flex={'1 0 0'}
                      >
                        {t(template.name as any)}
                      </Box>
                      {template.author !== undefined && (
                        <Box fontSize={'xs'} color={'myGray.500'}>
                          {`by ${template.author || feConfigs.systemTitle}`}
                        </Box>
                      )}
                    </Flex>
                  </MyTooltip>
                ))}
              </>
            </Box>
          ))}
        </Box>
      </Box>
    );
  }, [
    appT,
    formatTemplates,
    isPc,
    isSystemPlugin,
    onAddNode,
    onClose,
    setParentId,
    t,
    templates.length
  ]);

  return Render;
});
