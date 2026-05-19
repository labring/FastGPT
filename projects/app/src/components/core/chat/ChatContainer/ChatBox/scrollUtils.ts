export const CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD = 150;

export const getChatScrollTargetKey = ({ appId, chatId }: { appId?: string; chatId?: string }) => {
  if (!appId || !chatId) return;
  return `${appId}:${chatId}`;
};

export const shouldForceScrollAfterRecordsLoaded = ({
  isChatRecordsLoaded,
  targetKey,
  lastScrolledTargetKey
}: {
  isChatRecordsLoaded: boolean;
  targetKey?: string;
  lastScrolledTargetKey?: string;
}) => {
  if (!isChatRecordsLoaded || !targetKey) return false;
  return targetKey !== lastScrolledTargetKey;
};

export const shouldFollowGeneratingScroll = ({
  scrollTop,
  clientHeight,
  scrollHeight,
  force = false,
  threshold = CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  force?: boolean;
  threshold?: number;
}) => force || scrollTop + clientHeight + threshold >= scrollHeight;
