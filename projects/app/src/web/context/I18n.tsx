import { createContext, useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { TFunction } from 'i18next';

type I18nContextType = {
  commonT: TFunction<['common'], undefined>;
  fileT: TFunction<['file'], undefined>;
  workflowT: TFunction<['workflow'], undefined>;
};

export const I18nContext = createContext<I18nContextType>({
  // @ts-ignore
  commonT: undefined
});

const I18nContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { t: commonT } = useTranslation('common');
  const { t: fileT } = useTranslation('file');
  const { t: workflowT } = useTranslation('workflow');

  return (
    <I18nContext.Provider
      value={{
        commonT,
        fileT,
        workflowT
      }}
    >
      {children}
    </I18nContext.Provider>
  );
};

export default I18nContextProvider;

export const useI18n = () => {
  return useContextSelector(I18nContext, (ctx) => ctx);
};
