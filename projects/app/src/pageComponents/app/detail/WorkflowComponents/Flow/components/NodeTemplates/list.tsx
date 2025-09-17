import React, { useMemo } from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Grid,
  Flex,
  HStack,
  css
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getPluginGroups, getPreviewPluginNode } from '@/web/core/app/api/plugin';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type {
  FlowNodeItemType,
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node';
import { TemplateTypeEnum } from './header';
import { useMemoizedFn } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';
import {
  FlowNodeTypeEnum,
  AppNodeFlowNodeTypeMap
} from '@fastgpt/global/core/workflow/node/constant';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { workflowSystemNodeTemplateList } from '@fastgpt/web/core/workflow/constants';
import { sliderWidth } from '../../NodeTemplatesModal';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { LoopEndNode } from '@fastgpt/global/core/workflow/template/system/loop/loopEnd';
import { useReactFlow } from 'reactflow';
import type { Node } from 'reactflow';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { WorkflowEventContext } from '../../../context/workflowEventContext';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';

export type TemplateListProps = {
  onAddNode: ({ newNodes }: { newNodes: Node<FlowNodeItemType>[] }) => void;
  isPopover?: boolean;
  templates: NodeTemplateListItemType[];
  templateType: TemplateTypeEnum;
  onUpdateParentId: (parentId: string) => void;
};

const NodeTemplateListItem = ({
  template,
  handleAddNode,
  isPopover,
  onUpdateParentId
}: {
  template: NodeTemplateListItemType;
  templateType: TemplateTypeEnum;
  handleAddNode: (e: {
    template: NodeTemplateListItemType;
    position: { x: number; y: number };
  }) => void;
  isPopover?: boolean;
  onUpdateParentId: (parentId: string) => void;
}) => {
  const { t } = useSafeTranslation();
  const { feConfigs } = useSystemStore();

  const { screenToFlowPosition } = useReactFlow();
  const handleParams = useContextSelector(WorkflowEventContext, (v) => v.handleParams);
  const isToolHandle = handleParams?.handleId === 'selectedTools';

  return (
    <MyTooltip
      placement={'right'}
      label={
        <Box py={2} minW={['auto', '250px']}>
          <Flex alignItems={'center'}>
            <MyAvatar
              src={template.avatar}
              w={'1.75rem'}
              objectFit={'contain'}
              borderRadius={'sm'}
            />
            <Box fontWeight={'bold'} ml={3} color={'myGray.900'} flex={'1'}>
              {template.name}
            </Box>
            <Box color={'myGray.500'}>By {template.author || feConfigs?.systemTitle}</Box>
          </Flex>
          <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
            {template.intro || t('common:core.workflow.Not intro')}
          </Box>
          <CostTooltip
            cost={template.currentCost}
            hasTokenFee={template.hasTokenFee}
            isFolder={template.isFolder}
          />
        </Box>
      }
      shouldWrapChildren={false}
    >
      <Flex
        w={'100%'}
        alignItems={'center'}
        py={isPopover ? 2 : 3}
        px={isPopover ? 2 : 3}
        cursor={'pointer'}
        _hover={{
          bg: 'myWhite.600',
          '& .arrowIcon': {
            display: 'flex'
          }
        }}
        borderRadius={'sm'}
        whiteSpace={'nowrap'}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
        draggable={
          !isPopover && (!template.isFolder || template.flowNodeType === FlowNodeTypeEnum.toolSet)
        }
        onDragEnd={(e) => {
          if (e.clientX < sliderWidth) return;
          const nodePosition = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          handleAddNode({
            template,
            position: { x: nodePosition.x - 100, y: nodePosition.y - 20 }
          });
        }}
        onClick={() => {
          // Not tool handle, cannot add toolset
          if (!isToolHandle && template.flowNodeType === FlowNodeTypeEnum.toolSet) {
            onUpdateParentId(template.id);
            return;
          }
          // Team folder
          if (template.isFolder && template.flowNodeType === FlowNodeTypeEnum.pluginModule) {
            onUpdateParentId(template.id);
            return;
          }
          const position =
            isPopover && handleParams
              ? handleParams.addNodePosition
              : screenToFlowPosition({ x: sliderWidth * 1.5, y: 200 });

          handleAddNode({ template, position });
        }}
      >
        <MyAvatar
          src={template.avatar}
          w={isPopover ? '1.5rem' : '1.75rem'}
          objectFit={'contain'}
          borderRadius={'sm'}
          flexShrink={0}
        />
        <Box
          color={'myGray.900'}
          fontWeight={'500'}
          fontSize={isPopover ? 'xs' : 'sm'}
          flex={'1 0 0'}
          ml={3}
          className="textEllipsis"
        >
          {t(template.name as any)}
        </Box>
        {/* Folder right arrow */}
        {template.isFolder && (
          <Box
            color={'myGray.500'}
            _hover={{
              bg: 'var(--light-general-surface-opacity-005, rgba(17, 24, 36, 0.05))',
              color: 'primary.600'
            }}
            p={1}
            rounded={'sm'}
            className="arrowIcon"
            display="none"
            onClick={(e) => {
              e.stopPropagation();
              onUpdateParentId(template.id);
            }}
          >
            <MyIcon name="common/arrowRight" w={isPopover ? '16px' : '20px'} />
          </Box>
        )}
        {/* Author */}
        {!isPopover && template.authorAvatar && template.author && (
          <HStack spacing={1} maxW={'120px'} flexShrink={0}>
            <MyAvatar src={template.authorAvatar} w={'1rem'} borderRadius={'50%'} />
            <Box fontSize={'xs'} className="textEllipsis">
              {template.author}
            </Box>
          </HStack>
        )}
      </Flex>
    </MyTooltip>
  );
};

const NodeTemplateList = ({
  onAddNode,
  isPopover = false,
  templates,
  templateType,
  onUpdateParentId
}: TemplateListProps) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { computedNewNodeName } = useWorkflowUtils();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const handleParams = useContextSelector(WorkflowEventContext, (v) => v.handleParams);

  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

  const handleAddNode = useMemoizedFn(
    async ({
      template,
      position
    }: {
      template: NodeTemplateListItemType;
      position: { x: number; y: number };
    }) => {
      try {
        const templateNode = await (async () => {
          try {
            if (AppNodeFlowNodeTypeMap[template.flowNodeType]) {
              return await getPreviewPluginNode({ appId: template.id });
            }

            const baseTemplate = moduleTemplatesFlat.find((item) => item.id === template.id);
            if (!baseTemplate) {
              throw new Error('baseTemplate not found');
            }
            return { ...baseTemplate };
          } catch (e) {
            toast({
              status: 'error',
              title: t(getErrText(e, t('common:core.plugin.Get Plugin Module Detail Failed')))
            });
            return Promise.reject(e);
          }
        })();

        const defaultValueMap: Record<string, any> = {
          [NodeInputKeyEnum.userChatInput]: undefined,
          [NodeInputKeyEnum.fileUrlList]: undefined
        };

        nodeList.forEach((node) => {
          if (node.flowNodeType === FlowNodeTypeEnum.workflowStart) {
            defaultValueMap[NodeInputKeyEnum.userChatInput] = [
              node.nodeId,
              NodeOutputKeyEnum.userChatInput
            ];
            defaultValueMap[NodeInputKeyEnum.fileUrlList] = [
              [node.nodeId, NodeOutputKeyEnum.userFiles]
            ];
          }
        });

        const currentNode = nodeList.find((node) => node.nodeId === handleParams?.nodeId);

        const newNode = nodeTemplate2FlowNode({
          template: {
            ...templateNode,
            name: computedNewNodeName({
              templateName: t(templateNode.name as any),
              flowNodeType: templateNode.flowNodeType,
              pluginId: templateNode.pluginId
            }),
            intro: t(templateNode.intro as any),
            inputs: templateNode.inputs
              .filter((input) => input.deprecated !== true)
              .map((input) => ({
                ...input,
                value: defaultValueMap[input.key] ?? input.value ?? input.defaultValue,
                valueDesc: input.valueDesc ? t(input.valueDesc as any) : undefined,
                label: t(input.label as any),
                description: input.description ? t(input.description as any) : undefined,
                placeholder: input.placeholder ? t(input.placeholder as any) : undefined,
                debugLabel: input.debugLabel ? t(input.debugLabel as any) : undefined,
                toolDescription: input.toolDescription ? t(input.toolDescription as any) : undefined
              })),
            outputs: templateNode.outputs
              .filter((output) => output.deprecated !== true)
              .map((output) => ({
                ...output,
                valueDesc: t(output.valueDesc as any),
                label: t(output.label as any),
                description: t(output.description as any)
              }))
          },
          position,
          selected: true,
          parentNodeId: currentNode?.parentNodeId,
          t
        });

        const newNodes = [newNode];

        if (templateNode.flowNodeType === FlowNodeTypeEnum.loop) {
          const startNode = nodeTemplate2FlowNode({
            template: LoopStartNode,
            position: { x: position.x + 60, y: position.y + 280 },
            parentNodeId: newNode.id,
            t
          });
          const endNode = nodeTemplate2FlowNode({
            template: LoopEndNode,
            position: { x: position.x + 420, y: position.y + 680 },
            parentNodeId: newNode.id,
            t
          });

          newNodes.push(startNode, endNode);
        }

        if (newNodes && newNodes.length > 0) {
          onAddNode({
            newNodes
          });
        }
      } catch (error) {
        console.error('Failed to create node template:', error);
      }
    }
  );

  const formatTemplatesArray = useMemoizedFn(
    (
      type: TemplateTypeEnum,
      templates: NodeTemplateListItemType[]
    ): { list: NodeTemplateListType; label: string }[] => {
      const data = (() => {
        if (type === TemplateTypeEnum.basic) {
          const map = workflowSystemNodeTemplateList.reduce<
            Record<
              string,
              {
                list: NodeTemplateListItemType[];
                label: string;
              }
            >
          >((acc, item) => {
            acc[item.type] = {
              list: [],
              label: t(item.label)
            };
            return acc;
          }, {});

          templates.forEach((item) => {
            if (map[item.templateType]) {
              map[item.templateType].list.push({
                ...item,
                name: t(item.name as any),
                intro: t(item.intro as any)
              });
            }
          });

          return [
            {
              label: '',
              list: Object.entries(map)
                .map(([type, { list, label }]) => ({
                  type,
                  label,
                  list
                }))
                .filter((item) => item.list.length > 0)
            }
          ];
        }

        if (type === TemplateTypeEnum.systemPlugin) {
          return pluginGroups.map((group) => {
            const map = group.groupTypes.reduce<
              Record<
                string,
                {
                  list: NodeTemplateListItemType[];
                  label: string;
                }
              >
            >((acc, item) => {
              acc[item.typeId] = {
                list: [],
                label: t(parseI18nString(item.typeName, i18n.language))
              };
              return acc;
            }, {});

            templates.forEach((item) => {
              if (map[item.templateType]) {
                map[item.templateType].list.push({
                  ...item,
                  name: t(parseI18nString(item.name, i18n.language)),
                  intro: t(parseI18nString(item.intro, i18n.language))
                });
              }
            });
            return {
              label: group.groupName,
              list: Object.entries(map)
                .map(([type, { list, label }]) => ({
                  type,
                  label,
                  list
                }))
                .filter((item) => item.list.length > 0)
            };
          });
        }

        // Team apps
        return [
          {
            label: '',
            list: [
              {
                type: '',
                label: '',
                list: templates
              }
            ]
          }
        ];
      })();
      return data.filter(({ list }) => list.length > 0);
    }
  );

  const formatTemplatesArrayData = useMemo(
    () => formatTemplatesArray(templateType, templates),
    [templateType, templates, formatTemplatesArray]
  );

  const PluginListRender = useMemoizedFn(({ list = [] }: { list: NodeTemplateListType }) => {
    return (
      <>
        {list.map((item) => {
          return (
            <Box
              key={item.type}
              css={css({
                span: {
                  display: 'block'
                }
              })}
            >
              {!!item.label && (
                <Box
                  fontSize={isPopover ? '12.8px' : 'sm'}
                  my={2}
                  fontWeight={'500'}
                  flex={1}
                  color={isPopover ? 'myGray.600' : 'myGray.900'}
                >
                  {t(item.label as any)}
                </Box>
              )}

              <Grid
                gridTemplateColumns={
                  templateType === TemplateTypeEnum.teamPlugin ? ['1fr'] : ['1fr', '1fr 1fr']
                }
                rowGap={2}
              >
                {item.list.map((template) => (
                  <NodeTemplateListItem
                    key={template.id}
                    template={template}
                    templateType={templateType}
                    handleAddNode={handleAddNode}
                    isPopover={isPopover}
                    onUpdateParentId={onUpdateParentId}
                  />
                ))}
              </Grid>
            </Box>
          );
        })}
      </>
    );
  });

  return templates.length === 0 ? (
    <EmptyTip text={t('app:module.No Modules')} />
  ) : (
    <Box flex={'1 0 0'} overflow={'overlay'} px={formatTemplatesArrayData.length > 1 ? 2 : 5}>
      <Accordion defaultIndex={[0]} allowMultiple reduceMotion>
        {formatTemplatesArrayData.length > 1 ? (
          <>
            {formatTemplatesArrayData.map(({ list, label }, index) => (
              <AccordionItem key={index} border={'none'}>
                <AccordionButton
                  fontSize={'sm'}
                  fontWeight={'500'}
                  color={'myGray.900'}
                  justifyContent={'space-between'}
                  alignItems={'center'}
                  borderRadius={'md'}
                  px={3}
                >
                  {t(label as any)}
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel py={0}>
                  <PluginListRender list={list} />
                </AccordionPanel>
              </AccordionItem>
            ))}
          </>
        ) : (
          <PluginListRender list={formatTemplatesArrayData?.[0]?.list} />
        )}
      </Accordion>
    </Box>
  );
};

export default React.memo(NodeTemplateList);
