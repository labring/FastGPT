import { putUpdateTemplate, type AdminUpdateTemplateBodyType } from '@/web/core/app/templates/api';
import { Box, Checkbox, Flex, Switch, Td, Tr } from '@chakra-ui/react';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import { getDraggableItemProps } from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { appTypeMap, defaultTemplate } from './ItemConfigModal';
import type React from 'react';

const TemplateCard = ({
  template = defaultTemplate,
  setCurrentTemplate,
  provided,
  snapshot,
  property,
  refreshTemplates
}: {
  template: AppTemplateSchemaType;
  setCurrentTemplate: (template: AppTemplateSchemaType) => void;
  provided: DraggableProvided;
  snapshot: DraggableStateSnapshot;
  property: string;
  refreshTemplates: () => void;
}) => {
  const { t } = useTranslation();
  const isPluginSystemTemplate = template.templateId.startsWith(`${AppToolSourceEnum.community}-`);
  const isRecommend = isPluginSystemTemplate
    ? template.isPromoted === true
    : template.tags.includes('recommendation');

  const getTemplateUpdateBody = (
    patch: Partial<Omit<AdminUpdateTemplateBodyType, 'templateId'>>
  ): AdminUpdateTemplateBodyType => {
    if (isPluginSystemTemplate) {
      return {
        templateId: template.templateId,
        isActive: patch.isActive,
        isPromoted: patch.isPromoted,
        promoteTags: patch.promoteTags,
        hideTags: patch.hideTags,
        recommendText: patch.recommendText
      };
    }

    return {
      ...template,
      ...patch
    };
  };

  const { runAsync: updateSystemTemplate, loading } = useRequest(
    async (e: AdminUpdateTemplateBodyType) => {
      return putUpdateTemplate(e);
    },
    {
      onSuccess: () => {
        refreshTemplates();
      }
    }
  );

  const { draggableItemProps, dragHandleProps } = getDraggableItemProps(provided, snapshot);

  return (
    <Tr
      {...draggableItemProps}
      cursor={'pointer'}
      bg={'white'}
      h={12}
      fontSize={'mini'}
      _hover={{ bg: 'primary.50' }}
      onClick={() => {
        setCurrentTemplate(template);
      }}
      sx={{
        '& > td': {
          borderBottom: '1px solid',
          borderColor: 'myGray.200',
          py: 0,
          overflow: 'hidden'
        }
      }}
    >
      <Td px={2} position={'relative'}>
        {loading && <Loading fixed={false} bg={'rgba(255,255,255,0.7)'} size={'sm'} />}
        <Flex alignItems={'center'} minW={0}>
          <Flex
            h={'full'}
            rounded={'xs'}
            mr={2.5}
            onClick={(e) => {
              e.stopPropagation();
            }}
            _hover={{ bg: 'myGray.05' }}
            {...dragHandleProps}
          >
            <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
          </Flex>
          <Avatar src={template?.avatar} borderRadius={'xs'} w={'20px'} flexShrink={0} />
          <MyTooltip label={template?.name} showOnlyWhenOverflow shouldWrapChildren={false}>
            <Box pl={1.5} flex={1} minW={0} fontWeight={'medium'} isTruncated>
              {template?.name}
            </Box>
          </MyTooltip>
          {template.isPromoted && (
            <Box
              p={'1px'}
              ml={1}
              bgGradient={'linear(201deg, #E6B3FF 13.74%, #006AFF 89.76%)'}
              borderRadius={'full'}
              flexShrink={0}
            >
              <Box
                px={1.5}
                fontSize={'10px'}
                bg={'white'}
                borderRadius={'full'}
                color={'myGray.900'}
              >
                精选
              </Box>
            </Box>
          )}
          {isPluginSystemTemplate && (
            <Box
              ml={1}
              px={1.5}
              py={'1px'}
              fontSize={'10px'}
              color={'primary.600'}
              bg={'primary.50'}
              border={'1px solid'}
              borderColor={'primary.200'}
              borderRadius={'sm'}
              flexShrink={0}
            >
              系统
            </Box>
          )}
        </Flex>
      </Td>
      <Td px={0}>
        <Box as={'span'} bg={'myGray.100'} px={2} py={1} color={'myGray.700'} borderRadius={'8px'}>
          {t(property as any) || '-'}
        </Box>
      </Td>
      <Td px={0}>
        <MyTooltip label={template?.intro || '-'} showOnlyWhenOverflow shouldWrapChildren={false}>
          <Box minW={0} isTruncated>
            {template?.intro || '-'}
          </Box>
        </MyTooltip>
      </Td>
      <Td px={0} pl={8}>
        <Box
          as={'span'}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const newTemplate = getTemplateUpdateBody({
              isActive: !template?.isActive
            });
            updateSystemTemplate(newTemplate);
          }}
        >
          <Switch isChecked={template.isActive} />
        </Box>
      </Td>
      <Td px={0} pl={3}>
        <Box as={'span'} fontWeight={'medium'} color={'myGray.600'}>
          {appTypeMap[template?.type as keyof typeof appTypeMap]}
        </Box>
      </Td>
      <Td px={0} pl={3}>
        <Flex
          alignItems={'center'}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const newTemplate = isPluginSystemTemplate
              ? getTemplateUpdateBody({ isPromoted: !isRecommend })
              : getTemplateUpdateBody({
                  tags: isRecommend
                    ? template.tags.filter((tag) => tag !== AppTemplateTypeEnum.recommendation)
                    : [...template.tags, AppTemplateTypeEnum.recommendation]
                });
            updateSystemTemplate(newTemplate);
          }}
        >
          <Checkbox isChecked={isRecommend} size={'lg'} />
        </Flex>
      </Td>
    </Tr>
  );
};

export default TemplateCard;
