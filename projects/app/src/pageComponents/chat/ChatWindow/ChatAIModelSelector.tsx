import AIModelSelector from '@/components/Select/AIModelSelector';
import React from 'react';

type Props = React.ComponentProps<typeof AIModelSelector>;

/**
 * 聊天场景沿用统一模型选择器：兼容读取旧 model，但选项值和变更事件始终使用 modelId。
 */
const ChatAIModelSelector = (props: Props) => <AIModelSelector {...props} />;

export default React.memo(ChatAIModelSelector);
