'use client';
import { Box, Button, Center, Flex, Table, Tbody, useDisclosure } from '@chakra-ui/react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import SingleSelectFilter from '@fastgpt/web/components/common/TagFilter/SingleSelectFilter';
import { useEffect, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSystemTemplates, putUpdateTemplateOrder } from '@/web/admin/app/templates/api';
import { getTemplateTypes } from '@/web/core/app/templates/api';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import TemplateConfigModal, { defaultTemplate } from './components/ItemConfigModal';
import QuickTemplateModal from './components/QuickTemplateModal';
import TemplateCard from './components/TemplateItemCard';
import TemplateTypeModal from './components/TypeModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const AppTemplate = () => {
  const {
    isOpen: isOpenTypeModal,
    onOpen: onOpenTypeModal,
    onClose: onCloseTypeModal
  } = useDisclosure();

  const {
    isOpen: isOpenQuickTemplateModal,
    onOpen: onOpenQuickTemplateModal,
    onClose: onCloseQuickTemplateModal
  } = useDisclosure();

  const {
    data: templates,
    run: refreshTemplates,
    loading
  } = useRequest(getSystemTemplates, {
    manual: false
  });

  const { data: templateTypes = [], run: refreshTemplateTypes } = useRequest(getTemplateTypes, {
    manual: false
  });

  const [currentAppType, setCurrentAppType] = useState<AppTypeEnum | 'all'>('all');
  const [currentTemplate, setCurrentTemplate] = useState<AppTemplateSchemaType | null>(null);
  const [localTemplates, setLocalTemplates] = useState<AppTemplateSchemaType[]>([]);

  useEffect(() => {
    // 请求尚未完成时保留本地状态，成功返回空列表时才清空（避免无限重渲染）。
    if (templates === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 服务端刷新结果需同步至可拖拽的本地副本
    setLocalTemplates(templates);
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return localTemplates.filter((template) => {
      if (currentAppType === 'all') return true;
      return template.type === currentAppType;
    });
  }, [localTemplates, currentAppType]);

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        minH={'64px'}
        flexShrink={0}
        px={6}
        py={3}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
        gap={3}
        wrap={'wrap'}
      >
        <Box as={'h1'} {...accountTitleTextStyles} flex={1}>
          应用模板
        </Box>
        <SingleSelectFilter<AppTypeEnum | 'all'>
          storageKey={'admin.templates.appType'}
          title={'类型'}
          value={currentAppType}
          onChange={setCurrentAppType}
          options={[
            { label: '全部', value: 'all' },
            { label: '工作流', value: AppTypeEnum.workflow },
            { label: '对话 Agent', value: AppTypeEnum.simple },
            { label: '工作流工具', value: AppTypeEnum.workflowTool }
          ]}
          maxW={'180px'}
        />
        <Button onClick={() => onOpenTypeModal()} variant={'whiteBase'}>
          分类管理
        </Button>
        <Button onClick={() => onOpenQuickTemplateModal()} variant={'whiteBase'}>
          快捷模板
        </Button>
        <Button
          leftIcon={<MyIcon name="common/addLight" w={'18px'} />}
          onClick={() => {
            setCurrentTemplate(defaultTemplate);
          }}
        >
          添加模板
        </Button>
      </Flex>

      <MyBox
        isLoading={loading}
        flex={'1 0 0'}
        minH={0}
        py={6}
        display={'flex'}
        flexDirection={'column'}
      >
        <FixedTableLayout
          horizontalScroll
          scrollMode={'normal'}
          rootProps={{ flex: '1 0 0', minH: 0 }}
          headerProps={{ px: [4, 6], bg: 'myGray.100', borderRadius: 'md' }}
          bodyProps={{ px: [4, 6] }}
          renderHeader={({ headerTableWidth }) => (
            <Flex
              bg={'myGray.100'}
              w={headerTableWidth}
              minW={'900px'}
              h={'50px'}
              rounded={'md'}
              alignItems={'center'}
              fontSize={'mini'}
              fontWeight={'medium'}
              color={'myGray.600'}
            >
              <Box w={2 / 10} pl={8}>
                名称
              </Box>
              <Box w={1 / 10}>属性</Box>
              <Box w={4 / 10}>介绍</Box>
              <Box w={1 / 10} pl={8}>
                启用
              </Box>
              <Box w={1 / 10} pl={3}>
                应用类型
              </Box>
              <Box w={1 / 10} pl={3}>
                推荐
              </Box>
            </Flex>
          )}
          renderBody={() => (
            <Box minW={'900px'}>
              {filteredTemplates.length > 0 ? (
                <DndDrag<AppTemplateSchemaType>
                  onDragEndCb={async (list: AppTemplateSchemaType[]) => {
                    const newList = list.map((item, index) => ({
                      templateId: item.templateId,
                      order: index
                    }));
                    setLocalTemplates(list);
                    await putUpdateTemplateOrder({
                      templates: newList
                    });
                    refreshTemplates();
                  }}
                  dataList={filteredTemplates}
                >
                  {({ provided }) => (
                    <Table
                      variant={'simple'}
                      w={'100%'}
                      minW={'900px'}
                      sx={{
                        tableLayout: 'fixed',
                        '& td': {
                          borderBottom: 'none'
                        }
                      }}
                    >
                      <colgroup>
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '40%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <Tbody {...provided.droppableProps} ref={provided.innerRef}>
                        {filteredTemplates.map((templateItem, index) => {
                          const templateTag = templateItem.tags.filter(
                            (t) => t !== 'recommendation'
                          )[0];
                          const property = templateTypes.find(
                            (type) => type.typeId === templateTag
                          )?.typeName;

                          return (
                            <Draggable
                              key={templateItem.templateId}
                              draggableId={String(templateItem.templateId)}
                              index={index}
                              isDragDisabled={currentAppType !== 'all'}
                            >
                              {(provided, snapshot) => (
                                <TemplateCard
                                  key={templateItem.templateId}
                                  template={templateItem}
                                  property={property || ''}
                                  setCurrentTemplate={setCurrentTemplate}
                                  provided={provided}
                                  snapshot={snapshot}
                                  refreshTemplates={refreshTemplates}
                                />
                              )}
                            </Draggable>
                          );
                        })}
                      </Tbody>
                    </Table>
                  )}
                </DndDrag>
              ) : (
                <Center h={'full'}>
                  <EmptyTip text={'暂无模板'} py={2} />
                </Center>
              )}
            </Box>
          )}
        />
      </MyBox>

      {currentTemplate && (
        <TemplateConfigModal
          defaultForm={currentTemplate}
          onClose={() => setCurrentTemplate(null)}
          onSuccess={refreshTemplates}
          templateTypes={templateTypes}
        />
      )}
      {isOpenTypeModal && (
        <TemplateTypeModal
          onClose={onCloseTypeModal}
          onSuccess={refreshTemplateTypes}
          typeList={templateTypes}
        />
      )}
      {isOpenQuickTemplateModal && (
        <QuickTemplateModal
          templates={templates ?? localTemplates}
          onClose={onCloseQuickTemplateModal}
          refreshTemplates={refreshTemplates}
        />
      )}
    </BoxPageRoot>
  );
};

export default AppTemplate;
