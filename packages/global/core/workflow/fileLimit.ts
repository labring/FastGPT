const normalizeFileAmount = (amount: number) => Math.max(0, Math.floor(amount));

/** 用户文件数量配额：团队套餐已配置时使用团队值，否则回退到系统值。 */
export const getUserFileAmountLimit = ({
  teamMaxFileAmount,
  systemMaxFileAmount
}: {
  teamMaxFileAmount?: number;
  systemMaxFileAmount: number;
}) => normalizeFileAmount(teamMaxFileAmount ?? systemMaxFileAmount);

/** 模块文件数量上限取模块配额和用户配额的较小值；模块未配置时使用用户配额。 */
export const getFileAmountLimit = ({
  teamMaxFileAmount,
  systemMaxFileAmount,
  moduleMaxFileAmount,
  defaultModuleMaxFileAmount
}: {
  teamMaxFileAmount?: number;
  systemMaxFileAmount: number;
  moduleMaxFileAmount?: number;
  defaultModuleMaxFileAmount?: number;
}) => {
  const userLimit = getUserFileAmountLimit({ teamMaxFileAmount, systemMaxFileAmount });
  return getModuleFileAmountLimit({
    userMaxFileAmount: userLimit,
    moduleMaxFileAmount,
    defaultModuleMaxFileAmount
  });
};

/** 已解析用户配额的执行链中，仅计算模块的有效文件数量上限。 */
export const getModuleFileAmountLimit = ({
  userMaxFileAmount,
  moduleMaxFileAmount,
  defaultModuleMaxFileAmount
}: {
  userMaxFileAmount: number;
  moduleMaxFileAmount?: number;
  defaultModuleMaxFileAmount?: number;
}) => {
  const userLimit = normalizeFileAmount(userMaxFileAmount);
  const configuredModuleLimit = moduleMaxFileAmount ?? defaultModuleMaxFileAmount;
  if (configuredModuleLimit === undefined) return userLimit;

  return Math.min(userLimit, normalizeFileAmount(configuredModuleLimit));
};

/** 用户单文件大小配额，输入单位为 MB，输出单位为字节。 */
export const getFileSizeLimitBytes = ({
  teamMaxFileSize,
  systemMaxFileSize
}: {
  teamMaxFileSize?: number;
  systemMaxFileSize: number;
}) => Math.max(0, teamMaxFileSize ?? systemMaxFileSize) * 1024 * 1024;
