import { putUpdateTemplate, type AdminUpdateTemplateBodyType } from '@/web/core/app/templates/api';
import { Box, Checkbox, Flex, Switch } from '@chakra-ui/react';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import type { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type {
  DraggableProvided,
  DraggableStateSnapshot
} from '@fastgpt/web/components/common/DndDrag';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { appTypeMap, defaultTemplate } from './ItemConfigModal';
import type React from 'react';
import dynamic from 'next/dynamic';

// DnD provided props include ref-like fields that must be passed to the draggable element.
/* eslint-disable react-hooks/refs */
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
  const isRecommend = template.tags.includes('recommendation');
  const isPluginSystemTemplate = template.templateId.startsWith(`${AppToolSourceEnum.community}-`);

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

  return (
    <Box
      display={'flex'}
      position={'relative'}
      ref={provided.innerRef}
      {...provided.draggableProps}
      style={{
        ...provided.draggableProps.style,
        opacity: snapshot.isDragging ? 0.8 : 1
      }}
      pl={2}
      cursor={'pointer'}
      bg={'white'}
      borderRadius={'md'}
      h={12}
      w={'full'}
      border={'1px solid transparent'}
      _hover={{
        borderColor: 'rgba(51, 112, 255, 0.10)',
        bg: 'primary.50'
      }}
      fontSize={'mini'}
      alignItems={'center'}
      onClick={() => {
        setCurrentTemplate(template);
      }}
    >
      {loading && <Loading fixed={false} bg={'rgba(255,255,255,0.7)'} size={'sm'} />}
      <Box display={'flex'} w={2 / 10} pr={6} alignItems={'center'}>
        <Flex
          h={'full'}
          rounded={'xs'}
          mr={2.5}
          onClick={(e) => {
            e.stopPropagation();
          }}
          _hover={{ bg: 'myGray.05' }}
          {...provided.dragHandleProps}
        >
          <MyIcon name="drag" w={'14px'} color={'myGray.500'} cursor={'grab'} />
        </Flex>
        <Avatar src={template?.avatar} borderRadius={'xs'} w={'20px'} />
        <Box
          pl={1.5}
          mr={0.5}
          fontWeight={'medium'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
        >
          {template?.name}
        </Box>
        {template.isPromoted && (
          <Box
            p={'1px'}
            bgGradient={'linear(201deg, #E6B3FF 13.74%, #006AFF 89.76%)'}
            borderRadius={'full'}
            flexShrink={0}
          >
            <Box px={1.5} fontSize={'10px'} bg={'white'} borderRadius={'full'} color={'myGray.900'}>
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
      </Box>
      <Box w={1 / 10} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'}>
        <Box as={'span'} bg={'myGray.100'} px={2} py={1} color={'myGray.700'} borderRadius={'8px'}>
          {t(property as any)}
        </Box>
      </Box>
      <Box w={4 / 10} overflow={'hidden'} textOverflow={'ellipsis'} whiteSpace={'nowrap'} pl={4}>
        {template?.intro}
      </Box>
      <Box w={1 / 10} pl={8}>
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
      </Box>
      <Box w={1 / 10} pl={3}>
        <Box as={'span'} fontWeight={'medium'} color={'myGray.600'}>
          {appTypeMap[template?.type as keyof typeof appTypeMap]}
        </Box>
      </Box>
      <Flex
        alignItems={'center'}
        w={1 / 10}
        pl={3}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (isPluginSystemTemplate) {
            return;
          }
          const newTemplate = getTemplateUpdateBody({
            tags: isRecommend
              ? template.tags.filter((tag) => tag !== AppTemplateTypeEnum.recommendation)
              : [...template.tags, AppTemplateTypeEnum.recommendation]
          });
          updateSystemTemplate(newTemplate);
        }}
      >
        <Checkbox isChecked={isRecommend} isDisabled={isPluginSystemTemplate} size={'lg'} />
      </Flex>
    </Box>
  );
};

export default dynamic(() => Promise.resolve(TemplateCard), {
  ssr: false
});
