'use client';

import { serviceSideProps } from '@/web/common/i18n/utils';
import {
  getTeamSystemPluginList,
  getTeamToolDetail,
  getTeamToolVersions
} from '@/web/core/plugin/team/api';
import { getPluginToolTags } from '@/web/core/plugin/toolTag/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  Flex,
  Grid,
  Input,
  InputGroup,
  ModalBody,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useCallback, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { getDocPath } from '@/web/common/system/doc';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  enablePluginDebugChannel,
  getPluginDebugChannel,
  refreshPluginDebugConnectionKey,
  revokePluginDebugChannel
} from '@/web/core/plugin/debug/api';
import type {
  EnablePluginDebugChannelResponseType,
  GetPluginDebugChannelResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';

type PluginDebugSessionState = Pick<
  GetPluginDebugChannelResponseType,
  'tmbId' | 'source' | 'status' | 'enabled' | 'keyId' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<EnablePluginDebugChannelResponseType, 'connectionKey' | 'connectionUrl'>>;

const ToolKitProvider = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { feConfigs, initd, setShowProModal } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();
  const { toast } = useToast();

  const [searchText, setSearchText] = useState('');

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const debugDisclosure = useDisclosure();

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: tags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  // TODO: 把 filter 放到后端
  const [tools, setTools] = useState<GetTeamPluginListResponseType>([]);
  const [debugSession, setDebugSession] = useState<PluginDebugSessionState | null>(null);

  const loadTools = useCallback(() => getTeamSystemPluginList({}), []);
  const { loading: loadingTools, runAsync: refreshTools } = useRequest(loadTools, {
    manual: false,
    onSuccess(data) {
      setTools(data);
    }
  });

  const onOpenDebugModal = useCallback(() => {
    if (!feConfigs?.isPlus) {
      return setShowProModal(true);
    }

    if (!initd || !feConfigs?.pluginRemoteDebug) {
      return toast({
        title: t('app:toolkit_debug_remote_disabled'),
        status: 'warning'
      });
    }
    debugDisclosure.onOpen();
  }, [
    debugDisclosure,
    feConfigs?.isPlus,
    feConfigs?.pluginRemoteDebug,
    initd,
    setShowProModal,
    t,
    toast
  ]);

  useRequest(
    async () => {
      if (!initd || !feConfigs?.isPlus || !feConfigs?.pluginRemoteDebug) {
        return {
          tmbId: 'remote-debug-disabled',
          status: 'revoked',
          enabled: false,
          plugins: []
        } satisfies GetPluginDebugChannelResponseType;
      }

      return getPluginDebugChannel();
    },
    {
      manual: false,
      refreshDeps: [feConfigs?.isPlus, feConfigs?.pluginRemoteDebug, initd],
      onSuccess(data) {
        setDebugSession(isActiveDebugSession(data) ? data : null);
      }
    }
  );

  const displayTools = useMemo(() => {
    return tools
      .filter((tool) => {
        if (!searchText) return true;
        const name = tool.name.toLowerCase();
        const intro = tool.intro?.toLowerCase() || '';
        const search = searchText.toLowerCase();
        return name.includes(search) || intro.includes(search);
      })
      .filter((tool) => {
        if (selectedTagIds.length === 0) return true;
        return tool.tags?.some((tagId) => selectedTagIds.includes(tagId));
      })
      .map<ToolCardItemType>((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.intro,
        icon: tool.avatar,
        author: tool.author,
        tags: tool.tags?.map((tagId) =>
          parseI18nString(tags.find((tag) => tag.tagId === tagId)?.tagName || '', i18n.language)
        ),
        status: tool.status,
        version: tool.version,
        source: tool.source,
        isDebug: isDebugToolSource(tool.source)
      }));
  }, [tools, searchText, selectedTagIds, tags, i18n.language]);

  return (
    <Box h={'full'}>
      <MyBox
        bg={'white'}
        h={'full'}
        rounded={'8px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        isLoading={loadingTools && displayTools.length === 0}
      >
        <Box px={8} flexShrink={0}>
          {isPc && (
            <Flex alignItems={'center'}>
              <Box
                mt={8}
                mb={4}
                fontSize={'20px'}
                fontWeight={'medium'}
                color={'myGray.900'}
                flex={'1 0 0'}
              >
                {t('app:core.module.template.System Tools')}
              </Box>
              <Button mr={4} variant={'whiteBase'} onClick={onOpenDebugModal}>
                {t('app:toolkit_debug_local')}
              </Button>
              {feConfigs?.submitPluginRequestUrl && (
                <Button
                  mr={4}
                  variant={'whiteBase'}
                  onClick={() => {
                    window.open(feConfigs.submitPluginRequestUrl);
                  }}
                >
                  {t('app:toolkit_marketplace_submit_request')}
                </Button>
              )}
              {feConfigs?.docUrl && (
                <Button
                  onClick={() =>
                    window.open(getDocPath('/plugin/system-tool-development'), '_blank')
                  }
                >
                  {t('app:toolkit_contribute_resource')}
                </Button>
              )}
            </Flex>
          )}
          {/* Tags */}
          <Flex mt={2} mb={3} alignItems={'center'}>
            <Flex alignItems={'start'} flex={'1 0 0'} w={0} mr={[3, 10]}>
              {!isPc && (
                <Box mr={2} mt={2}>
                  {MenuIcon}
                </Box>
              )}
              {isPc && (
                <Flex
                  alignItems={'center'}
                  transition={'all 0.3s'}
                  w={isSearchExpanded ? '320px' : 'auto'}
                  mr={4}
                >
                  {isSearchExpanded ? (
                    <InputGroup>
                      <MyIcon
                        position={'absolute'}
                        zIndex={10}
                        left={2.5}
                        name={'common/searchLight'}
                        w={5}
                        color={'primary.600'}
                        top={'50%'}
                        transform={'translateY(-50%)'}
                      />
                      <Input
                        px={8}
                        h={'35px'}
                        borderRadius={'md'}
                        placeholder={t('common:search_tool')}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        autoFocus
                        onBlur={() => {
                          if (!searchText) {
                            setIsSearchExpanded(false);
                          }
                        }}
                      />
                      {searchText && (
                        <MyIcon
                          position={'absolute'}
                          zIndex={10}
                          right={2.5}
                          name={'common/closeLight'}
                          w={4}
                          top={'50%'}
                          transform={'translateY(-50%)'}
                          color={'myGray.500'}
                          cursor={'pointer'}
                          onClick={() => {
                            setSearchText('');
                            setIsSearchExpanded(false);
                          }}
                        />
                      )}
                    </InputGroup>
                  ) : (
                    <Flex
                      alignItems={'center'}
                      justifyContent={'center'}
                      cursor={'pointer'}
                      borderRadius={'md'}
                      _hover={{ bg: 'myGray.100' }}
                      onClick={() => setIsSearchExpanded(true)}
                      p={2}
                      h={'35px'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                    >
                      <MyIcon name={'common/searchLight'} w={5} color={'primary.600'} mr={2} />
                      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.500'}>
                        {t('common:Search')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              )}
              <Box flex={'1'} overflow={'auto'} mb={-1}>
                <ToolTagFilterBox
                  tags={tags}
                  selectedTagIds={selectedTagIds}
                  onTagSelect={setSelectedTagIds}
                />
              </Box>
            </Flex>
          </Flex>
        </Box>

        <Box flex={1} overflowY={'auto'} px={8} pb={6}>
          {displayTools.length > 0 ? (
            <Grid
              gridTemplateColumns={[
                '1fr',
                'repeat(2,1fr)',
                'repeat(2,1fr)',
                'repeat(3,1fr)',
                'repeat(4,1fr)'
              ]}
              gridGap={5}
              alignItems={'stretch'}
            >
              {displayTools.map((tool) => {
                return (
                  <ToolCard
                    key={getToolListItemKey(tool)}
                    item={tool}
                    systemTitle={feConfigs?.systemTitle}
                    mode="team"
                    onClickCard={() => setSelectedTool(tool)}
                    showActionButton={false}
                  />
                );
              })}
            </Grid>
          ) : (
            <VStack>
              {!loadingTools && (
                <>
                  <EmptyTip pb={4} />
                  {userInfo?.username === 'root' && (
                    <Button
                      onClick={() => {
                        router.push('/config/tool');
                      }}
                      w={'160px'}
                    >
                      {t('app:click_to_config')}
                    </Button>
                  )}
                </>
              )}
            </VStack>
          )}
        </Box>
      </MyBox>

      {!!selectedTool && (
        <ToolDetailDrawer
          onClose={() => setSelectedTool(null)}
          selectedTool={selectedTool}
          showPoint={false}
          showActionButton={false}
          systemTitle={feConfigs.systemTitle}
          onFetchDetail={async (toolId: string, version?: string) =>
            getTeamToolDetail({
              toolId,
              version,
              source: getTeamToolQuerySource(selectedTool.source)
            })
          }
          onFetchVersions={async (toolId: string) =>
            getTeamToolVersions({
              toolId,
              source: getTeamToolQuerySource(selectedTool.source)
            })
          }
          mode="team"
        />
      )}

      {debugDisclosure.isOpen && (
        <PluginDebugModal
          session={debugSession}
          setSession={setDebugSession}
          clearSession={() => setDebugSession(null)}
          onRefreshTools={refreshTools}
          onClose={debugDisclosure.onClose}
        />
      )}
    </Box>
  );
};

function isActiveDebugSession(
  session?: PluginDebugSessionState | null
): session is PluginDebugSessionState {
  return (
    !!session?.source &&
    session.enabled === true &&
    (session.status === 'enabled' || session.status === 'connected')
  );
}

const terminalCommandStyle = {
  fontFamily: 'Menlo, Monaco, Consolas, monospace',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const
};

function getTeamToolQuerySource(source?: string) {
  if (isDebugToolSource(source)) return source;
  return source === 'system' ? 'system' : 'team';
}

function getToolListItemKey(tool: ToolCardItemType) {
  return `${tool.source ?? 'unknown'}:${tool.id}`;
}

function buildPluginDebugConnectionLink(connectionKey?: string) {
  if (!connectionKey || typeof window === 'undefined') return '';

  const url = new URL(
    getWebReqUrl('/api/plugin/debug-channel/connection-key:exchange'),
    window.location.origin
  );
  url.searchParams.set('connectionKey', connectionKey);
  return url.toString();
}

function PluginDebugModal({
  session,
  setSession,
  clearSession,
  onRefreshTools,
  onClose
}: {
  session: PluginDebugSessionState | null;
  setSession: (session: PluginDebugSessionState) => void;
  clearSession: () => void;
  onRefreshTools: () => Promise<GetTeamPluginListResponseType>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const connectionKey = session?.connectionKey ?? '';
  const connectionUrl = useMemo(
    () => session?.connectionUrl || buildPluginDebugConnectionLink(connectionKey),
    [connectionKey, session?.connectionUrl]
  );
  const hasConnectionUrl = Boolean(connectionUrl);
  const tutorialUrl = getDocPath('/plugin/system-tool-development');

  const saveDebugSession = (data: EnablePluginDebugChannelResponseType) => {
    setSession({
      tmbId: data.tmbId,
      source: data.source,
      status: data.status,
      enabled: data.enabled,
      keyId: data.keyId,
      connectionKey: data.connectionKey,
      connectionUrl: data.connectionUrl,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  };

  const { runAsync: createSession, loading: isCreating } = useRequest(enablePluginDebugChannel, {
    manual: true,
    onSuccess(data) {
      saveDebugSession(data);
      onRefreshTools().catch(() => undefined);
    }
  });

  const { runAsync: refreshConnectionKey, loading: isRefreshingKey } = useRequest(
    refreshPluginDebugConnectionKey,
    {
      manual: true,
      onSuccess(data) {
        saveDebugSession(data);
        onRefreshTools().catch(() => undefined);
      }
    }
  );

  const { runAsync: disconnectSession, loading: isDisconnecting } = useRequest(
    async () => {
      if (!session) return;
      return revokePluginDebugChannel();
    },
    {
      manual: true,
      errorToast: '',
      onSuccess() {
        clearSession();
        onRefreshTools().catch(() => undefined);
      },
      onError() {
        clearSession();
        onRefreshTools().catch(() => undefined);
      }
    }
  );
  const isRefreshingConnection = isCreating || isRefreshingKey;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      showCloseButton={false}
      isCentered
      w={'580px'}
      maxW={['calc(100vw - 20px)', '580px']}
      borderRadius={'10px'}
      overflow={'hidden'}
    >
      <ModalBody p={8} position={'relative'}>
        <Button
          variant={'unstyled'}
          position={'absolute'}
          top={2}
          right={2}
          minW={'auto'}
          w={'36px'}
          h={'36px'}
          borderRadius={'4px'}
          color={'myGray.900'}
          onClick={onClose}
          aria-label={t('common:Close')}
        >
          <MyIcon name={'common/closeLight'} w={'20px'} />
        </Button>

        <Box fontSize={'20px'} fontWeight={'500'} color={'black'} lineHeight={'26px'}>
          {t('app:toolkit_debug_local')}
        </Box>
        <Box mt={6} color={'black'} fontSize={'14px'} lineHeight={'20px'}>
          {t('app:toolkit_debug_local_desc')}
        </Box>

        <Box mt={6}>
          <Flex
            color={'myGray.900'}
            fontSize={'14px'}
            fontWeight={'500'}
            lineHeight={'20px'}
            alignItems={'center'}
            justifyContent={'space-between'}
          >
            <Box>{t('app:toolkit_debug_connection_link')}</Box>
            {session && (
              <Button
                variant={'unstyled'}
                minW={'auto'}
                h={'20px'}
                px={1}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
                gap={1}
                color={'primary.600'}
                fontSize={'14px'}
                fontWeight={'500'}
                isLoading={isRefreshingConnection}
                onClick={() => refreshConnectionKey({})}
                aria-label={t('app:toolkit_debug_refresh_link')}
              >
                <MyIcon name={'common/refresh'} w={'16px'} />
                <Box as={'span'} lineHeight={'20px'}>
                  {t('app:toolkit_debug_refresh_link')}
                </Box>
              </Button>
            )}
          </Flex>
          <Box
            mt={2}
            position={'relative'}
            minH={'36px'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            borderRadius={'6px'}
            bg={'white'}
            px={3}
            py={2}
            pr={'44px'}
          >
            {session ? (
              <>
                <Box
                  color={'myGray.900'}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  sx={terminalCommandStyle}
                >
                  {connectionUrl || t('app:toolkit_debug_refresh_link_before_copy')}
                </Box>
                <Flex
                  position={'absolute'}
                  top={'8px'}
                  right={'10px'}
                  h={'18px'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <Button
                    variant={'unstyled'}
                    minW={'18px'}
                    h={'18px'}
                    color={hasConnectionUrl ? 'myGray.500' : 'myGray.300'}
                    cursor={hasConnectionUrl ? 'pointer' : 'not-allowed'}
                    onClick={() => hasConnectionUrl && copyData(connectionUrl)}
                    aria-label={t('app:toolkit_debug_copy_link')}
                    isDisabled={!hasConnectionUrl}
                  >
                    <MyIcon name={'copy'} w={'18px'} />
                  </Button>
                </Flex>
              </>
            ) : (
              <>
                <Box color={'myGray.500'} fontSize={'14px'} lineHeight={'20px'}>
                  {t('app:toolkit_debug_create_link_tip')}
                </Box>
                <Button
                  variant={'unstyled'}
                  position={'absolute'}
                  top={'50%'}
                  right={'10px'}
                  transform={'translateY(-50%)'}
                  minW={'auto'}
                  h={'20px'}
                  px={1}
                  color={'primary.600'}
                  fontSize={'14px'}
                  fontWeight={'500'}
                  isLoading={isCreating}
                  onClick={() => createSession({})}
                  aria-label={t('app:toolkit_debug_create_link')}
                >
                  {t('app:toolkit_debug_create_link')}
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Flex mt={6} h={'32px'} alignItems={'center'} justifyContent={'space-between'} gap={4}>
          <Button
            variant={'unstyled'}
            color={'primary.600'}
            fontSize={'14px'}
            fontWeight={'500'}
            h={'20px'}
            minW={'auto'}
            p={0}
            onClick={() => tutorialUrl && window.open(tutorialUrl, '_blank')}
          >
            {t('app:toolkit_user_guide')}
          </Button>
          {session && (
            <Button
              variant={'whiteBase'}
              h={'32px'}
              minW={'82px'}
              px={3.5}
              fontSize={'12px'}
              fontWeight={'500'}
              color={'primary.700'}
              borderColor={'primary.300'}
              isLoading={isDisconnecting}
              onClick={() => disconnectSession()}
            >
              {t('app:toolkit_debug_stop')}
            </Button>
          )}
        </Flex>
      </ModalBody>
    </MyModal>
  );
}

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => <ToolKitProvider MenuIcon={MenuIcon} />}
    </DashboardContainer>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}
