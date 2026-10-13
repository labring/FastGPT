/** Keep links created before allowAnonymous was introduced publicly accessible. */
export const normalizeShareOutLinkAllowAnonymous = <T extends { allowAnonymous?: boolean }>(
  outLink: T
): T & { allowAnonymous: boolean } => ({
  ...outLink,
  allowAnonymous: outLink.allowAnonymous !== false
});
