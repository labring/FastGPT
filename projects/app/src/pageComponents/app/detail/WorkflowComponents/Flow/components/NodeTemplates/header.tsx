import type { Dispatch, SetStateAction } from 'react';
import React from 'react';
import { Box, Flex, IconButton, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppToolPaths } from '@/web/core/app/api/tool';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import type { SystemPluginToolTagType } from '@fastgpt/global/core/plugin/type';

export enum TemplateTypeEnum {
  'basic' = 'basic',
  'appTool' = 'appTool',
  'teamApp' = 'teamApp'
}

export type NodeTemplateListHeaderProps = {
  onClose?: () => void;
  isPopover?: boolean;
  templateType: TemplateTypeEnum;
  parentId: ParentIdType;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  onUpdateTemplateType: (type: TemplateTypeEnum) => void;
  onUpdateParentId: (parentId: string) => void;

  selectedTagIds: string[];
  setSelectedTagIds: (e: string[]) => any;
  toolTags: SystemPluginToolTagType[];
};

const NodeTemplateListHeader = ({
  onClose,
  isPopover = false,
  templateType,
  parentId,
  searchKey,
  setSearchKey,
  onUpdateTemplateType,
  onUpdateParentId,
  selectedTagIds,
  setSelectedTagIds,
  toolTags
}: NodeTemplateListHeaderProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  // Get paths
  const { data: paths = [] } = useRequest2(
    () => {
      if (templateType === TemplateTypeEnum.teamApp)
        return getAppFolderPath({ sourceId: parentId, type: 'current' });
      return getAppToolPaths({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const showToolTag =
    templateType === TemplateTypeEnum.appTool && selectedTagIds !== undefined && setSelectedTagIds;

  return (
    <Box px={'5'} mb={showToolTag ? 0.5 : 2} whiteSpace={'nowrap'} overflow={'hidden'}>
      {/* Tabs */}
      <Flex flex={'1 0 0'} alignItems={'center'} gap={2}>
        <Box flex={'1 0 0'}>
          <FillRowTabs<TemplateTypeEnum>
            list={[
              {
                icon: 'core/modules/basicNode',
                label: t('common:core.module.template.Basic Node'),
                value: TemplateTypeEnum.basic
              },
              {
                icon: 'phoneTabbar/tool',
                label: t('common:navbar.Toolkit'),
                value: TemplateTypeEnum.appTool
              },
              {
                icon: 'support/user/userLightSmall',
                label: t('common:core.module.template.Team app'),
                value: TemplateTypeEnum.teamApp
              }
            ]}
            width={'100%'}
            py={isPopover ? '3px' : '5px'}
            {...(isPopover
              ? {
                  iconSize: '14px',
                  labelSize: '12.8px',
                  iconGap: 1
                }
              : {})}
            value={templateType}
            onChange={(e) => {
              onUpdateTemplateType(e);
            }}
          />
        </Box>
        {/* close icon */}
        {!isPopover && (
          <IconButton
            size={'sm'}
            icon={<MyIcon name={'common/backFill'} w={'14px'} color={'myGray.600'} />}
            bg={'myGray.100'}
            _hover={{
              bg: 'myGray.200',
              '& svg': {
                color: 'primary.600'
              }
            }}
            variant={'grayBase'}
            aria-label={''}
            onClick={onClose}
          />
        )}
      </Flex>
      {/* Search */}
      {(templateType === TemplateTypeEnum.teamApp || templateType === TemplateTypeEnum.appTool) && (
        <Flex mt={2} alignItems={'center'} h={isPopover ? 8 : 10}>
          <InputGroup h={'full'}>
            <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
              <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
            </InputLeftElement>
            <Input
              h={'full'}
              bg={'myGray.50'}
              placeholder={
                templateType === TemplateTypeEnum.teamApp
                  ? t('common:plugin.Search_app')
                  : t('common:search_tool')
              }
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </InputGroup>
          <Box flex={1} />
          {!isPopover && templateType === TemplateTypeEnum.teamApp && (
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              _hover={{
                color: 'primary.600'
              }}
              fontSize={'sm'}
              onClick={() => router.push('/dashboard/apps')}
              gap={1}
              ml={4}
            >
              <Box>{t('common:create')}</Box>
              <MyIcon name={'common/rightArrowLight'} w={'0.8rem'} />
            </Flex>
          )}
          {templateType === TemplateTypeEnum.appTool && (
            <Flex
              alignItems={'center'}
              cursor={'pointer'}
              _hover={{
                color: 'primary.600'
              }}
              onClick={() => router.push('/plugin/tool')}
              gap={1}
              ml={4}
            >
              <Box fontSize={'sm'}>{t('app:find_more_tools')}</Box>
              <MyIcon name={'common/rightArrowLight'} w={'0.9rem'} />
            </Flex>
          )}
        </Flex>
      )}
      {/* Tag filter */}
      {templateType === TemplateTypeEnum.appTool &&
        selectedTagIds !== undefined &&
        setSelectedTagIds && (
          <Box mt={2}>
            <ToolTagFilterBox
              tags={toolTags}
              selectedTagIds={selectedTagIds}
              onTagSelect={setSelectedTagIds}
              size={isPopover ? 'sm' : 'base'}
            />
          </Box>
        )}
      {/* paths */}
      {(templateType === TemplateTypeEnum.teamApp || templateType === TemplateTypeEnum.appTool) &&
        !searchKey &&
        parentId && (
          <Flex alignItems={'center'} mt={2}>
            <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
          </Flex>
        )}
    </Box>
  );
};

export default React.memo(NodeTemplateListHeader);
