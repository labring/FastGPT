import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { ChatFeedbackContext } from '../../context/chatFeedbackContext';

const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./SelectMarkCollection'));

/** 从反馈 Context 获取弹窗状态与操作，ChatBox 不再透传反馈 props。 */
const ChatBoxModals = () => {
  const feedback = useContextSelector(ChatFeedbackContext, (value) => value);
  if (!feedback) return null;

  const { feedbackId, adminMarkData, setFeedbackId, setAdminMarkData } = feedback;
  return (
    <>
      {!!feedbackId && (
        <FeedbackModal
          isLoading={feedback.pendingFeedbackIds.includes(feedbackId)}
          onClose={() => setFeedbackId(undefined)}
          onSubmit={feedback.onSubmitUserDislike}
        />
      )}

      {!!adminMarkData && (
        <SelectMarkCollection
          adminMarkData={adminMarkData}
          setAdminMarkData={(e) => setAdminMarkData({ ...e, dataId: adminMarkData.dataId })}
          onClose={() => setAdminMarkData(undefined)}
          onSuccess={feedback.onAdminMarkSuccess}
        />
      )}
    </>
  );
};

export default ChatBoxModals;
