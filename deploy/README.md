## 更新 docker compose 脚本

### 正常更新（不动服务，只改版本）

1. 更新 `args.json` 中的版本号
2. 在 `FastGPT` 目录执行 `pnpm run gen:deploy` 即可

### 加服务

比如要添加 `example` 服务:
1. `init.mjs` 的 `Services Enum` 中添加 fastgptExample: fastgpt-example
2. 在 `args.json` 中添加 image 和 tag, 注意 `args.json` 的 `key` 值，要和 `init.mjs` 的 `value` 值一致。
3. 更新 templates/docker-compose.[dev|prod].yml 文件，把服务的相关配置加进去，并且：服务的 image 改为 ${{example.image}}:${{example.tag}}

### 加向量库

比如添加 `exampleDB` 向量库:
1. 添加 vector service 配置在 `templates/vector` 下面，例如 `templates/vector/exampleDB.txt` 内容可以参考其他 txt，注意缩进，image 名字也要替换成 ${{exampleDB.image}}:${{exampleDB:tag}}, service name 必须是 `vectorDB`
2. 在 `args.json` 中添加 `exampleDB` 的配置
3. init.mjs vector enum 中添加 `vector`
4. init.mjs 中添加 vector 的相关配置:

```ts
const vector = {
  // pg, milvus, ob ...
  vector: {
    db: '', // 空即可
    config: `/
  VECTOR_URL:vectordb://xxxxx
    `, //注意 第一行反引号后面的 / 不能少（去除首个换行符）; 左边的两个空格的缩进不能变，否则会语法错误
    extra: `` // 额外的配置，可以看 ob 的那个，需要一个 config 字段引入 init.sql
  }
}
```

5. init.mjs 读入 vector 配置

```json
{ // 这是个块作用域, 直接搜 read in Vectors
// read in Vectors
// pg, ob ....
const vectordb = fs.readFileSync(path.join(process.cwd(), 'templates', 'vector', 'vector.txt'));
vector.vector.db = String(vectordb);
}
```

6. init.mjs 最后生成的时候，需要添加
```ts
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'cn', 'docker-compose.vector.yml'),
      replace(template, 'cn', VectorEnum.vector)
    ),
    fs.promises.writeFile(
      path.join(process.cwd(), 'docker', 'global', 'docker-compose.ziliiz.yml'),
      replace(template, 'global', VectorEnum.vector)
    ),
```

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
