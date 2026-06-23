import ApiKeyTable from '@/components/support/apikey/Table';
import { useTranslation } from 'next-i18next';

const API = () => {
  const { t } = useTranslation();
  return <ApiKeyTable mode="publish" />;
};

export default API;
