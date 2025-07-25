import React, { useEffect, useState } from 'react';
import { Box, Flex, IconButton, Input, InputGroup, InputLeftElement } from '@chakra-ui/react';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getSystemPluginPaths } from '@/web/core/app/api/plugin';
import { getAppFolderPath } from '@/web/core/app/api/app';
import FolderPath from '@/components/common/folder/Path';

export enum TemplateTypeEnum {
  'basic' = 'basic',
  'systemPlugin' = 'systemPlugin',
  'teamPlugin' = 'teamPlugin'
}

export type NodeTemplateListHeaderProps = {
  onClose?: () => void;
  isPopover?: boolean;
  templateType: TemplateTypeEnum;
  parentId: string;
  loadNodeTemplates: (params: {
    parentId?: string;
    type?: TemplateTypeEnum;
    searchVal?: string;
  }) => Promise<any>;
  onUpdateParentId: (parentId: string) => void;
};

const NodeTemplateListHeader = ({
  onClose,
  isPopover = false,
  templateType,
  parentId,
  loadNodeTemplates,
  onUpdateParentId
}: NodeTemplateListHeaderProps) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();

  const [searchKey, setSearchKey] = useState('');

  useEffect(() => {
    setSearchKey('');
  }, [templateType]);

  useEffect(() => {
    loadNodeTemplates({
      type: templateType,
      parentId: '',
      searchVal: searchKey
    });
  }, [searchKey, loadNodeTemplates, templateType]);

  // Get paths
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

  return (
    <Box px={'5'} mb={3} whiteSpace={'nowrap'} overflow={'hidden'}>
      {/* Tabs */}
      <Flex flex={'1 0 0'} alignItems={'center'} gap={2}>
        <Box flex={'1 0 0'}>
          <FillRowTabs
            list={[
              {
                icon: 'core/modules/basicNode',
                label: t('common:core.module.template.Basic Node'),
                value: TemplateTypeEnum.basic
              },
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
              loadNodeTemplates({
                type: e as TemplateTypeEnum,
                parentId: ''
              });
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
      {(templateType === TemplateTypeEnum.teamPlugin ||
        templateType === TemplateTypeEnum.systemPlugin) && (
        <Flex mt={2} alignItems={'center'} h={isPopover ? 8 : 10}>
          <InputGroup h={'full'}>
            <InputLeftElement h={'full'} alignItems={'center'} display={'flex'}>
              <MyIcon name={'common/searchLight'} w={'16px'} color={'myGray.500'} ml={3} />
            </InputLeftElement>
            <Input
              h={'full'}
              bg={'myGray.50'}
              placeholder={
                templateType === TemplateTypeEnum.teamPlugin
                  ? t('common:plugin.Search_app')
                  : t('common:plugin.Search plugin')
              }
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </InputGroup>
          <Box flex={1} />
          {!isPopover && templateType === TemplateTypeEnum.teamPlugin && (
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
          {!isPopover &&
            templateType === TemplateTypeEnum.systemPlugin &&
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
                ml={4}
              >
                <Box>{t('common:plugin.contribute')}</Box>
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
            <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
          </Flex>
        )}
    </Box>
  );
};

export default React.memo(NodeTemplateListHeader);
