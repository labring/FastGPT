'use client';
import { serviceSideProps } from '@/web/common/i18n/utils';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { Box, Flex, Grid } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useMemo, useRef, useState } from 'react';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  type AppTemplateSchemaType,
  type TemplateTypeSchemaType
} from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemDetail } from '@/web/core/app/api/template';
import { postCreateApp } from '@/web/core/app/api';
import { webPushTrack } from '@/web/common/middle/tracks/utils';

import dynamic from 'next/dynamic';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import AppMarketTabBar from '@/pageComponents/dashboard/templateMarket/AppMarketTabBar';
import AppMarketCard from '@/pageComponents/dashboard/templateMarket/AppMarketCard';

const UseGuideModal = dynamic(() => import('@/components/common/Modal/UseGuideModal'), {
  ssr: false
});

const TemplateMarket = ({
  templateList,
  templateTags,
  MenuIcon
}: {
  templateList: AppTemplateSchemaType[];
  templateTags: TemplateTypeSchemaType[];
  MenuIcon: JSX.Element;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const containerRef = useRef<HTMLDivElement>(null);

  const { parentId } = router.query as { parentId?: ParentIdType };
  const [searchKey, setSearchKey] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const { runAsync: onUseTemplate, loading: isCreating } = useRequest(
    async (template: AppTemplateSchemaType) => {
      const templateDetail = await getTemplateMarketItemDetail(template.templateId);

      if (template.type === AppTypeEnum.simple) {
        // TODO: 特殊类型
        const completeWorkflow = form2AppWorkflow(
          templateDetail.workflow as unknown as AppFormEditFormType,
          t
        );
        templateDetail.workflow = completeWorkflow;
      }

      return postCreateApp({
        parentId,
        avatar: template.avatar,
        name: template.name,
        type: template.type as AppTypeEnum,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig,
        templateId: templateDetail.templateId
      }).then((res) => {
        webPushTrack.useAppTemplate({
          id: res,
          name: template.name
        });
        return res;
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const tabs = useMemo(() => {
    const promotedCount = templateList.filter((item) => item.isPromoted).length;
    // Container.tsx 已将 recommendation tag 注入到 templateTags 且 typeName 已翻译，跳过以避免重复
    const tagCounts = templateTags
      .filter((tag) => tag.typeId !== AppTemplateTypeEnum.recommendation)
      .map((tag) => ({
        key: tag.typeId,
        label: t(tag.typeName as any),
        count: templateList.filter((item) => item.tags.includes(tag.typeId)).length
      }));
    return [{ key: 'all', label: t('common:All'), count: templateList.length }, ...tagCounts];
  }, [templateList, templateTags, t]);

  const filteredList = useMemo(() => {
    let list = templateList;
    if (activeTab === 'promoted') list = list.filter((item) => item.isPromoted);
    else if (activeTab !== 'all') list = list.filter((item) => item.tags.includes(activeTab));
    if (searchKey) list = list.filter((item) => `${item.name}${item.intro}`.includes(searchKey));
    return list;
  }, [templateList, activeTab, searchKey]);

  return (
    <MyBox ref={containerRef} h="100%" isLoading={isCreating}>
      <Flex flexDirection="column" h="100%" py={6}>
        {/* 头部：标题 + 搜索框 */}
        <Flex alignItems="center" px={4} mb={4}>
          {isPc ? (
            <Box fontSize="lg" color="myGray.900" fontWeight="medium">
              {t('common:app_market')}
            </Box>
          ) : (
            MenuIcon
          )}
        </Flex>

        {/* Tab 过滤栏和搜索框同行 */}
        <Flex px={4} mb={4} alignItems="center">
          <Box flex={1} minW={0}>
            <AppMarketTabBar tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
          </Box>
          <Box w="240px" flexShrink={0} ml="40px">
            <SearchInput
              h="36px"
              bg="white"
              placeholder={t('app:templateMarket.Search_template')}
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </Box>
        </Flex>

        {/* 卡片网格 */}
        <Flex flex="1 0 0" px={4} overflow="auto" flexDirection="column">
          {filteredList.length > 0 ? (
            <Grid
              gridTemplateColumns={[
                '1fr',
                'repeat(2,1fr)',
                'repeat(3,1fr)',
                'repeat(3,1fr)',
                'repeat(4,1fr)',
                'repeat(5,1fr)'
              ]}
              gridGap={4}
              alignItems="stretch"
              pb={5}
            >
              {filteredList.map((item) => (
                <AppMarketCard
                  key={item.templateId}
                  item={item}
                  templateTags={templateTags}
                  onClick={onUseTemplate}
                />
              ))}
            </Grid>
          ) : (
            <EmptyTip flex="1" justifyContent="center" py={0} text={t('app:template_market_empty_data')} />
          )}
        </Flex>
      </Flex>
    </MyBox>
  );
};

const TemplateMarketContainer = () => {
  return (
    <DashboardContainer>
      {({ templateTags, templateList, MenuIcon }) => (
        <TemplateMarket
          templateTags={templateTags}
          templateList={templateList}
          MenuIcon={MenuIcon}
        />
      )}
    </DashboardContainer>
  );
};

export default TemplateMarketContainer;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'account']))
    }
  };
}
