import ApiKeyTable from '@/components/support/apikey/Table';

const API = ({ appId }: { appId: string }) => {
  return <ApiKeyTable mode="publish" appId={appId} />;
};

export default API;
