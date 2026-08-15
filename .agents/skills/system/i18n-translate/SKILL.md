---
name: i18n-translate
description: Translate one, multiple, or all explicitly requested FastGPT i18next namespace JSON files from the completed Simplified Chinese source into every supported target locale, with product-language research and structural validation. Use only when the user explicitly invokes `$i18n-translate` and identifies namespace names, files under `packages/web/i18n/zh-CN/`, or all namespaces; never trigger implicitly for ordinary i18n, copywriting, or documentation work.
---

# FastGPT i18n Namespace Translation

Treat `packages/web/i18n/zh-CN/<namespace>.json` as the semantic and structural source of truth. Translate the specified namespace into all sibling locale directories without changing runtime behavior.

Before translating, read both of these references completely:

- [references/translation-guidelines.md](references/translation-guidelines.md)
- [references/fastgpt-glossary.json](references/fastgpt-glossary.json)

## Workflow

### 1. Resolve and constrain the scope

- Require explicit namespace names, source files, or `all` from the user.
- Resolve a bare namespace such as `app` to `packages/web/i18n/zh-CN/app.json`.
- Resolve `all` to every JSON file directly under `packages/web/i18n/zh-CN/`, sorted by filename.
- Reject a source outside `zh-CN`; ask for the Simplified Chinese source instead.
- Discover target locales from sibling directories under `packages/web/i18n/`, excluding `zh-CN`.
- Edit only the selected namespace files. Create a missing target namespace file when its locale directory already exists, but never create a new locale.
- Preserve unrelated user changes already present in target files.

### 2. Establish product meaning before wording

- Read the complete Chinese source and every existing target file.
- Use `rg` to find how the same product concept is translated elsewhere in `packages/web/i18n/en/`.
- Inspect call sites for ambiguous labels, actions, state names, errors, or placeholders. Determine whether the text is a button, heading, status, description, toast, or validation message.
- Follow this evidence order: the FastGPT glossary; feature behavior and UI context; nearby translation style; official n8n or Dify English product language; general technical usage.
- Match the longest glossary term first. A compound such as `知识库引用` overrides the separate entries for `知识库` and `引用`.
- Treat forbidden glossary translations as errors. If a needed FastGPT product concept is missing from the glossary, report it instead of inventing a new canonical term.
- Never copy competitor terminology merely because it exists. If evidence still conflicts, pause and ask the user about the specific term.

### 3. Translate locale by locale

- Keep JSON keys, nesting, key order, value types, and formatting aligned with the Chinese source.
- Preserve interpolation variables such as `{{name}}`, rich-text tags such as `<bold>`, URLs, literal escape sequences, and intentional line breaks exactly.
- Align each target's key set with the Chinese source. Remove a target-only key only after confirming it is absent from the complete source file; do not infer from a partial snippet.
- For `en`, write concise, natural North American product English. Translate intent rather than syntax, use sentence case by default, and favor familiar product terms over literal Chinese constructions.
- For `zh-Hant`, write region-neutral, natural Traditional Chinese rather than applying blind character conversion. Prefer established repository terminology when regional variants differ.
- For future locales, use native product language for that locale. If reliable translation is not possible, pause before editing and ask whether to omit that locale or wait for a qualified reviewer; do not silently deliver a partial locale set.
- Reuse one translation for one product concept unless the UI context genuinely changes its meaning.
- When the same term is inconsistent outside the specified namespace, report the finding but do not modify another namespace without the user's approval.

### 4. Validate before finishing

Run the bundled validator from the repository root:

```bash
node .agents/skills/system/i18n-translate/scripts/validate-namespace.mjs \
  packages/web/i18n/zh-CN/<namespace>.json
```

For `all`, run the validator once for every source namespace and require every run to finish with zero errors and zero warnings.

Then:

- Format only the changed namespace JSON files with the repository formatter.
- Run the validator again after formatting.
- Review `git diff -- <source-and-target-files>` for mistranslation, accidental key changes, stale values, inconsistent capitalization, and unrelated edits.
- Search the English target for untranslated Han text. Treat valid Chinese brand names or user-visible examples as reviewed exceptions, not automatic failures.
- Do not run the full test suite for translation-only changes unless the user requests it or code/configuration outside locale JSON also changed.

## Completion response

Report:

- the namespace and locales translated;
- files created or updated;
- validation commands and results;
- any intentionally retained source-language text or unresolved terminology.

Do not write a separate summary document.
