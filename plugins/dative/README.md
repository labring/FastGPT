输入自然语言，生成sql查询，给出自然语言回答

## 特性：
- 支持mysql、postgresql、sqlite等数据库
- 结合duckdb强大本地数据库管理能力，支持本地和S3存储结构化数据，如：xlsx、xls、csv、xlsm、xlsb等
- 支持sql基本语法检查和优化
- 支持单个数据库查询，不支持跨数据库查询
- 仅支持sql查询，不支持更新、删除、插入等语句


## 本地开发

1、项目管理工具使用 [uv](https://github.com/astral-sh/uv)，使用pip安装：
```bash
pip install uv
```

2、安装依赖包：
```
uv sync
```

3、安装duckdb扩展包：
```bash
uv run python scripts/install_duckdb_extensions.py
```

4、启动服务：
```bash
uv run fastapi run src/dative/main.py
```

