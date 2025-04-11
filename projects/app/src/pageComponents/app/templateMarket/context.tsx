import { getTemplateMarketItemList, getTemplateTagList } from '@/web/core/app/api/template';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { createContext } from 'use-context-selector';

const recommendTag: TemplateTypeSchemaType = {
  typeId: AppTemplateTypeEnum.recommendation,
  typeName: i18nT('app:templateMarket.templateTags.Recommendation'),
  typeOrder: 0
};

type TemplateMarketContextType = {
  templateTags: TemplateTypeSchemaType[];
  templateList: AppTemplateSchemaType[];
  isTemplatesLoading: boolean;
};

export const TemplateMarketContext = createContext<TemplateMarketContextType>({
  templateTags: [],
  templateList: [],
  isTemplatesLoading: false
});

const TemplateMarketContextProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { currentAppType = 'all' } = useMemo(() => {
    return {
      currentAppType: router.query.appType as AppTypeEnum
    };
  }, [router.query.appType]);

  const { data: templateTags = [], loading: isLoadingTags } = useRequest2(
    () => getTemplateTagList().then((res) => [recommendTag, ...res]),
    {
      manual: false
    }
  );
  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    () => getTemplateMarketItemList({ type: currentAppType }),
    {
      manual: false,
      refreshDeps: [currentAppType]
    }
  );

  const contextValue: TemplateMarketContextType = {
    templateTags,
    templateList,
    isTemplatesLoading: isLoadingTags || isLoadingTemplates
  };

  return (
    <TemplateMarketContext.Provider value={contextValue}>{children}</TemplateMarketContext.Provider>
  );
};

export default TemplateMarketContextProvider;
