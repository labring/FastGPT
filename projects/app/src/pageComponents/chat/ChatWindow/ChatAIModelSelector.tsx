import AIModelSelector, { type AIModelSelectorProps } from '@/components/Select/AIModelSelector';

/**
 * Chat-scene model selector: thin wrapper over AIModelSelector with a rounded border.
 * Data loading (pagination/search/selected-echo) is handled by AIModelSelector.
 */
const ChatAIModelSelector = (props: AIModelSelectorProps) => {
  return <AIModelSelector {...props} borderRadius={'10px'} />;
};

export default ChatAIModelSelector;
