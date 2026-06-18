import ApiKeyTable from '@/components/support/apikey/Table';
import { useTranslation } from 'next-i18next';

const API = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  return <ApiKeyTable tips={t('publish:app_key_tips')} appId={appId} mode="publish" />;
};

export default API;
