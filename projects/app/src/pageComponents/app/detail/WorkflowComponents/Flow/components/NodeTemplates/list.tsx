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
import { useTranslation } from 'react-i18next';
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
import { cloneDeep } from 'lodash';
import { workflowNodeTemplateList } from '@fastgpt/web/core/workflow/constants';
import { sliderWidth } from '../../NodeTemplatesModal';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useWorkflowUtils } from '../../hooks/useUtils';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import { LoopStartNode } from '@fastgpt/global/core/workflow/template/system/loop/loopStart';
import { LoopEndNode } from '@fastgpt/global/core/workflow/template/system/loop/loopEnd';
import { useReactFlow, type Node } from 'reactflow';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { nodeTemplate2FlowNode } from '@/web/core/workflow/utils';
import { WorkflowEventContext } from '../../../context/workflowEventContext';
import { useToast } from '@fastgpt/web/hooks/useToast';

export type TemplateListProps = {
  onAddNode: ({ newNodes }: { newNodes: Node<FlowNodeItemType>[] }) => void;
  isPopover?: boolean;
  templates: NodeTemplateListItemType[];
  templateType: TemplateTypeEnum;
  onUpdateParentId: (parentId: string) => void;
};

const NodeTemplateListItem = ({
  template,
  templateType,
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
  const { t } = useTranslation();
  const { screenToFlowPosition } = useReactFlow();
  const handleParams = useContextSelector(WorkflowEventContext, (v) => v.handleParams);

  return (
    <MyTooltip
      placement={'right'}
      label={
        <Box py={2}>
          <Flex alignItems={'center'}>
            <MyAvatar
              src={template.avatar}
              w={'1.75rem'}
              objectFit={'contain'}
              borderRadius={'sm'}
            />
            <Box fontWeight={'bold'} ml={3} color={'myGray.900'}>
              {t(template.name as any)}
            </Box>
          </Flex>
          <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
            {t(template.intro as any) || t('common:core.workflow.Not intro')}
          </Box>
          {/* {templateType === TemplateTypeEnum.systemPlugin && (
            <CostTooltip cost={template.currentCost} hasTokenFee={template.hasTokenFee} />
          )} */}
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
          if (template.isFolder && template.flowNodeType !== FlowNodeTypeEnum.toolSet) {
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
  const { t } = useTranslation();
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
      if (template.isFolder && template.flowNodeType !== FlowNodeTypeEnum.toolSet) {
        return;
      }

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
                valueDesc: t(input.valueDesc as any),
                label: t(input.label as any),
                description: t(input.description as any),
                debugLabel: t(input.debugLabel as any),
                toolDescription: t(input.toolDescription as any)
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
      templates: NodeTemplateListItemType[],
      pluginGroups: any[]
    ): { list: NodeTemplateListType; label: string }[] => {
      const data = (() => {
        if (type === TemplateTypeEnum.systemPlugin) {
          return pluginGroups.map((group) => {
            const copy: NodeTemplateListType = group.groupTypes.map((type: any) => ({
              list: [],
              type: type.typeId,
              label: type.typeName
            }));
            templates.forEach((item) => {
              const index = copy.findIndex((template) => template.type === item.templateType);
              if (index === -1) return;
              copy[index].list.push(item);
            });
            return {
              label: group.groupName,
              list: copy.filter((item) => item.list.length > 0)
            };
          });
        }

        const copy: NodeTemplateListType = cloneDeep(workflowNodeTemplateList).map((item) => ({
          ...item,
          list: []
        }));
        templates.forEach((item) => {
          const index = copy.findIndex((template) => template.type === item.templateType);
          if (index === -1) return;
          copy[index].list.push(item);
        });
        return [
          {
            label: '',
            list: copy.filter((item) => item.list.length > 0)
          }
        ];
      })();
      return data.filter(({ list }) => list.length > 0);
    }
  );

  const formatTemplatesArrayData = useMemo(
    () => formatTemplatesArray(templateType, templates, pluginGroups),
    [templateType, templates, pluginGroups, formatTemplatesArray]
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
              <Box
                fontSize={isPopover ? '12.8px' : 'sm'}
                my={2}
                fontWeight={'500'}
                flex={1}
                color={isPopover ? 'myGray.600' : 'myGray.900'}
              >
                {t(item.label as any)}
              </Box>
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
