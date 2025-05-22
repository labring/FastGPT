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
import { getPluginGroups } from '@/web/core/app/api/plugin';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type {
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node';
import { TemplateTypeEnum } from './header';
import { useMemoizedFn } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';
import { cloneDeep } from 'lodash';
import { workflowNodeTemplateList } from '@fastgpt/web/core/workflow/constants';
import { sliderWidth } from '../../NodeTemplatesModal';

export type TemplateListProps = {
  onAddNode: ({
    template,
    position
  }: {
    template: NodeTemplateListItemType;
    position?: { x: number; y: number };
  }) => void;
  isPopover?: boolean;
};

const NodeTemplateListItem = ({
  template,
  templateType,
  onAddNode,
  isPopover
}: {
  template: NodeTemplateListItemType;
  templateType: TemplateTypeEnum;
  onAddNode: ({
    template,
    position
  }: {
    template: NodeTemplateListItemType;
    position?: { x: number; y: number };
  }) => void;
  isPopover?: boolean;
}) => {
  const { t } = useTranslation();

  const onUpdateParentId = useContextSelector(WorkflowContext, (state) => state.onUpdateParentId);

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
          {templateType === TemplateTypeEnum.systemPlugin && (
            <CostTooltip cost={template.currentCost} hasTokenFee={template.hasTokenFee} />
          )}
        </Box>
      }
    >
      <Flex
        alignItems={'center'}
        py={isPopover ? 1 : 3}
        px={isPopover ? 2 : 3}
        cursor={'pointer'}
        _hover={{
          bg: 'myWhite.600',
          '& .arrowIcon': {
            display: 'block'
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
          onAddNode({ template, position: { x: e.clientX, y: e.clientY } });
        }}
        onClick={() => {
          if (template.isFolder && template.flowNodeType !== FlowNodeTypeEnum.toolSet) {
            onUpdateParentId(template.id);
            return;
          }
          onAddNode({ template });
        }}
      >
        <MyAvatar
          src={template.avatar}
          w={isPopover ? '1.25rem' : '1.75rem'}
          objectFit={'contain'}
          borderRadius={'sm'}
          flexShrink={0}
        />
        <Box
          color={'myGray.900'}
          fontWeight={'500'}
          fontSize={'sm'}
          flex={'1 0 0'}
          ml={3}
          className="textEllipsis"
        >
          {t(template.name as any)}
        </Box>

        {template.isFolder && templateType === TemplateTypeEnum.teamPlugin && (
          <Box
            color={'myGray.500'}
            _hover={{
              bg: 'var(--light-general-surface-opacity-005, rgba(17, 24, 36, 0.05))',
              color: 'primary.600'
            }}
            p={isPopover ? 0.5 : 1}
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

const NodeTemplateList = ({ onAddNode, isPopover = false }: TemplateListProps) => {
  const { t } = useTranslation();

  const { templateType, templates } = useContextSelector(WorkflowContext, (state) => ({
    templateType: state.templateType,
    templates: state.templates
  }));

  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

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

        const copy: NodeTemplateListType = cloneDeep(workflowNodeTemplateList);
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
                    onAddNode={onAddNode}
                    isPopover={isPopover}
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
