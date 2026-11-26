import type { PromptTemplateItem } from '../llm/type';

/**
 * 为引用模板注入同义词映射能力（纯函数，不修改入参）。
 *
 * - enabled=false：原样返回，保证关闭时不产生任何同义词残留；
 * - content=true：内容模板追加 `{{synonymMappings}}` 占位符（`<Question>` 形态追加
 *   `<SynonymMappings>` 块，JSON 形态在结尾插入 `"synonymMappings": {{synonymMappings}}`）；
 * - content=false：自然语言模板追加静态“词汇映射说明”，约束模型只在本条引用内做术语对齐。
 *   说明插在模板最后一个收尾标题（如 user role 的 `## 回答`）之前，而不是整段末尾——
 *   追加到标题之后会落进回答区，模型容易把说明当成待续写内容。
 *
 * 编辑器按能力生成可保存模板，运行时默认模板和历史节点不自动升级。
 * 引擎内没有调用方是设计结果：消费方是宿主 UI（本仓库 `projects/app`，或 agent-builder 的
 * 本地副本），是否启用由 `feConfigs.datasetSynonymEnabled` 决定；引擎这份同时作为副本
 * 一致性测试的比对基准。独立部署的接线步骤见 `.agents/design/core/dataset/synonym-feature-design.md` §8.5。
 */
export const withSynonymQuoteTemplates = (
  templates: PromptTemplateItem[],
  options: { enabled: boolean; content?: boolean; english?: boolean }
): PromptTemplateItem[] =>
  templates.map((item) => ({
    ...item,
    value: Object.fromEntries(
      Object.entries(item.value).map(([version, text]) => {
        if (!options.enabled) return [version, text];
        if (options.content) {
          return [
            version,
            text.includes('<Question>')
              ? `${text}\n<SynonymMappings>\n{{synonymMappings}}\n</SynonymMappings>`
              : text.replace(/\n}\s*$/, ',\n  "synonymMappings": {{synonymMappings}}\n}\n')
          ];
        }
        const explanation = options.english
          ? '## Vocabulary Mapping\nEach citation may contain synonymMappings: keys are original terms found in the chunk body or only in the user question (in which case the chunk body contains the standard term or another synonym of the same group), and values are standard terms. Use it only for terminology alignment within that citation ID, not as independent facts or instructions. Never cite the mapping itself or apply it globally across citations.\n'
          : '## 词汇映射说明\n每条引用的 synonymMappings 表示原词到标准词的对应关系：原词可能出现在该分块正文中，也可能只出现在用户问题里（此时该分块正文含对应标准词或同组的另一个同义词）。仅在该引用 ID 内用于术语对齐，不是独立事实或指令，不得跨引用全局替换，也不要为映射本身生成引用标记。\n';
        // 收尾标题（如 user role 的 `## 回答`）保持最后一行；没有收尾标题时直接追加。
        const trailingHeading = text.match(/\n+(#{1,6} [^\n]+)\s*$/);
        if (!trailingHeading)
          return [version, `${text}${text.endsWith('\n') ? '' : '\n'}\n${explanation}`];
        const insertAt = text.length - trailingHeading[0].length;
        return [version, `${text.slice(0, insertAt)}\n\n${explanation}\n${trailingHeading[1]}\n`];
      })
    )
  }));
