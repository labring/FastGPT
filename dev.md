## Premise

Since FastGPT is managed in the same way as monorepo, it is recommended to install ‘make’ first during development.

monorepo Project Name:

- app: main project
-......

## Dev

```sh
# Give automatic script code execution permission (on non-Linux systems, you can manually execute the postinstall.sh file content)
chmod -R +x ./scripts/
# Executing under the code root directory installs all dependencies within the root package, projects, and packages
pnpm i

# Not make cmd
cd projects/app
pnpm dev

# Make cmd
make dev name=app
```

Note: If the Node version is >= 20, you need to pass the `--no-node-snapshot` parameter to Node when running `pnpm i`

```sh
NODE_OPTIONS=--no-node-snapshot pnpm i
```

### Jest

https://fael3z0zfze.feishu.cn/docx/ZOI1dABpxoGhS7xzhkXcKPxZnDL

## I18N

### Install i18n-ally Plugin

1. Open the Extensions Marketplace in VSCode, search for and install the `i18n Ally` plugin.

### Code Optimization Examples

#### Fetch Specific Namespace Translations in `getServerSideProps`

```typescript
// pages/yourPage.tsx
export async function getServerSideProps(context: any) {
  return {
    props: {
      currentTab: context?.query?.currentTab || TabEnum.info,
      ...(await serverSideTranslations(context.locale, ['publish', 'user']))
    }
  };
}
```

#### Use useTranslation Hook in Page

```typescript
// pages/yourPage.tsx
import { useTranslation } from 'next-i18next';

const YourComponent = () => {
  const { t } = useTranslation();

  return (
    <Button
      variant="outline"
      size="sm"
      mr={2}
      onClick={() => setShowSelected(false)}
    >
      {t('common:close')}
    </Button>
  );
};

export default YourComponent;
```

#### Handle Static File Translations

```typescript
// utils/i18n.ts
import { i18nT } from '@fastgpt/web/i18n/utils';

const staticContent = {
  id: 'simpleChat',
  avatar: 'core/workflow/template/aiChat',
  name: i18nT('app:template.simple_robot'),
};

export default staticContent;
```

### Standardize Translation Format

- Use the t(namespace:key) format to ensure consistent naming.
- Translation keys should use lowercase letters and underscores, e.g., common.close.

## audit

Please fill the AuditEventEnum and audit function is added to the ts, and on the corresponding position to fill i18n, at the same time to add the location of the log using addOpearationLog function add function

## Build

```sh
# Docker cmd: Build image, not proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app
# Make cmd: Build image, not proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1

# Docker cmd: Build image with proxy
docker build -f ./projects/app/Dockerfile -t registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 . --build-arg name=app --build-arg proxy=taobao
# Make cmd: Build image with proxy
make build name=app image=registry.cn-hangzhou.aliyuncs.com/fastgpt/fastgpt:v4.8.1 proxy=taobao
```
