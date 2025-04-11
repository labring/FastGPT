import AppContainer from '@/pageComponents/account/AppContainer';
import StudioContextProvider from '@/pageComponents/app/context';
import TemplateList, { TemplateAppType } from '@/pageComponents/app/list/TemplateList';
import TemplateMarketContextProvider, {
  TemplateMarketContext
} from '@/pageComponents/app/templateMarket/context';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useContextSelector } from 'use-context-selector';

const TemplateMarket = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { templateTags, templateList } = useContextSelector(TemplateMarketContext, (v) => v);
  const { currentAppType = 'all', type } = useMemo(() => {
    return {
      currentAppType: router.query.appType as AppTypeEnum,
      type: router.query.type as string
    };
  }, [router.query.appType, router.query.type]);

  const filterTemplateTags = useMemo(() => {
    return templateTags
      .map((tag) => {
        const templates = templateList.filter((template) => template.tags.includes(tag.typeId));
        return {
          ...tag,
          templates
        };
      })
      .filter((item) => item.templates.length > 0);
  }, [templateList, templateTags]);

  return (
    <AppContainer
      rightContent={
        <MySelect<TemplateAppType>
          h={'8'}
          value={currentAppType}
          onChange={(value) => {
            router.push({
              query: {
                appType: value,
                type
              }
            });
          }}
          minW={'7rem'}
          borderRadius={'sm'}
          list={[
            { label: t('app:type.All'), value: 'all' },
            { label: t('app:type.Simple bot'), value: AppTypeEnum.simple },
            { label: t('app:type.Workflow bot'), value: AppTypeEnum.workflow },
            { label: t('app:type.Plugin'), value: AppTypeEnum.plugin }
          ]}
        />
      }
    >
      <TemplateList templateTags={filterTemplateTags} templateList={templateList} />
    </AppContainer>
  );
};

function ContextRender() {
  return (
    <StudioContextProvider>
      <TemplateMarketContextProvider>
        <TemplateMarket />
      </TemplateMarketContextProvider>
    </StudioContextProvider>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}
