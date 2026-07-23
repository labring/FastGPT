import { APP_SANDBOX_ENABLED_CHAT_METADATA_KEY } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isAppSandboxEnabledInNodes } from '@fastgpt/global/core/workflow/utils';
import {
  assertSandboxAvailable,
  createAgentSandboxPermissionDeniedError,
  resolveAppSandboxAvailability,
  type AppSandboxAvailability
} from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import {
  authSandboxSession,
  type AuthSandboxSessionParams,
  type SandboxSessionAuthResult
} from './auth';

/**
 * 解析已鉴权 Sandbox Session 的产品可用性。
 *
 * App Chat Test 使用服务端保存的本轮调试开关，旧测试会话回退到草稿节点；其他 App Chat
 * 使用已发布版本。Skill Edit 和辅助调试属于强依赖场景，不返回静默降级原因。
 */
export async function resolveSandboxSessionAvailability(
  session: SandboxSessionAuthResult
): Promise<AppSandboxAvailability> {
  if (session.sourceType !== ChatSourceTypeEnum.app) {
    await assertSandboxAvailable(session.teamId);
    return { available: true };
  }

  if (!global.feConfigs?.show_agent_sandbox) {
    return resolveAppSandboxAvailability({ appEnabled: true, teamId: session.teamId });
  }

  const isChatTest = session.chat?.source === ChatSourceEnum.test;
  const chatTestEnabled = session.chat?.metadata?.[APP_SANDBOX_ENABLED_CHAT_METADATA_KEY];
  if (isChatTest && typeof chatTestEnabled === 'boolean') {
    return resolveAppSandboxAvailability({ appEnabled: chatTestEnabled, teamId: session.teamId });
  }

  const app = await MongoApp.findById(session.sourceId).lean();
  const appEnabled = isChatTest
    ? isAppSandboxEnabledInNodes(app?.modules ?? [])
    : isAppSandboxEnabledInNodes(
        (await getAppLatestVersion(session.sourceId, app ?? undefined)).nodes
      );

  return resolveAppSandboxAvailability({ appEnabled, teamId: session.teamId });
}

/** 统一记录并拒绝已经完成身份鉴权、但产品态不允许继续访问的 Sandbox Session。 */
async function assertSandboxRuntimeSessionAvailable({
  session
}: {
  session: SandboxSessionAuthResult;
}): Promise<void> {
  const availability = await resolveSandboxSessionAvailability(session);

  if (!availability.available) {
    throw createAgentSandboxPermissionDeniedError();
  }
}

/**
 * 鉴权并断言 Sandbox 文件/runtime API 可以访问目标 Session。
 *
 * 普通 App 的三种产品态关闭统一在创建或连接 Sandbox 前拒绝；Skill Edit 保留强阻断语义。
 */
export async function authSandboxRuntimeSession(
  authParams: AuthSandboxSessionParams
): Promise<SandboxSessionAuthResult> {
  const session = await authSandboxSession(authParams);
  await assertSandboxRuntimeSessionAvailable({ session });

  return session;
}
