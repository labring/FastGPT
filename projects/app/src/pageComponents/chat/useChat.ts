import { getMyApps } from '@/web/core/app/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMount } from 'ahooks';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const useChat = (appId: string) => {
  const { setSource, setAppId } = useChatStore();
  const { userInfo, initUserInfo } = useUserStore();

  const [isInitedUser, setIsInitedUser] = useState(false);

  // get app list
  const { data: myApps = [] } = useRequest2(() => getMyApps({ getRecentlyChat: true }), {
    manual: false,
    errorToast: '',
    refreshDeps: [userInfo],
    pollingInterval: 30000
  });

  // initialize user info
  useMount(async () => {
    try {
      await initUserInfo();
    } catch (error) {
      console.log('User not logged in:', error);
    } finally {
      setSource('online');
      setIsInitedUser(true);
    }
  });

  // watch appId
  useEffect(() => {
    if (!userInfo || !appId) return;
    setAppId(appId);
  }, [appId, setAppId, userInfo]);

  return {
    isInitedUser,
    userInfo,
    myApps
  };
};
