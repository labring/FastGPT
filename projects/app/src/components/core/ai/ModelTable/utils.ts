/** 仅保留至少有一个已添加模型的提供商，保持系统提供商配置中的展示顺序。 */
export const filterAddedModelProviders = <T extends { id: string }>(
  providers: T[],
  addedProviderIds: ReadonlySet<string>
): T[] => providers.filter((provider) => addedProviderIds.has(provider.id));

/** 团队模型不参与平台计费；系统模型的零价和空值均表示未配置。 */
export const getModelPriceDisplayValue = ({
  isSystem,
  price
}: {
  isSystem: boolean;
  price?: number;
}): number | '-' => (isSystem && typeof price === 'number' && price > 0 ? price : '-');
