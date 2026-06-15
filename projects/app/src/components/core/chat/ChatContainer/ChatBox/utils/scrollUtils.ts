export const CHAT_GENERATING_SCROLL_BOTTOM_THRESHOLD = 150;
export const CHAT_SCROLL_BOTTOM_VISIBILITY_THRESHOLD = 4;
export const CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD = 48;

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

export const getChatScrollBottomDistance = ({
  scrollTop,
  clientHeight,
  scrollHeight
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}) => Math.max(scrollHeight - scrollTop - clientHeight, 0);

export const isChatScrollAtBottom = ({
  scrollTop,
  clientHeight,
  scrollHeight,
  threshold = CHAT_SCROLL_BOTTOM_VISIBILITY_THRESHOLD
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  threshold?: number;
}) =>
  getChatScrollBottomDistance({
    scrollTop,
    clientHeight,
    scrollHeight
  }) <= threshold;

export const shouldShowChatScrollToBottomButton = ({
  scrollTop,
  clientHeight,
  scrollHeight,
  userHasLeftBottom = true,
  threshold = CHAT_SCROLL_TO_BOTTOM_BUTTON_DISTANCE_THRESHOLD
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  userHasLeftBottom?: boolean;
  threshold?: number;
}) => {
  const bottomDistance = getChatScrollBottomDistance({
    scrollTop,
    clientHeight,
    scrollHeight
  });

  return userHasLeftBottom && bottomDistance > threshold;
};
