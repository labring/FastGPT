import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';

type ChatItemGroup = {
  type: 'deleted' | 'normal';
  items: ChatSiteItemType[];
};

export function groupChatItemsByDeleteStatus(items: ChatSiteItemType[]) {
  const groups: ChatItemGroup[] = [];
  let currentGroup: ChatItemGroup | null = null;

  items.forEach((item) => {
    const isDeleted = !!item.deleteTime;
    const groupType = isDeleted ? 'deleted' : 'normal';

    if (!currentGroup || currentGroup.type !== groupType) {
      // Start a new group
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = {
        type: groupType,
        items: [item]
      };
    } else {
      // Add to current group
      currentGroup.items.push(item);
    }
  });

  // Push the last group
  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
}
