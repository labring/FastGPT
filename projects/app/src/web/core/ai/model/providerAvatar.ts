/** 从 Provider 元数据中收集可预热的头像地址；空数组或空头像会被忽略。 */
export const getProviderAvatarUrls = (providers: Array<{ avatar?: string }> = []): string[] =>
  providers.map((provider) => provider.avatar).filter((avatar): avatar is string => !!avatar);
