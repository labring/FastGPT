import { Box, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { AUTH_ERROR_EVENT_NAME, type AuthErrorEventDetail } from '@/web/common/api/request';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthLoginRedirectPath } from '@/web/support/user/loginRedirect/url';

type UseWorkflowAuthExpiredDraftProps = {
  leaveSaveSignRef: MutableRefObject<boolean>;
  saveLocalDraft: () => boolean;
};

/**
 * 处理工作流编辑页登录过期后的本地草稿保护流程。
 *
 * 这里集中维护鉴权失败相关的临时状态：
 * - 首次 403 允许请求拦截器跳转登录页，从而触发一次浏览器离开确认；
 * - 如果用户取消浏览器确认并停留当前页，展示应用内登录过期提示；
 * - 如果 403 来自刷新前的自动保存请求，不再触发第二次登录跳转，避免系统弹窗循环；
 * - 点击重新登录时主动关闭离开保护，直接进入登录页恢复草稿。
 */
export const useWorkflowAuthExpiredDraft = ({
  leaveSaveSignRef,
  saveLocalDraft
}: UseWorkflowAuthExpiredDraftProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [showAuthExpiredModal, setShowAuthExpiredModal] = useState(false);
  const authExpiredRedirecting = useRef(false);
  const authExpiredDraftSaved = useRef(false);
  const beforeUnloadAutoSaving = useRef(false);
  const authExpiredModalTimer = useRef<number>();

  const getLoginRoute = useCallback(() => {
    return getAuthLoginRedirectPath({
      lastRoute: location.pathname + location.search
    });
  }, []);

  const showAuthExpiredNotice = useCallback(() => {
    window.clearTimeout(authExpiredModalTimer.current);
    authExpiredModalTimer.current = window.setTimeout(() => {
      setShowAuthExpiredModal(true);
    });
  }, []);

  useEffect(() => {
    const handleAuthError = (event: Event) => {
      const detail = (event as CustomEvent<AuthErrorEventDetail>).detail;
      const savedDraft = saveLocalDraft();
      if (!savedDraft && !authExpiredDraftSaved.current) return;

      authExpiredDraftSaved.current = savedDraft || authExpiredDraftSaved.current;

      if (authExpiredRedirecting.current || beforeUnloadAutoSaving.current) {
        // 已进入鉴权失败处理，或当前 403 来自 beforeunload 自动保存：不再触发登录跳转，避免系统弹窗循环。
        authExpiredRedirecting.current = true;
        detail.skipClearToken = true;
        detail.skipRedirect = true;
        showAuthExpiredNotice();
        return;
      }

      authExpiredRedirecting.current = true;
      // 首次 403 仍允许请求拦截器触发登录跳转，从而只出现一次浏览器离开确认；但跳过 logout 请求避免二次跳转。
      detail.skipClearToken = true;
    };

    window.addEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    return () => {
      window.removeEventListener(AUTH_ERROR_EVENT_NAME, handleAuthError);
    };
  }, [saveLocalDraft, showAuthExpiredNotice]);

  useEffect(() => {
    return () => {
      window.clearTimeout(authExpiredModalTimer.current);
    };
  }, []);

  const handleBeforeUnloadAuthExpired = useCallback(() => {
    const isAuthExpiredRedirecting = authExpiredRedirecting.current;

    if (isAuthExpiredRedirecting && authExpiredDraftSaved.current) {
      showAuthExpiredNotice();
    }

    return {
      isAuthExpiredRedirecting
    };
  }, [showAuthExpiredNotice]);

  const setBeforeUnloadAutoSaving = useCallback((saving: boolean) => {
    beforeUnloadAutoSaving.current = saving;
  }, []);

  const shouldSkipUnmountAutoSave = useCallback(() => {
    return authExpiredRedirecting.current;
  }, []);

  const handleRelogin = useCallback(() => {
    leaveSaveSignRef.current = false;
    authExpiredRedirecting.current = false;
    beforeUnloadAutoSaving.current = false;
    window.clearTimeout(authExpiredModalTimer.current);
    router.replace(getLoginRoute());
  }, [getLoginRoute, leaveSaveSignRef, router]);

  const handleCancelRelogin = useCallback(() => {
    setShowAuthExpiredModal(false);
  }, []);

  const authExpiredModal = useMemo(() => {
    if (!showAuthExpiredModal) return null;

    return (
      <MyModal
        isOpen
        isCentered
        size={'sm'}
        title={t('workflow:workflow_local_draft_auth_expired_title')}
        showCloseButton={false}
        closeOnOverlayClick={false}
        borderRadius={'10px'}
        footer={
          <>
            <Button variant={'whiteBase'} onClick={handleCancelRelogin}>
              {t('common:Cancel')}
            </Button>
            <Button onClick={handleRelogin}>{t('workflow:workflow_local_draft_relogin')}</Button>
          </>
        }
      >
        <Box>{t('workflow:workflow_local_draft_auth_expired_notice')}</Box>
      </MyModal>
    );
  }, [handleCancelRelogin, handleRelogin, showAuthExpiredModal, t]);

  return {
    authExpiredModal,
    handleBeforeUnloadAuthExpired,
    setBeforeUnloadAutoSaving,
    shouldSkipUnmountAutoSave
  };
};
