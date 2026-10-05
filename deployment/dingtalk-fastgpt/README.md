# DingTalk Stream bridge for FastGPT

This optional bridge receives DingTalk chatbot messages through the DingTalk
Stream SDK and forwards questions to a FastGPT application. It is separate from
FastGPT's built-in DingTalk publishing endpoint.

## Commands

| Command | Behavior |
| --- | --- |
| `/new`, `/reset`, `/clear` | Start a new FastGPT chat ID without deleting old records. |
| `/help` | List commands handled by the bridge. |
| `/status` | Show the current profile, chat ID, and locally counted turns. |
| `/compact` | Summarize the current chat and carry the summary into a new chat. |
| `/model [name]` | List or select a configured FastGPT application profile. |
| `/usage` | Show turns and input/output character counts since this bridge started tracking the chat. |

`/model` selects a configured FastGPT application, not a model inside an
application's workflow. `/usage` does not report token counts or billing because
the bridge does not receive reliable values for them. The old `reset`, `重置`,
`清空上下文`, and `重新开始` aliases remain available.

## Deployment

Build this directory as a Docker image. The Dockerfile pins the upstream
`peter17919/fastgpt-dingtalk` helper revision and installs its dependencies.
Set these environment variables in your deployment secret store:

- `DINGTALK_APP_KEY` and `DINGTALK_APP_SECRET`: DingTalk robot credentials.
- `FASTGPT_BASE_URL`, `FASTGPT_APP_ID`, and `FASTGPT_API_KEY`: default FastGPT
  application connection.
- `FASTGPT_CHAT_ID_MODE`: `user` by default; use `conversation` to group by
  DingTalk conversation instead.
- `DINGTALK_MODEL_PROFILES`: optional JSON map of extra profiles, for example
  `{"fast":{"app_id":"<app-id>","api_key":"<api-key>"}}`.
- `DINGTALK_CARD_TEMPLATE_ID`: optional AI card template for streaming replies.

Mount a persistent, writable volume at `/data`. The bridge stores chat ID
changes, profile selection, usage counters, and pending summaries in
`/data/dingtalk-state.sqlite3`; without this mount, a container replacement can
resume the original chat ID. The state file contains conversation summaries and
should be protected like chat history. Keep actual credentials out of the
repository.

Run the focused tests with:

```sh
docker build -t fastgpt-dingtalk-bridge .
docker run --rm --entrypoint python fastgpt-dingtalk-bridge -m unittest -q test_bridge
```
