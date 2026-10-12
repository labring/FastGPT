# DDM change stream 复现脚本

`ddm-change-stream-repro.mjs` 使用官方 MongoDB Node.js 驱动，不加载 FastGPT 代码，用来定位 DDM change stream 在长轮询 `getMore` 时的异常。

## 准备

需要 Node.js 20 或更高版本，以及 `mongodb@6`：

```bash
mkdir ddm-change-stream-repro
cd ddm-change-stream-repro
npm init -y
npm install mongodb@6
cp /path/to/ddm-change-stream-repro.mjs .
```

连接串通过环境变量传入，脚本输出会自动隐藏用户名和密码：

```bash
export MONGODB_URI='mongodb://user:pass@192.168.10.168:27017/fastgpt?authSource=admin&serverMonitoringMode=poll'
```

## 安全基线测试

默认只创建和清理 `ddm_repro_*` 集合，不会改动 FastGPT 业务集合：

```bash
DURATION_SECONDS=300 \
IDLE_SECONDS=30 \
WATCH_COUNT=3 \
CONCURRENCY=4 \
WRITE_INTERVAL_MS=250 \
node ddm-change-stream-repro.mjs 2>&1 | tee ddm-repro.log
```

这个模式验证 DDM 在“多个长轮询 watch + 持续写入”下是否稳定。`DURATION_SECONDS` 到期后脚本会主动关闭 stream，并输出 JSON 报告。

## 只读监听 FastGPT 集合

用于判断已有业务集合的长轮询是否会自行报错。该模式不创建、不写入、不清理业务数据：

```bash
WATCH_COLLECTIONS=systemconfigs,app_templates,dataset_trainings \
WRITE_ENABLED=0 \
ALLOW_NON_REPRO_COLLECTIONS=1 \
CLEANUP=0 \
DURATION_SECONDS=300 \
WATCH_COUNT=3 \
node ddm-change-stream-repro.mjs 2>&1 | tee ddm-fastgpt-watch-readonly.log
```

如果只复现 `systemconfigs`：

```bash
WATCH_COLLECTIONS=systemconfigs \
WRITE_ENABLED=0 \
ALLOW_NON_REPRO_COLLECTIONS=1 \
CLEANUP=0 \
DURATION_SECONDS=300 \
node ddm-change-stream-repro.mjs 2>&1 | tee ddm-systemconfigs-readonly.log
```

## 显式写入测试集合

只有在达梦支持提供的测试库或明确允许写入时，才使用下面模式。它会向指定集合插入带有 `reproRunId` 的临时文档并更新一次，结束时按该 `reproRunId` 清理：

```bash
WATCH_COLLECTIONS=systemconfigs \
WRITE_COLLECTIONS=systemconfigs \
WRITE_ENABLED=1 \
ALLOW_NON_REPRO_COLLECTIONS=1 \
DURATION_SECONDS=300 \
IDLE_SECONDS=30 \
WATCH_COUNT=1 \
CONCURRENCY=2 \
WRITE_INTERVAL_MS=250 \
node ddm-change-stream-repro.mjs 2>&1 | tee ddm-systemconfigs-write.log
```

不要在生产库运行这个模式，除非已经确认可以临时写入并删除测试文档。更稳妥的是为达梦支持准备独立的测试库。

## 可调参数

- `DURATION_SECONDS`：总测试时长，默认 `120`。
- `IDLE_SECONDS`：先只保持 `getMore`、不写入的时长，默认 `15`。
- `WATCH_COLLECTIONS`：逗号分隔的监听集合；默认三个 `ddm_repro_*` 集合。
- `WATCH_COUNT`：并行 change stream 数量，默认 `3`。
- `WRITE_ENABLED`：是否写入，默认 `1`。
- `WRITE_COLLECTIONS`：写入集合；未指定时，只有默认测试集合会自动写入。
- `CONCURRENCY`：写入协程数，默认 `2`。
- `WRITE_INTERVAL_MS`：每个写入协程的间隔，默认 `250` 毫秒。
- `MAX_AWAIT_TIME_MS`：change stream 的长轮询等待时间，默认 `1000` 毫秒。
- `TRANSACTIONS`：设为 `1` 时用短事务包住 insert/update，默认关闭。
- `CLEANUP`：是否清理本次 run 的测试文档，默认 `1`。
- `ALLOW_NON_REPRO_COLLECTIONS`：允许监听或写入非 `ddm_repro_*` 集合，默认关闭；只应在有意测试 FastGPT 现有集合时打开。

## 提供给达梦支持的材料

请同时提供：

1. 脚本的完整标准输出和最终 JSON 报告。
2. 脚本运行的起止时间、连接参数（密码可隐藏）。
3. DDM Engine 日志中对应时间窗口的 `getMore` 和错误行，例如：

   ```text
   Call of bsoncore.Value.BSONObj on missing type
   current opMsg: { getMore: ..., collection: "systemconfigs", ... }
   ```

4. 当前服务端版本和配置。脚本会自动记录 `buildInfo`、`hello`、`maxAwaitTimeMS`、并行 watch 数量和写入参数。

如果报告中的 `streams[].status` 为 `error`，请重点看 `streams[].error` 和 `errors[]`。测试到时后主动关闭产生的 `ChangeStream is closed` 会同时标记 `forcedShutdown: true`，它不是 DDM 服务端错误。
