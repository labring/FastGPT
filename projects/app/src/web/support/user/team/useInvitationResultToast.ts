import { useEffect } from 'react';
import z from 'zod';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';

const INVITATION_RESULT_TOAST_KEY = 'fastgpt:invitation-result-toast';
const InvitationResultToastSchema = z.object({
  userId: z.string().min(1),
  teamId: z.string().min(1),
  status: z.enum(['info', 'success'])
});

/** 暂存邀请处理结果，供目标团队页面初始化后展示；存储不可用时不阻断团队切换。 */
export const saveInvitationResultToast = (result: z.infer<typeof InvitationResultToastSchema>) => {
  try {
    window.sessionStorage.setItem(INVITATION_RESULT_TOAST_KEY, JSON.stringify(result));
  } catch (error) {
    console.error('[Team invitation] Failed to save invitation result:', error);
  }
};

/**
 * 等登录信息就绪后一次性消费邀请结果，保证 toast 的展示时长从目标页面开始计算。
 * 先删除再展示，避免重渲染或再次刷新重复提示；不同用户或团队的历史结果直接丢弃。
 */
export const useInvitationResultToast = () => {
  const { userInfo } = useUserStore();
  const { toast } = useToast();
  const userId = userInfo?._id;
  const teamId = userInfo?.team?.teamId;

  useEffect(() => {
    if (!userId || !teamId) return;

    try {
      const raw = window.sessionStorage.getItem(INVITATION_RESULT_TOAST_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(INVITATION_RESULT_TOAST_KEY);

      const result = InvitationResultToastSchema.safeParse(JSON.parse(raw));
      if (!result.success || result.data.userId !== userId || result.data.teamId !== teamId) {
        return;
      }

      toast({
        status: result.data.status,
        title:
          result.data.status === 'info'
            ? 'account_team:already_joined'
            : 'account_team:join_team_success',
        duration: 3000
      });
    } catch (error) {
      console.error('[Team invitation] Failed to read invitation result:', error);
    }
  }, [teamId, toast, userId]);
};
