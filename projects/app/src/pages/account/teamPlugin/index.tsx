'use client';
import React, { useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack
} from '@chakra-ui/react';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  confirmTeamPkgPluginUpload,
  deleteTeamPlugin,
  getTeamSystemPluginList,
  installTeamPluginWithUrl,
  uploadTeamPkgPlugin
} from '@/web/core/plugin/team/api';
import { getMarketplaceDownloadURL, getMarketplaceTools } from '@/web/core/plugin/marketplace/api';
import {
  TeamPluginPolicyStatusEnum,
  TeamPluginRegistrySourceEnum
} from '@fastgpt/global/core/plugin/schema/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type { UploadTeamPkgPluginResponseType } from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { useDebounce } from 'ahooks';

enum TeamPluginTabEnum {
  available = 'available',
  marketplace = 'marketplace',
  deleted = 'deleted'
}

type TeamPluginItem = GetTeamPluginListResponseType[number];
type UploadedPlugin = UploadTeamPkgPluginResponseType['plugins'][number];

const getRawPluginId = (pluginId: string) => pluginId.replace(/^systemTool-/, '').split('/')[0];

const getSourceLabelKey = (plugin: TeamPluginItem) => {
  if (plugin.registrySource === TeamPluginRegistrySourceEnum.team) {
    if (plugin.installSource === 'upload') {
      return 'account_team:team_plugin_install_source_upload';
    }
    if (plugin.installSource === 'marketplace') {
      return 'account_team:team_plugin_install_source_marketplace';
    }
    return 'account_team:team_plugin_source_team';
  }
  return 'account_team:team_plugin_source_system';
};

