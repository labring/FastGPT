import { getRecentlyUsedApps } from '@/web/core/app/api';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMount } from 'ahooks';
import { useState, useEffect } from 'react';

export const useChat = (appId: string) => {
  const { setSource, setAppId } = useChatStore();
  const { userInfo, initUserInfo } = useUserStore();

  const [isInitedUser, setIsInitedUser] = useState(false);

  // get app list
  const { data: myApps = [] } = useRequest2(() => getRecentlyUsedApps({ getRecentlyChat: true }), {
    manual: false,
    errorToast: '',
    refreshDeps: [userInfo],
    pollingInterval: 30000
  });

  // initialize user info
  useMount(async () => {
    // ensure store has current appId before setting source (avoids fallback to lastChatAppId)
    if (appId) setAppId(appId);
    try {
      await initUserInfo();
    } catch (error) {
      console.log('User not logged in:', error);
    } finally {
      setSource('online');
      setIsInitedUser(true);
    }
  });

  // sync appId to store as soon as route/appId changes
  useEffect(() => {
    if (appId) {
      setAppId(appId);
    }
  }, [appId, setAppId, userInfo]);

  return {
    isInitedUser,
    userInfo,
    myApps
  };
};
