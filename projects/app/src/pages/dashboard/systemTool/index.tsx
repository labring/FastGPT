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
  ModalFooter,
  VStack,
  useDisclosure
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { getDocPath } from '@/web/common/system/doc';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  createPluginDebugSession,
  disconnectPluginDebugSession,
  getPluginDebugSessionStatus
} from '@/web/core/plugin/debug/api';
import {
  isUsablePluginDebugSessionStatus,
  type LocalPluginDebugSession,
  useLocalPluginDebugSession
} from '@/web/core/plugin/debug/localDebugSession';
import { isDebugToolId, isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import type { PluginDebugSessionStatusResponseType } from '@fastgpt/global/openapi/core/plugin/debug/api';

const ToolKitProvider = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

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
  const {
    session: debugSession,
    setSession: setLocalDebugSession,
    clearSession: clearLocalDebugSession
  } = useLocalPluginDebugSession();

  const loadTools = useCallback(
    () =>
      getTeamSystemPluginList({
        debugSessionId: debugSession?.debugSessionId
      }),
    [debugSession?.debugSessionId]
  );
  const { loading: loadingTools, runAsync: reloadTools } = useRequest(loadTools, {
    manual: false,
    refreshDeps: [debugSession?.debugSessionId],
    onSuccess(data) {
      setTools(data);
    }
  });

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
        isDebug: isDebugToolId(tool.id)
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
              {feConfigs?.docUrl && (
                <Button
                  mr={4}
                  onClick={() =>
                    window.open(getDocPath('/plugin/system-tool-development'), '_blank')
                  }
                >
                  {t('app:toolkit_contribute_resource')}
                </Button>
              )}
              <Button
                mr={4}
                variant={debugSession ? 'primaryOutline' : 'whiteBase'}
                leftIcon={
                  <MyIcon name={debugSession ? 'common/check' : 'core/workflow/debug'} w={'16px'} />
                }
                onClick={debugDisclosure.onOpen}
              >
                {debugSession ? '正在调试' : '本地调试'}
              </Button>
              {feConfigs?.submitPluginRequestUrl && (
                <Button
                  variant={'whiteBase'}
                  onClick={() => {
                    window.open(feConfigs.submitPluginRequestUrl);
                  }}
                >
                  {t('app:toolkit_marketplace_submit_request')}
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
                    key={tool.id}
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
          setSession={setLocalDebugSession}
          clearSession={clearLocalDebugSession}
          onRefreshTools={() => reloadTools()}
          onClose={debugDisclosure.onClose}
        />
      )}
    </Box>
  );
};

const terminalCommandStyle = {
  fontFamily: 'Menlo, Monaco, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all' as const
};

function getTeamToolQuerySource(source?: string) {
  if (isDebugToolSource(source)) return source;
  return source === 'system' ? 'system' : 'team';
}

function formatDebugSessionRemainTime(expiresAt?: number) {
  if (!expiresAt) return '-';
  const diff = Math.max(0, expiresAt - Date.now());
  const totalMinutes = Math.ceil(diff / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分`;
}

const DebugStatusText: Record<PluginDebugSessionStatusResponseType['status'], string> = {
  pending: '等待连接',
  connected: '已连接',
  disconnected: '已断开',
  revoked: '已结束',
  expired: '已过期'
};

function PluginDebugModal({
  session,
  setSession,
  clearSession,
  onRefreshTools,
  onClose
}: {
  session: LocalPluginDebugSession | null;
  setSession: (session: LocalPluginDebugSession) => void;
  clearSession: () => void;
  onRefreshTools: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { copyData } = useCopyData();
  const { toast } = useToast();
  const currentStatus = session?.status || 'pending';

  const { runAsync: createSession, loading: isCreating } = useRequest(createPluginDebugSession, {
    manual: true,
    onSuccess(data) {
      setSession({
        ...data,
        status: 'pending'
      });
    }
  });

  const { runAsync: refreshStatus, loading: isRefreshingStatus } = useRequest(
    async () => {
      if (!session) return;
      return getPluginDebugSessionStatus(session.debugSessionId);
    },
    {
      manual: true,
      errorToast: '',
      onSuccess(data) {
        if (!data) return;
        if (!isUsablePluginDebugSessionStatus(data.status)) {
          clearSession();
          return;
        }

        setSession({
          ...(session as LocalPluginDebugSession),
          source: data.source,
          expiresAt: data.expiresAt,
          status: data.status
        });
      }
    }
  );

  const { runAsync: disconnectSession, loading: isDisconnecting } = useRequest(
    async () => {
      if (!session) return;
      return disconnectPluginDebugSession(session.debugSessionId);
    },
    {
      manual: true,
      onSuccess() {
        clearSession();
        onRefreshTools();
      }
    }
  );

  useEffect(() => {
    if (!session) return;

    refreshStatus();
    const timer = window.setInterval(() => {
      refreshStatus();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refreshStatus, session?.debugSessionId]);

  return (
    <MyModal
      isOpen
      title={'本地调试'}
      iconSrc={'core/workflow/debug'}
      onClose={onClose}
      w={'720px'}
      maxW={['90vw', '720px']}
    >
      <ModalBody px={8} py={6}>
        <Flex alignItems={'center'} gap={2}>
          <Box fontSize={'24px'} fontWeight={'600'} color={'myGray.900'}>
            本地调试
          </Box>
          <MyTooltip
            label={
              '将调试链接粘贴到本地开发环境，即可在平台内接入测试插件。测试插件仅对调试者本人可见。'
            }
          >
            <Button size={'sm'} variant={'whiteBase'} px={3}>
              说明
            </Button>
          </MyTooltip>
        </Flex>
        <Box mt={3} color={'myGray.600'} fontSize={'sm'}>
          将该链接粘贴到本地开发环境，即可在平台内接入测试插件。测试插件仅对调试者本人可见。
        </Box>

        {!session ? (
          <Button
            mt={8}
            w={'180px'}
            variant={'primary'}
            isLoading={isCreating}
            onClick={() => createSession({})}
          >
            生成调试链接
          </Button>
        ) : (
          <>
            <Flex mt={8} alignItems={'center'} gap={3}>
              <Box
                flex={'1 0 0'}
                border={'base'}
                borderColor={'myGray.300'}
                borderRadius={'md'}
                bg={'myGray.50'}
                px={4}
                py={3}
                color={'myGray.900'}
                fontSize={'sm'}
                sx={terminalCommandStyle}
              >
                {session.cliCommand || session.connectUrl}
              </Box>
              <Button
                variant={'whiteBase'}
                h={'44px'}
                px={3}
                onClick={() => copyData(session.cliCommand || session.connectUrl)}
              >
                <MyIcon name={'copy'} w={'18px'} />
              </Button>
            </Flex>
            <Flex mt={3} alignItems={'center'} color={'myGray.600'} fontSize={'sm'} gap={4}>
              <Box>会话剩余有效时间：{formatDebugSessionRemainTime(session.expiresAt)}</Box>
              <Box>会话状态：{DebugStatusText[currentStatus]}</Box>
            </Flex>
          </>
        )}
      </ModalBody>

      {session && (
        <ModalFooter gap={3}>
          <Button
            variant={'whiteBase'}
            isLoading={isRefreshingStatus}
            onClick={async () => {
              await refreshStatus();
              await onRefreshTools();
              toast({
                title: '刷新成功',
                status: 'success'
              });
            }}
          >
            刷新插件列表
          </Button>
          <Button
            variant={'primaryOutline'}
            isLoading={isDisconnecting}
            onClick={() => disconnectSession()}
          >
            结束调试
          </Button>
        </ModalFooter>
      )}
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
