## 更新 docker compose 脚本

### 正常更新（不动服务，只改版本）

1. 更新 `version/{version}/args.json` 中的版本号，例如 `version/v4.14/args.json` 或 `version/main/args.json`
2. 在 `FastGPT` 目录执行 `node deploy/init.mjs` 即可
3. 脚本会同时更新 `deploy/dev`、`document/public/deploy/install.sh` 和 `document/public/deploy/docker/{version}` 下的 Docker 部署文件

### 加版本

比如要添加 `v4.15` 稳定版：
1. 创建 `version/v4.15`
2. 添加 `version/v4.15/args.json`
3. 添加 `version/v4.15/docker-compose.template.yml`
4. 执行 `node deploy/init.mjs`，脚本会自动扫描并生成 `document/public/deploy/docker/v4.15`

### 加服务

比如要添加 `example` 服务:
1. `init.mjs` 的 `Services Enum` 中添加 fastgptExample: fastgpt-example
2. 在所有 `version/*/args.json` 中添加 image 和 tag, 注意 `args` 的 `key` 值，要和 `init.mjs` 的 `value` 值一致。
3. 更新所有需要生效的 `version/*/docker-compose.template.yml` 文件，把服务的相关配置加进去，并且：服务的 image 改为 ${{example.image}}:${{example.tag}}
4. 如需同步开发环境，再更新 `templates/docker-compose.dev.yml`
5. 执行 `node deploy/init.mjs` 重新生成部署文件

### 加向量库

比如添加 `exampleDB` 向量库:
1. 添加 vector service 配置在 `templates/vector` 下面，例如 `templates/vector/exampleDB.txt` 内容可以参考其他 txt，注意缩进，image 名字也要替换成 ${{exampleDB.image}}:${{exampleDB:tag}}, service name 必须是 `vectorDB`
2. 在所有 `version/*/args.json` 中添加 `exampleDB` 的配置
3. 添加连接配置片段，例如 `templates/vector/exampleDB.config.txt`
4. 如需额外 `configs`，添加 `templates/vector/exampleDB.extra.txt`
5. 在 `templates/vector/config.json` 中添加向量库配置，声明输出文件名、service 片段、连接配置和 extra 片段
6. 执行 `node deploy/init.mjs` 重新生成部署文件

## yaml 的锚点和引用

`&` 标志一个锚点

```yaml
x-share-config: &x-share-config 'I am the config content'
x-share-config-list: &x-share-config-list
  key1: value
  key2: value
```

`*` 引用一个锚点
```yaml
some_other_example: *x-share-config-list
```
