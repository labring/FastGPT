import React from 'react';
import { Box } from '@chakra-ui/react';
import ChatLanguageSelector from './LanguageSelector';

type Props = {
  showHistory: string;
  showHead: string;
  isPlugin: boolean;
};

/**
 * 分享页隐藏历史侧栏后提供独立语言入口；仍遵守隐藏头部与插件视图的展示约定。
 * 复用现有选择器，保持桌面弹出菜单、移动端抽屉及分享页独立语言存储的行为。
 */
const ShareChatLanguageEntry = ({ showHistory, showHead, isPlugin }: Props) => {
  if (showHistory === '1' || showHead !== '1' || isPlugin) return null;

  return (
    <Box px={4} py={2} flexShrink={0} alignSelf="flex-end" maxW="100%">
      <ChatLanguageSelector mode="share" />
    </Box>
  );
};

export default ShareChatLanguageEntry;
