type ConfigFormIssue = { path: (string | number)[]; message: string };

/**
 * 将配置 API 的域路径映射到页面字段。多域页面允许显式声明路径别名；
 * 其余字段按完整后缀匹配，避免仅按叶子名把同名 URL、Token 标到错误的控件。
 */
export const getConfigFormErrors = ({
  error,
  values,
  aliases = {}
}: {
  error: unknown;
  values: Record<string, unknown>;
  aliases?: Record<string, string>;
}): { name: string; message: string }[] => {
  const response = error as { zodError?: ConfigFormIssue[]; issues?: ConfigFormIssue[] } | null;
  const issues = response?.zodError ?? response?.issues;
  if (!Array.isArray(issues)) return [];

  const names: string[] = [];
  const collect = (value: unknown, prefix = '') => {
    if (!value || typeof value !== 'object' || value instanceof Date) return;
    for (const [key, child] of Object.entries(value)) {
      const name = prefix ? `${prefix}.${key}` : key;
      names.push(name);
      collect(child, name);
    }
  };
  collect(values);
  names.sort((a, b) => b.length - a.length);

  return issues.flatMap((issue) => {
    if (!Array.isArray(issue.path) || typeof issue.message !== 'string') return [];
    const path = issue.path.join('.');
    const alias = Object.keys(aliases)
      .sort((a, b) => b.length - a.length)
      .find((key) => path === key || path.startsWith(`${key}.`));
    const mapped = alias ? `${aliases[alias]}${path.slice(alias.length)}` : path;
    const name =
      names.find((name) => mapped === name || mapped.endsWith(`.${name}`)) ??
      (alias && names.includes(aliases[alias]) ? aliases[alias] : undefined);
    if (!name) return [];
    // 对象级错误需要同步标红其输入叶子，受控组件不会自动继承祖先字段错误。
    const descendants = names.filter((candidate) => candidate.startsWith(`${name}.`));
    const fields = descendants.length
      ? descendants.filter(
          (candidate) => !descendants.some((other) => other.startsWith(`${candidate}.`))
        )
      : [name];
    return fields.map((name) => ({ name, message: issue.message }));
  });
};
