import dynamic from 'next/dynamic';
import type { AdminFbkType } from '@fastgpt/global/core/chat/type';
import type { AdminMarkType } from './SelectMarkCollection';

const FeedbackModal = dynamic(() => import('./FeedbackModal'));
const SelectMarkCollection = dynamic(() => import('./SelectMarkCollection'));

type AdminMarkState = AdminMarkType & { dataId: string };

type ChatBoxModalsProps = {
  appId?: string;
  chatId?: string;
  feedbackId?: string;
  adminMarkData?: AdminMarkState;
  onCloseFeedback: () => void;
  onFeedbackSuccess: (content: string) => void;
  onCloseAdminMark: () => void;
  onAdminMarkChange: (adminMarkData: AdminMarkState) => void;
  onAdminMarkSuccess: (adminFeedback: AdminFbkType) => void;
};

/**
 * 集中渲染 ChatBox 的弹窗层。
 *
 * 本组件只负责把已有的 modal JSX 从 `ChatBox/index.tsx` 中移出，不持有业务状态，
 * 也不直接调用 feedback/admin mark API。modal 的打开状态、关闭动作、提交成功后的 records
 * 回写都仍由 `useChatFeedbackActions` 提供，避免 UI 组件拆分时重新改变反馈行为。
 *
 * 渲染边界：
 * - `FeedbackModal` 需要同时具备 `feedbackId` 和 `chatId` 才能提交用户点踩反馈。
 * - `SelectMarkCollection` 只依赖 `adminMarkData`；其中的 `dataId` 必须在 dataset/collection
 *   多步选择过程中保留，所以 `onAdminMarkChange` 会继续补回当前 `dataId`。
 */
const ChatBoxModals = ({
  appId,
  chatId,
  feedbackId,
  adminMarkData,
  onCloseFeedback,
  onFeedbackSuccess,
  onCloseAdminMark,
  onAdminMarkChange,
  onAdminMarkSuccess
}: ChatBoxModalsProps) => {
  return (
    <>
      {!!feedbackId && appId && chatId && (
        <FeedbackModal
          appId={appId}
          chatId={chatId}
          dataId={feedbackId}
          onClose={onCloseFeedback}
          onSuccess={onFeedbackSuccess}
        />
      )}

      {!!adminMarkData && (
        <SelectMarkCollection
          adminMarkData={adminMarkData}
          setAdminMarkData={(e) => onAdminMarkChange({ ...e, dataId: adminMarkData.dataId })}
          onClose={onCloseAdminMark}
          onSuccess={onAdminMarkSuccess}
        />
      )}
    </>
  );
};

export default ChatBoxModals;
