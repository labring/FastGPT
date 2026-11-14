/** API 与 UI 验证使用完整拼图契约，避免图片字符串假响应掩盖字段缺失。 */
export const puzzleCaptchaFixture = {
  challengeId: 'a'.repeat(64),
  captchaImage: 'data:image/png;base64,iVBORw0KGgo=',
  mode: 'rotate' as const,
  width: 224,
  height: 224,
  expiresAt: '2099-01-01T00:00:00.000Z'
};
