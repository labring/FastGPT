'use client';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useEffect, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getSystemTemplates,
  getTemplateTypes,
  putUpdateTemplateOrder
} from '@/web/core/app/templates/api';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import TemplateConfigModal, { defaultTemplate } from './components/ItemConfigModal';
import QuickTemplateModal from './components/QuickTemplateModal';
import TemplateCard from './components/TemplateItemCard';
import TemplateTypeModal from './components/TypeModal';

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
    data: templates = [],
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 迁移自 pro/admin，保持原逻辑
    setLocalTemplates(templates);
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    return localTemplates.filter((template) => {
      if (currentAppType === 'all') return true;
      return template.type === currentAppType;
    });
  }, [localTemplates, currentAppType]);

  return (
    <MyBox isLoading={loading}>
      <Flex alignItems={'center'} gap={3} mt={1}>
        <Flex
          flex={'1'}
          overflow={'auto'}
          color={'myGray.900'}
          fontSize={'18px'}
          fontWeight={'medium'}
          pl={3}
        >
          模板列表
        </Flex>
        <MySelect
          value={currentAppType}
          onChange={(value) => {
            setCurrentAppType(value as AppTypeEnum | 'all');
          }}
          minW={'7rem'}
          minH={'34px'}
          h={'34px'}
          borderRadius={'sm'}
          list={[
            { label: '全部', value: 'all' },
            { label: '工作流', value: AppTypeEnum.workflow },
            { label: '对话 Agent', value: AppTypeEnum.simple },
            { label: '工作流工具', value: AppTypeEnum.workflowTool }
          ]}
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

      <Flex
        bg={'white'}
        h={8}
        mt={5}
        pl={8}
        rounded={'md'}
        alignItems={'center'}
        fontSize={'mini'}
        fontWeight={'medium'}
      >
        <Box w={2 / 10}>名称</Box>
        <Box w={1 / 10}>属性</Box>
        <Box w={4 / 10}>介绍</Box>
        <Box w={1 / 10} pl={4}>
          启用
        </Box>
        <Box w={1 / 10}>应用类型</Box>
        <Box w={1 / 10}>推荐</Box>
      </Flex>

      <Box overflow={'auto'} mt={4} maxH={'calc(100vh - 200px)'}>
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
            dataList={localTemplates}
          >
            {({ provided }) => (
              <Flex
                gap={1}
                flexDirection={'column'}
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {filteredTemplates.map((templateItem, index) => (
                  <Draggable
                    key={templateItem.templateId}
                    draggableId={String(templateItem.templateId)}
                    index={index}
                  >
                    {(provided, snapshot) => {
                      const templateTag = templateItem.tags.filter(
                        (t) => t !== 'recommendation'
                      )[0];
                      const property = templateTypes.find(
                        (type) => type.typeId === templateTag
                      )?.typeName;

                      return (
                        <TemplateCard
                          key={templateItem.templateId}
                          template={templateItem}
                          property={property || ''}
                          setCurrentTemplate={setCurrentTemplate}
                          provided={provided}
                          snapshot={snapshot}
                          refreshTemplates={refreshTemplates}
                        />
                      );
                    }}
                  </Draggable>
                ))}
              </Flex>
            )}
          </DndDrag>
        ) : (
          <EmptyTip text={'暂无模板'} py={2} />
        )}
      </Box>

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
          templates={templates}
          onClose={onCloseQuickTemplateModal}
          refreshTemplates={refreshTemplates}
        />
      )}
    </MyBox>
  );
};

export default AppTemplate;
