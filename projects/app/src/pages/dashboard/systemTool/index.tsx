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
import { Box, Button, Flex, Grid, Input, InputGroup, VStack } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import ToolCard, { type ToolCardItemType } from '@fastgpt/web/components/core/plugin/tool/ToolCard';
import ToolTagFilterBox from '@fastgpt/web/components/core/plugin/tool/TagFilterBox';
import ToolDetailDrawer from '@fastgpt/web/components/core/plugin/tool/ToolDetailDrawer';
import { useUserStore } from '../../../web/support/user/useUserStore';
import { useRouter } from 'next/router';
import { getDocPath } from '@/web/common/system/doc';
import type { GetTeamPluginListResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/dto';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const ToolKitProvider = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();

  const [searchText, setSearchText] = useState('');

  const [selectedTool, setSelectedTool] = useState<ToolCardItemType | null>(null);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const { data: tags = [] } = useRequest(getPluginToolTags, {
    manual: false
  });

  // TODO: 把 filter 放到后端
  const [tools, setTools] = useState<GetTeamPluginListResponseType>([]);
  const { loading: loadingTools } = useRequest(() => getTeamSystemPluginList({}), {
    manual: false,
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
        source: tool.source
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
                    window.open(
                      getDocPath('/guide/build/tools/system-plugins/dev_system_tool'),
                      '_blank'
                    )
                  }
                >
                  {t('app:toolkit_contribute_resource')}
                </Button>
              )}
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
              source: selectedTool.source === 'system' ? 'system' : 'team'
            })
          }
          onFetchVersions={async (toolId: string) =>
            getTeamToolVersions({
              toolId,
              source: selectedTool.source === 'system' ? 'system' : 'team'
            })
          }
          mode="team"
        />
      )}
    </Box>
  );
};

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
