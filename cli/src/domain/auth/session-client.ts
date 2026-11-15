import { SESSION_PREFRESH_MS } from '@fastgpt/global/support/user/session/constants';
import type { FastGptHttpClient, HttpRequestAuth } from '../../infra/http/fastgpt-http-client';
import type { ConfigRepository } from '../../infra/config/config-repository';
import type { SecretStore } from '../../infra/secrets/secret-store';
import { withCredentialLock } from '../../infra/secrets/credential-lock';
import { CliAuthError, CliNetworkError } from '../../shared/errors';
import { maskSecret } from '../../shared/redact';
import {
  decodeSessionCredential,
  encodeSessionCredential,
  refreshNativeSession,
  isSameSessionContext,
  isSessionAccessExpired,
  isTemporarySessionRefreshError
} from './session-credentials';

/**
 * 为已持久化 Profile 绑定续约能力。每次进入锁后重新读取凭证，其他进程已经刷新时直接复用。
 * 锁只保护凭据读改写和刷新，不覆盖正常业务执行；显式 flag / env Token 不获得刷新资格。
 */
export const createSessionAwareClient = ({
  client,
  profileBaseUrl = client.baseUrl,
  profileName,
  configRepo,
  secretStore
}: {
  client: FastGptHttpClient;
  profileBaseUrl?: string;
  profileName: string;
  configRepo: ConfigRepository;
  secretStore: SecretStore;
}): FastGptHttpClient => {
  type PreparedAuth = { auth: HttpRequestAuth; refreshFailure?: unknown };
  const getAuth = async (requested: HttpRequestAuth, force = false): Promise<PreparedAuth> =>
    withCredentialLock({
      configDir: configRepo.getConfigDir(),
      fn: async (assertValid) => {
        const { config } = await configRepo.read();
        const profile = config.profiles[profileName];
        const stored = await secretStore.getSecret(profileName);
        if (
          !stored ||
          profile?.authType !== 'token' ||
          // 网络地址可由 flag / env 覆盖；并发检查针对解析时的持久化 Profile 快照。
          profile.baseUrl.replace(/\/+$/, '') !== profileBaseUrl.replace(/\/+$/, '')
        ) {
          throw new CliAuthError({
            code: 'AUTH_CONFLICT',
            message: 'The active profile changed. Run the command again.'
          });
        }
        const current = decodeSessionCredential(stored);
        if (current.secret !== requested.secret) {
          // 只允许同一设备、同一安全上下文的普通轮换，禁止旧命令跨团队或新登录执行。
          if (!isSameSessionContext(requested.secret, current.secret)) {
            throw new CliAuthError({
              code: 'AUTH_CONFLICT',
              message: 'The login or team context changed. Run the command again.'
            });
          }
          force = false;
        }
        if (!current.refreshToken || !current.session) return { auth: current };
        if (!force && (current.localAccessExpiresAt ?? 0) - Date.now() > SESSION_PREFRESH_MS)
          return { auth: current };
        const accessStillValid = () => (current.localAccessExpiresAt ?? 0) > Date.now();
        if (!force && accessStillValid() && (profile.refreshRetryAt ?? 0) > Date.now())
          return {
            auth: current,
            refreshFailure: new CliNetworkError(
              'Session renewal is temporarily unavailable. Try again shortly.'
            )
          };
        let refreshFailure: unknown;
        const next = await refreshNativeSession({ client, auth: current }).catch(async (error) => {
          const temporary = isTemporarySessionRefreshError(error);
          if (force || !temporary || !accessStillValid()) throw error;
          refreshFailure = error;
          // 锁内持久化短退避，避免多个 CLI 进程在故障期间依次重打刷新接口。
          assertValid();
          await configRepo.write({
            ...config,
            profiles: {
              ...config.profiles,
              [profileName]: { ...profile, refreshRetryAt: Date.now() + 3000 }
            }
          });
          return undefined;
        });
        if (!next) return { auth: current, refreshFailure };
        assertValid();
        await secretStore.setSecret(profileName, encodeSessionCredential(next));
        assertValid();
        await configRepo.write({
          ...config,
          profiles: {
            ...config.profiles,
            [profileName]: {
              ...profile,
              maskedSecret: maskSecret(next.secret),
              sessionExpiresAt: next.session!.refreshExpiresAt,
              accessExpiresAt: next.session!.accessExpiresAt,
              absoluteExpiresAt: next.session!.absoluteExpiresAt,
              refreshRetryAt: undefined,
              updatedAt: Date.now()
            }
          }
        });
        return { auth: decodeSessionCredential(encodeSessionCredential(next)) };
      }
    });

  const invoke = async <T>({
    auth,
    path,
    send,
    replayable = true
  }: {
    auth?: HttpRequestAuth;
    path: string;
    send: (auth?: HttpRequestAuth) => Promise<T>;
    replayable?: boolean;
  }): Promise<T> => {
    if (auth?.authType !== 'token' || path.includes('/account/session/')) return send(auth);
    const prepared = await getAuth(auth);
    const current = prepared.auth;
    try {
      return await send(current);
    } catch (error) {
      if (!replayable || !isSessionAccessExpired(error) || !current.refreshToken) throw error;
      if (prepared.refreshFailure) throw prepared.refreshFailure;
      return send((await getAuth(current, true)).auth);
    }
  };

  return {
    baseUrl: client.baseUrl,
    request: <T>(params: Parameters<FastGptHttpClient['request']>[0]) =>
      invoke<T>({
        auth: params.auth,
        path: params.path,
        send: (auth) => client.request<T>({ ...params, auth })
      }),
    requestRaw: (params) =>
      invoke({
        auth: params.auth,
        path: params.path,
        replayable: !(params.body instanceof ReadableStream),
        send: (auth) => client.requestRaw({ ...params, auth })
      }),
    uploadMultipart: <T>(params: Parameters<FastGptHttpClient['uploadMultipart']>[0]) =>
      invoke<T>({
        auth: params.auth,
        path: params.path,
        send: (auth) => client.uploadMultipart<T>({ ...params, auth })
      }),
    streamSse: async function* (params) {
      if (params.auth?.authType !== 'token') {
        yield* client.streamSse(params);
        return;
      }
      const prepared = await getAuth(params.auth);
      let auth = prepared.auth;
      for (let attempt = 0; attempt < 2; attempt++) {
        params.signal?.throwIfAborted();
        let emitted = false;
        let retry = false;
        try {
          for await (const event of client.streamSse({ ...params, auth })) {
            if (!emitted && event.event === 'error' && attempt === 0 && auth.refreshToken) {
              let data: unknown;
              try {
                data = JSON.parse(event.data);
              } catch {
                /* 原有调用方负责非 JSON 错误。 */
              }
              if (isSessionAccessExpired(data)) {
                retry = true;
                break;
              }
            }
            emitted = true;
            yield event;
          }
        } catch (error) {
          if (emitted || attempt !== 0 || !auth.refreshToken || !isSessionAccessExpired(error))
            throw error;
          retry = true;
        }
        if (!retry) return;
        params.signal?.throwIfAborted();
        if (prepared.refreshFailure) throw prepared.refreshFailure;
        auth = (await getAuth(auth, true)).auth;
      }
    }
  };
};
