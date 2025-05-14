import React, { useCallback, useMemo, useState, useEffect } from 'react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  css,
  Flex,
  Grid
} from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type {
  NodeTemplateListItemType,
  NodeTemplateListType
} from '@fastgpt/global/core/workflow/type/node.d';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getPluginGroups,
  getPreviewPluginNode,
  getSystemPlugTemplates,
  getSystemPluginPaths
} from '@/web/core/app/api/plugin';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getTeamPlugTemplates } from '@/web/core/app/api/plugin';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import CostTooltip from '@/components/core/app/plugin/CostTooltip';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMemoizedFn } from 'ahooks';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import type { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

type Props = {
  selectedPluginIds: string[];
  onSelectPlugins: (plugins: NodeTemplateListItemType[]) => void;
  onCancel: () => void;
};

enum TemplateTypeEnum {
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

const ToolSelectModal = ({ selectedPluginIds, onSelectPlugins, onCancel }: Props) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const [tempSelectedIds, setTempSelectedIds] = useState<string[]>([...selectedPluginIds]);
  const [templateType, setTemplateType] = useState(TemplateTypeEnum.systemPlugin);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const [searchKey, setSearchKey] = useState('');

  // 监听 ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    // 添加事件监听
    document.addEventListener('keydown', handleKeyDown);

    // 组件卸载时清除事件监听
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel]);

  const {
    data: templates = [],
    runAsync: loadTemplates,
    loading: isLoading
  } = useRequest2(
    async ({
      type = templateType,
      parentId = '',
      searchVal = searchKey
    }: {
      type?: TemplateTypeEnum;
      parentId?: ParentIdType;
      searchVal?: string;
    }) => {
      if (type === TemplateTypeEnum.systemPlugin) {
        return getSystemPlugTemplates({ parentId, searchKey: searchVal });
      } else if (type === TemplateTypeEnum.teamPlugin) {
        return getTeamPlugTemplates({
          parentId,
          searchKey: searchVal
        }).then((res) => res.filter((app) => app.id !== appDetail._id));
      }
    },
    {
      onSuccess(_, [{ type = templateType, parentId = '' }]) {
        setTemplateType(type);
        setParentId(parentId);
      },
      refreshDeps: [templateType, searchKey, parentId],
      errorToast: t('common:core.module.templates.Load plugin error')
    }
  );

  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.teamPlugin)
        return getAppFolderPath({ sourceId: parentId, type: 'current' });
      return getSystemPluginPaths({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const onUpdateParentId = useCallback(
    (parentId: ParentIdType) => {
      loadTemplates({
        parentId
      });
    },
    [loadTemplates]
  );

  useRequest2(() => loadTemplates({ searchVal: searchKey }), {
    manual: false,
    throttleWait: 300,
    refreshDeps: [searchKey]
  });

  // 处理确认选择，获取完整的插件信息
  const handleConfirm = async () => {
    console.log('即将保存的插件选择:', tempSelectedIds);

    try {
      // 从当前已加载的模板中直接获取信息，避免额外的 API 调用
      const selectedPlugins = templates
        .filter((template) => tempSelectedIds.includes(template.id))
        .map((template) => ({
          id: template.id,
          name: template.name,
          avatar: template.avatar,
          intro: template.intro || '',
          isFolder: template.isFolder || false,
          flowNodeType: template.flowNodeType,
          templateType: template.templateType
        }));

      // 对于不在当前模板中的插件（可能来自其他路径或之前选择），需要获取信息
      const missingIds = tempSelectedIds.filter(
        (id) => !selectedPlugins.some((plugin) => plugin.id === id)
      );

      if (missingIds.length > 0) {
        // 批量获取缺失的插件信息，而不是一个个调用 API
        const promises = missingIds.map((pluginId) =>
          getPreviewPluginNode({ appId: pluginId })
            .then((template) => ({
              id: pluginId,
              name: template.name,
              avatar: template.avatar,
              intro: template.intro || '',
              isFolder: false,
              flowNodeType: template.flowNodeType,
              templateType: template.templateType
            }))
            .catch((error) => {
              console.error('获取插件信息失败:', pluginId, error);
              return null;
            })
        );

        // 明确指定类型，排除 null 值
        const additionalPlugins = (await Promise.all(promises)).filter(
          (
            item
          ): item is {
            id: string;
            name: string;
            avatar: string | undefined;
            intro: string;
            isFolder: boolean;
            flowNodeType: FlowNodeTypeEnum;
            templateType: string;
          } => Boolean(item)
        );

        selectedPlugins.push(...additionalPlugins);
      }

      console.log('处理后的插件列表:', selectedPlugins);
      onSelectPlugins(selectedPlugins);
    } catch (error) {
      console.error('处理插件选择时出错:', error);
    } finally {
      onCancel();
    }
  };

  return (
    <MyModal
      isOpen
      title={t('common:core.app.Tool call')}
      iconSrc="core/app/toolCall"
      onClose={onCancel}
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
    >
      {/* Header: row and search */}
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'space-between'} w={'full'}>
        <FillRowTabs
          list={[
            {
              icon: 'phoneTabbar/tool',
              label: t('common:navbar.Toolkit'),
              value: TemplateTypeEnum.systemPlugin
            },
            {
              icon: 'core/modules/teamPlugin',
              label: t('common:core.module.template.Team app'),
              value: TemplateTypeEnum.teamPlugin
            }
          ]}
          py={'5px'}
          px={'15px'}
          value={templateType}
          onChange={(e) =>
            loadTemplates({
              type: e as TemplateTypeEnum,
              parentId: null
            })
          }
        />
        <Box w={300}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={
              templateType === TemplateTypeEnum.systemPlugin
                ? t('common:plugin.Search plugin')
                : t('app:search_app')
            }
          />
        </Box>
      </Box>
      {/* route components */}
      {!searchKey && parentId && (
        <Flex mt={2} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}
      <MyBox isLoading={isLoading} mt={2} px={[3, 6]} pb={3} flex={'1 0 0'} overflowY={'auto'}>
        <RenderList
          templates={templates}
          type={templateType}
          setParentId={onUpdateParentId}
          selectedIds={tempSelectedIds}
          toggleSelection={(id) => {
            setTempSelectedIds((prev) => {
              return prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
            });
          }}
        />
      </MyBox>

      {/* Footer buttons - 改用内部内容替代 footer 属性 */}
      <Flex
        px={[3, 6]}
        py={4}
        justify="flex-end"
        w="full"
        gap={3}
        borderTop="1px solid"
        borderColor="gray.100"
      >
        <Button variant="outline" onClick={onCancel}>
          {t('common:common.Cancel')}
        </Button>
        <Button colorScheme="blue" onClick={handleConfirm}>
          {t('common:common.Confirm')}
        </Button>
      </Flex>
    </MyModal>
  );
};

export default React.memo(ToolSelectModal);

const RenderList = React.memo(function RenderList({
  templates,
  type,
  setParentId,
  selectedIds,
  toggleSelection
}: {
  templates: NodeTemplateListItemType[];
  type: TemplateTypeEnum;
  setParentId: (parentId: ParentIdType) => any;
  selectedIds: string[];
  toggleSelection: (id: string) => void;
}) {
  const { t } = useTranslation();

  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

  const formatTemplatesArray = useMemo(() => {
    const data = (() => {
      if (type === TemplateTypeEnum.systemPlugin) {
        return pluginGroups.map((group) => {
          const copy: NodeTemplateListType = group.groupTypes.map((type) => ({
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

      return [
        {
          list: [
            {
              list: templates,
              type: '',
              label: ''
            }
          ],
          label: ''
        }
      ];
    })();

    return data.filter(({ list }) => list.length > 0);
  }, [pluginGroups, templates, type]);

  const gridStyle = useMemo(() => {
    if (type === TemplateTypeEnum.teamPlugin) {
      return {
        gridTemplateColumns: ['1fr', '1fr'],
        py: 2,
        avatarSize: '2rem'
      };
    }

    return {
      gridTemplateColumns: ['1fr', '1fr 1fr'],
      py: 3,
      avatarSize: '1.75rem'
    };
  }, [type]);

  const PluginListRender = useMemoizedFn(({ list = [] }: { list: NodeTemplateListType }) => {
    return (
      <>
        {list.map((item, i) => {
          return (
            <Box
              key={item.type}
              css={css({
                span: {
                  display: 'block'
                }
              })}
            >
              <Flex>
                <Box fontSize={'sm'} my={2} fontWeight={'500'} flex={1} color={'myGray.900'}>
                  {t(item.label as any)}
                </Box>
              </Flex>
              <Grid gridTemplateColumns={gridStyle.gridTemplateColumns} rowGap={2} columnGap={3}>
                {item.list.map((template) => {
                  const selected = selectedIds.includes(template.id);

                  // 判断是否是嵌套插件
                  const isNestedPlugin = template.isFolder;

                  return (
                    <MyTooltip
                      key={template.id}
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
                          {type === TemplateTypeEnum.systemPlugin && (
                            <CostTooltip
                              cost={template.currentCost}
                              hasTokenFee={template.hasTokenFee}
                            />
                          )}
                        </Box>
                      }
                    >
                      <Flex
                        alignItems={'center'}
                        py={gridStyle.py}
                        px={3}
                        _hover={{ bg: 'myWhite.600' }}
                        borderRadius={'sm'}
                        whiteSpace={'nowrap'}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                      >
                        <MyAvatar
                          src={template.avatar}
                          w={gridStyle.avatarSize}
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

                        {selected ? (
                          <Button
                            size={'sm'}
                            variant={'grayDanger'}
                            leftIcon={<MyIcon name={'delete'} w={'16px'} mr={-1} />}
                            onClick={() => toggleSelection(template.id)}
                            px={2}
                            fontSize={'mini'}
                          >
                            {t('common:common.Remove')}
                          </Button>
                        ) : isNestedPlugin ? (
                          <Button
                            size={'sm'}
                            variant={'whiteBase'}
                            leftIcon={<MyIcon name={'common/arrowRight'} w={'16px'} mr={-1.5} />}
                            onClick={() => setParentId(template.id)}
                            px={2}
                            fontSize={'mini'}
                          >
                            {t('common:common.Open')}
                          </Button>
                        ) : (
                          <Button
                            size={'sm'}
                            variant={'primaryOutline'}
                            leftIcon={<MyIcon name={'common/addLight'} w={'16px'} mr={-1.5} />}
                            onClick={() => toggleSelection(template.id)}
                            px={2}
                            fontSize={'mini'}
                          >
                            {t('common:common.Add')}
                          </Button>
                        )}
                      </Flex>
                    </MyTooltip>
                  );
                })}
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
    <Box flex={'1 0 0'} overflow={'overlay'}>
      <Accordion defaultIndex={[0]} allowMultiple reduceMotion>
        {formatTemplatesArray.length > 1 ? (
          <>
            {formatTemplatesArray.map(({ list, label }, index) => (
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
          <PluginListRender list={formatTemplatesArray?.[0]?.list} />
        )}
      </Accordion>
    </Box>
  );
});
