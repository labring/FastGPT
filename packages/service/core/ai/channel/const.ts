/**
 * groupId convention (design §2.9.1): one group per team member, unique owner of
 * that member's channels. aiproxy relay scope headers reference these ids.
 *
 * Kept as a leaf module (no other imports) so it can be imported from
 * `core/ai/config.ts` without pulling the aiproxy admin API client chain
 * (thirdProvider config / axios) into setup-time module graphs — test files
 * mock those modules per-file and a setup-time load would bypass the mocks.
 */
export const getSystemGroupId = (tmbId: string): string => `fastgpt:tmb:${tmbId}`;