const TeamPlugin = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const canManage =
    !!userInfo?.team?.permission.hasPluginManagePer ||
    !!userInfo?.team?.permission.hasManagePer ||
    !!userInfo?.team?.permission.isOwner;
  const uploadEnabled = feConfigs.enable_team_plugin_upload !== false;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState(TeamPluginTabEnum.available);
  const [searchKey, setSearchKey] = useState('');
  const debouncedSearchKey = useDebounce(searchKey, { wait: 300 });
  const [uploadPreview, setUploadPreview] = useState<UploadedPlugin[]>([]);

  const listQuery = useMemo(() => {
    if (tab === TeamPluginTabEnum.deleted) {
      return {
        includeDeleted: true,
        includeDebug: false,
        source: TeamPluginRegistrySourceEnum.team
      } as const;
    }
    return {
      includeDebug: false,
      source: 'all'
    } as const;
  }, [tab]);

  const {
    data: pluginList = [],
    loading: loadingPlugins,
    refresh: refreshPluginList
  } = useRequest(() => getTeamSystemPluginList(listQuery), {
    manual: false,
    refreshDeps: [listQuery]
  });

  const { data: installedTeamPlugins = [], refresh: refreshInstalledTeamPlugins } = useRequest(
    () =>
      getTeamSystemPluginList({
        includeDeleted: true,
        includeDebug: false,
        source: TeamPluginRegistrySourceEnum.team
      }),
    {
      manual: false
    }
  );

  const {
    data: marketplaceData,
    loading: loadingMarketplace,
    refresh: refreshMarketplace
  } = useRequest(
    () =>
      getMarketplaceTools({
        pageNum: 1,
        pageSize: 30,
        searchKey: debouncedSearchKey || undefined
      }),
    {
      manual: false,
      refreshDeps: [debouncedSearchKey]
    }
  );

  const installedPluginMap = useMemo(
    () =>
      new Map(
        installedTeamPlugins
          .filter((plugin) => plugin.registrySource === TeamPluginRegistrySourceEnum.team)
          .map((plugin) => [getRawPluginId(plugin.id), plugin])
      ),
    [installedTeamPlugins]
  );

  const filteredPlugins = useMemo(() => {
    const keyword = debouncedSearchKey.trim().toLowerCase();
    return pluginList
      .filter((plugin) => {
        if (tab === TeamPluginTabEnum.deleted) {
          return plugin.teamInstallStatus === TeamPluginPolicyStatusEnum.deleted;
        }
        if (tab !== TeamPluginTabEnum.available) return false;
        return plugin.teamInstallStatus !== TeamPluginPolicyStatusEnum.deleted;
      })
      .filter((plugin) => {
        if (!keyword) return true;
        return [plugin.name, plugin.intro, plugin.author, ...(plugin.tags ?? [])].some((text) =>
          String(text ?? '')
            .toLowerCase()
            .includes(keyword)
        );
      });
  }, [debouncedSearchKey, pluginList, tab]);

  const refreshAll = async () => {
    await Promise.all([refreshPluginList(), refreshInstalledTeamPlugins(), refreshMarketplace()]);
  };

  const { runAsync: onDeletePlugin, loading: deletingPlugin } = useRequest(
    async (plugin: TeamPluginItem) => {
      await deleteTeamPlugin({
        pluginId: plugin.id,
        version: plugin.installedVersion || plugin.version
      });
    },
    {
      manual: true,
      successToast: t('common:Success'),
      onSuccess: refreshAll
    }
  );

  const { runAsync: onUploadPkg, loading: uploadingPkg } = useRequest(
    async (files: File[]) => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('file', file, encodeURIComponent(file.name));
      });
      const result = await uploadTeamPkgPlugin(formData);
      if (result.failed?.length) {
        toast({
          status: 'warning',
          title:
            parseI18nString(result.failed[0].reason, i18n.language) ||
            t('account_team:team_plugin_upload_parse_failed')
        });
      }
      setUploadPreview(result.plugins);
    },
    {
      manual: true
    }
  );

  const { runAsync: onConfirmUpload, loading: confirmingUpload } = useRequest(
    async () => {
      if (!uploadPreview.length) return;
      await confirmTeamPkgPluginUpload({
        toolIds: uploadPreview.map((plugin) => ({
          pluginId: plugin.pluginId,
          version: plugin.version,
          etag: plugin.etag,
          permission: plugin.permission
        }))
      });
      setUploadPreview([]);
    },
    {
      manual: true,
      successToast: t('common:Success'),
      onSuccess: refreshAll
    }
  );

  const { runAsync: onInstallMarketplace, loading: installingMarketplace } = useRequest(
    async (tool: any) => {
      const toolId = tool.toolId || tool.pluginId;
      const downloadUrl = await getMarketplaceDownloadURL(toolId, tool.version);
      if (!downloadUrl) {
        toast({
          status: 'warning',
          title: t('account_team:team_plugin_download_url_missing')
        });
        return;
      }

      await installTeamPluginWithUrl({
        downloadUrls: [downloadUrl],
        plugins: [
          {
            pluginId: toolId,
            version: tool.version || '',
            etag: tool.etag || '',
            permission: tool.permission,
            marketplaceToolId: toolId,
            marketplaceSource: tool.source
          }
        ]
      });
    },
    {
      manual: true,
      successToast: t('common:Success'),
      onSuccess: refreshAll
    }
  );

  const { ConfirmModal: ConfirmDeletePluginModal, openConfirm: openDeletePluginConfirm } =
    useConfirm({
      title: t('account_team:team_plugin_confirm_delete_title'),
      content: t('account_team:team_plugin_confirm_delete_content'),
      type: 'delete'
    });

  const marketplaceTools = useMemo(
    () =>
      marketplaceData?.list?.map((tool: any) => {
        const toolId = tool.toolId || tool.pluginId;
        const installed = installedPluginMap.get(toolId);
        return {
          ...tool,
          toolId,
          displayName: parseI18nString(tool.name, i18n.language) || toolId,
          displayIntro: parseI18nString(tool.description || '', i18n.language) || '',
          installed
        };
      }) ?? [],
    [i18n.language, installedPluginMap, marketplaceData?.list]
  );

  const renderPluginTable = () => (
    <MyBox isLoading={loadingPlugins || deletingPlugin} flex={'1 0 0'} h={0}>
      <TableContainer h={'100%'} overflowY={'auto'}>
        <Table variant={'simple'} size={'sm'}>
          <Thead>
            <Tr>
              <Th>{t('common:name')}</Th>
              <Th>{t('common:Status')}</Th>
              <Th>{t('account_team:team_plugin_version')}</Th>
              <Th>{t('common:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredPlugins.map((plugin) => (
              <Tr key={`${plugin.registrySource}-${plugin.id}`}>
                <Td>
                  <Flex align={'center'} gap={3}>
                    <Avatar src={plugin.avatar} borderRadius={'md'} w={'32px'} />
                    <Box minW={0}>
                      <Text fontWeight={500} color={'myGray.900'} noOfLines={1}>
                        {plugin.name}
                      </Text>
                      <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                        {plugin.intro || plugin.id}
                      </Text>
                    </Box>
                  </Flex>
                </Td>
                <Td>
                  <VStack align={'flex-start'} spacing={1}>
                    <Badge colorScheme={plugin.registrySource === 'team' ? 'blue' : 'gray'}>
                      {t(getSourceLabelKey(plugin))}
                    </Badge>
                    {plugin.teamInstallStatus && (
                      <Text fontSize={'xs'} color={'myGray.500'}>
                        {plugin.teamInstallStatus}
                      </Text>
                    )}
                  </VStack>
                </Td>
                <Td>
                  <Text fontSize={'sm'}>{plugin.installedVersion || plugin.version || '-'}</Text>
                  {plugin.installedEtag || plugin.etag ? (
                    <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                      {plugin.installedEtag || plugin.etag}
                    </Text>
                  ) : null}
                </Td>
                <Td>
                  {canManage &&
                    plugin.registrySource === TeamPluginRegistrySourceEnum.team &&
                    plugin.teamInstallStatus !== TeamPluginPolicyStatusEnum.deleted && (
                      <Button
                        size={'sm'}
                        variant={'whiteDanger'}
                        onClick={() =>
                          openDeletePluginConfirm({
                            onConfirm: () => onDeletePlugin(plugin)
                          })()
                        }
                      >
                        {t('account_team:team_plugin_delete')}
                      </Button>
                    )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {!filteredPlugins.length && <EmptyTip text={t('account_team:team_plugin_empty')} py={10} />}
      </TableContainer>
    </MyBox>
  );

  const renderMarketplace = () => (
    <MyBox isLoading={loadingMarketplace || installingMarketplace} flex={'1 0 0'} h={0}>
      <VStack align={'stretch'} spacing={3} h={'100%'} overflowY={'auto'}>
        {marketplaceTools.map((tool) => (
          <Flex
            key={tool.toolId}
            p={4}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
            align={'center'}
            gap={4}
          >
            <Avatar src={tool.icon} borderRadius={'md'} w={'36px'} />
            <Box flex={1} minW={0}>
              <HStack>
                <Text fontWeight={500}>{tool.displayName}</Text>
                {tool.installed && (
                  <Badge
                    colorScheme={tool.installed.teamInstallStatus === 'deleted' ? 'red' : 'green'}
                  >
                    {tool.installed.teamInstallStatus}
                  </Badge>
                )}
              </HStack>
              <Text color={'myGray.500'} fontSize={'sm'} noOfLines={1}>
                {tool.displayIntro || tool.toolId}
              </Text>
              <HStack mt={2} spacing={2} flexWrap={'wrap'}>
                {(tool.tags ?? []).map((tag: string) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </HStack>
            </Box>
            {canManage && (
              <Button size={'sm'} onClick={() => onInstallMarketplace(tool)}>
                {tool.installed?.teamInstallStatus === TeamPluginPolicyStatusEnum.deleted
                  ? t('account_team:team_plugin_reinstall')
                  : t('account_team:team_plugin_install')}
              </Button>
            )}
          </Flex>
        ))}
        {!marketplaceTools.length && (
          <EmptyTip text={t('account_team:team_plugin_empty')} py={10} />
        )}
      </VStack>
    </MyBox>
  );

  const renderUploadPreview = () => {
    if (!uploadPreview.length) return null;

    return (
      <Box border={'1px solid'} borderColor={'myGray.200'} rounded={'md'} p={4}>
        <Flex justify={'space-between'} align={'center'} mb={3}>
          <Text fontWeight={500}>{t('account_team:team_plugin_upload_pending')}</Text>
          <Button size={'sm'} isLoading={confirmingUpload} onClick={() => onConfirmUpload()}>
            {t('account_team:team_plugin_install')}
          </Button>
        </Flex>
        <VStack align={'stretch'} spacing={2}>
          {uploadPreview.map((plugin) => (
            <Flex key={`${plugin.pluginId}-${plugin.version}`} gap={3} align={'center'}>
              <Avatar src={plugin.icon} borderRadius={'md'} w={'28px'} />
              <Box flex={1}>
                <Text fontSize={'sm'} fontWeight={500}>
                  {parseI18nString(plugin.name, i18n.language) || plugin.pluginId}
                </Text>
                <Text fontSize={'xs'} color={'myGray.500'}>
                  {plugin.version} · {plugin.etag}
                </Text>
              </Box>
              <Text fontSize={'xs'} color={'myGray.500'}>
                {(plugin.permission ?? []).join(', ') || '-'}
              </Text>
            </Flex>
          ))}
        </VStack>
      </Box>
    );
  };

  if (!canManage) {
    return (
      <AccountContainer>
        <Flex h={'100%'} align={'center'} justify={'center'}>
          <EmptyTip text={t('account_team:team_plugin_no_permission')} />
        </Flex>
      </AccountContainer>
    );
  }

  return (
    <AccountContainer>
      <Flex h={'100%'} flexDirection={'column'} px={[4, 8]} py={[4, 6]} gap={4}>
        <Flex justify={'space-between'} align={'center'} gap={3} flexWrap={'wrap'}>
          <Box>
            <Text fontSize={'lg'} fontWeight={600} color={'myGray.900'}>
              {t('account:team_plugin')}
            </Text>
            <Text fontSize={'sm'} color={'myGray.500'}>
              {uploadEnabled
                ? t('account_team:team_plugin_upload')
                : t('account_team:team_plugin_upload_disabled')}
            </Text>
          </Box>
          <HStack>
            <SearchInput
              w={'260px'}
              value={searchKey}
              placeholder={
                tab === TeamPluginTabEnum.marketplace
                  ? t('account_team:team_plugin_marketplace_search')
                  : t('common:Search')
              }
              onChange={(e) => setSearchKey(e.target.value)}
            />
            {uploadEnabled && (
              <>
                <Input
                  ref={fileInputRef}
                  type={'file'}
                  multiple
                  accept={'.pkg,.zip'}
                  display={'none'}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length > 0) onUploadPkg(files);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant={'whitePrimary'}
                  isLoading={uploadingPkg}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('account_team:team_plugin_upload')}
                </Button>
              </>
            )}
          </HStack>
        </Flex>

        <FillRowTabs
          list={[
            { label: t('account_team:team_plugin_available'), value: TeamPluginTabEnum.available },
            {
              label: t('account_team:team_plugin_marketplace'),
              value: TeamPluginTabEnum.marketplace
            },
            { label: t('account_team:team_plugin_deleted'), value: TeamPluginTabEnum.deleted }
          ]}
          value={tab}
          onChange={(value) => {
            setSearchKey('');
            setTab(value as TeamPluginTabEnum);
          }}
        />

        {renderUploadPreview()}

        {tab === TeamPluginTabEnum.marketplace ? renderMarketplace() : renderPluginTable()}
      </Flex>
      <ConfirmDeletePluginModal />
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account', 'account_team']))
    }
  };
}

export default TeamPlugin;
