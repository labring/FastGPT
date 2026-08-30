import AIModelSelector from '@/components/Select/AIModelSelector';
import type { SelectProps } from '@fastgpt/web/components/common/MySelect';
import React from 'react';

type Props = Omit<React.ComponentProps<typeof AIModelSelector>, 'list'> & {
  list: SelectProps['list'];
};

/**
 * 聊天场景沿用统一模型选择器：兼容读取旧 model，但选项值和变更事件始终使用 modelId。
 */
const ChatAIModelSelector = (props: Props) => <AIModelSelector {...props} />;

export default React.memo(ChatAIModelSelector);
