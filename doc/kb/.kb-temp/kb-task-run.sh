#!/bin/bash
# kb-task-run.sh — 知识库任务调度器（v7.0）
#
# 扫描 .kb-temp/tasks/ 目录下的 .kb-task-*.json，
# claim 可用任务并派发 claude -p 执行 kb-init-frontend --scope。
#
# 用法:
#   ./kb-task-run.sh <输出目录> [--run|--status]
#
# 选项:
#   --run     启动调度器主循环 (持续派发任务，供后台运行)
#   --status  进入交互式 REPL 浏览器 (查看日志、实时追踪运行中任务、列出 session)
#
# 默认 (无模式参数): 等同 --status，进入 REPL 浏览器

set -euo pipefail

# ─── 需要用户确认的配置 ──────────────────────────────────────────────────

# 几个并行
MAX_CONCURRENT=5
# 使用什么执行：claude | csc
EXECUTOR="claude"  # 执行 kb-init-frontend 的命令，可替换为其他兼容 claude 参数格式的执行器

# ─── 下方的不要动了 ──────────────────────────────────────────────────────

# ─── 配置 ──────────────────────────────────────────────────
# 知识库目录
OUTPUT_DIR="doc/kb"
TASKS_DIR=""
LOG_DIR=""
# 10s检查一次
POLL_INTERVAL=10
MODE="repl"  # repl (默认交互浏览器) | loop

# ─── 解析参数 ──────────────────────────────────────────────

# 第一个非选项参数作为输出目录
for arg in "$@"; do
  case "$arg" in
    --*) break ;;
    *) OUTPUT_DIR="$arg"; shift; break ;;
  esac
done

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run)    MODE="loop"; shift ;;
    --status) MODE="repl"; shift ;;
    --)       shift; break ;;
    *)        shift ;;
  esac
done

TASKS_DIR="$OUTPUT_DIR/.kb-temp/tasks"
LOG_DIR="$OUTPUT_DIR/.kb-temp/logs"
PID_FILE="$OUTPUT_DIR/.kb-temp/kb-task-run.pid"

if [[ ! -d "$TASKS_DIR" ]]; then
  echo "错误: 任务目录不存在: $TASKS_DIR"
  echo "请先运行 create-tasks.js 创建任务队列。"
  exit 1
fi

# ─── 工具函数 ──────────────────────────────────────────────

# 读取 task 文件的 JSON 字段（跨平台: 用 node 替代 jq）
task_field() {
  local file="$1"
  local field="$2"
  node -e "
    try {
      const d = JSON.parse(require('fs').readFileSync('$file','utf8'));
      const v = d['$field'];
      console.log(v === undefined || v === null || v === false ? '' : String(v));
    } catch(_) { process.exit(1); }
  " 2>/dev/null || echo ""
}

# task 是否可消费
task_available() {
  local file="$1"
  local type status
  type=$(task_field "$file" "type")
  status=$(task_field "$file" "status")
  [[ "$status" != "pending" ]] && return 1

  if [[ "$type" == "capability" ]]; then
    return 0  # capability 总是可以
  fi

  # root / finalize: 所有 capability 必须 done
  local all_done=true
  local task_file
  for task_file in "$TASKS_DIR"/.kb-task-*.json; do
    [[ -f "$task_file" ]] || continue
    local ttype tstatus
    ttype=$(task_field "$task_file" "type")
    tstatus=$(task_field "$task_file" "status")
    [[ "$ttype" == "capability" && "$tstatus" != "done" ]] && { all_done=false; break; }
  done
  $all_done && return 0 || return 1
}

# ─── 任务缓存（避免每次 task_field 都 spawn node） ──────────

_TASK_FILES=()
_TASK_SAFES=()
_TASK_LABELS=()
_TASK_TYPES=()
_TASK_STATUSES=()
_TASK_ERRORS=()
_TASK_SESSIONS=()
declare -A _TASK_IDX_BY_SAFE

# 单次 node 调用读取全部任务到内存
load_tasks_cache() {
  _TASK_FILES=()
  _TASK_SAFES=()
  _TASK_LABELS=()
  _TASK_TYPES=()
  _TASK_STATUSES=()
  _TASK_ERRORS=()
  _TASK_SESSIONS=()
  _TASK_IDX_BY_SAFE=()

  local output
  output=$(node -e "
    const fs = require('fs'), path = require('path');
    const dir = '$TASKS_DIR';
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.startsWith('.kb-task-') && f.endsWith('.json')); }
    catch(_) { files = []; }
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const esc = s => String(s||'').replace(/\t/g,' ').replace(/\n/g,' ');
        console.log([f, esc(d.label_safe), esc(d.label), esc(d.type), esc(d.status), esc(d.error||''), esc(d.session_id||'')].join('\t'));
      } catch(_) {}
    }
  " 2>/dev/null) || output=""

  local idx=0
  while IFS=$'\t' read -r f safe label type status error sid; do
    [[ -z "$f" ]] && continue
    _TASK_FILES+=("$f")
    _TASK_SAFES+=("$safe")
    _TASK_LABELS+=("$label")
    _TASK_TYPES+=("$type")
    _TASK_STATUSES+=("$status")
    _TASK_ERRORS+=("$error")
    _TASK_SESSIONS+=("$sid")
    [[ -n "$safe" ]] && _TASK_IDX_BY_SAFE["$safe"]="$idx"
    idx=$((idx + 1))
  done <<< "$output"
}

# 用缓存判断是否全部 capability 已完成
_all_capabilities_done() {
  local i
  for i in "${!_TASK_TYPES[@]}"; do
    if [[ "${_TASK_TYPES[$i]}" == "capability" && "${_TASK_STATUSES[$i]}" != "done" ]]; then
      return 1
    fi
  done
  return 0
}

# 用缓存判断任务是否可消费（替代 task_available 的文件扫描）
task_available_cached() {
  local idx="$1"
  local type="${_TASK_TYPES[$idx]}"
  local status="${_TASK_STATUSES[$idx]}"

  [[ "$status" != "pending" ]] && return 1

  if [[ "$type" == "capability" ]]; then
    return 0
  fi

  # root / finalize: 所有 capability 必须 done
  _all_capabilities_done && return 0 || return 1
}

# ─── 单实例互斥 ─────────────────────────────────────────

# 杀掉旧调度器实例及其子进程
kill_previous_instance() {
  if [[ ! -f "$PID_FILE" ]]; then
    return 0
  fi
  local old_pid
  old_pid=$(cat "$PID_FILE" 2>/dev/null) || return 0
  [[ -z "$old_pid" ]] && return 0

  # 检查进程是否存活；即使调度器已死，子进程可能仍是孤儿在跑
  local scheduler_alive=false
  if kill -0 "$old_pid" 2>/dev/null; then
    scheduler_alive=true
    echo "[kb-task-run] 检测到已有调度器实例 (PID: $old_pid)，正在停止..."
  else
    echo "[kb-task-run] 调度器已退出但子进程可能还在运行 (PID_FILE: $old_pid)，正在清理..."
  fi

  # 杀掉旧进程树的子进程
  local children
  children=$(ps -o pid= --ppid "$old_pid" 2>/dev/null) || true
  for child in $children; do
    [[ -z "$child" ]] && continue
    # 杀子进程树（递归杀 csc/claude 等）
    pkill -P "$child" 2>/dev/null || true
    kill "$child" 2>/dev/null || true
  done

  # 如果调度器还活着，也杀它
  $scheduler_alive && kill "$old_pid" 2>/dev/null || true

  # 等待进程退出
  sleep 1

  # 无论调度器状态，始终 SIGKILL 仍然存活的子进程
  local any_dead=false
  for child in $children; do
    if kill -0 "$child" 2>/dev/null; then
      kill -9 "$child" 2>/dev/null || true
      wait "$child" 2>/dev/null || true
      any_dead=true
    fi
  done
  # 调度器如果还活着，SIGKILL 它
  if $scheduler_alive && kill -0 "$old_pid" 2>/dev/null; then
    kill -9 "$old_pid" 2>/dev/null || true
    wait "$old_pid" 2>/dev/null || true
    any_dead=true
  fi

  if $any_dead; then
    echo "[kb-task-run] 已强制停止（含 SIGKILL）。"
  else
    echo "[kb-task-run] 旧实例已停止。"
  fi
}

# 将所有 in_progress 任务重置为 pending（先杀旧进程，再重置 JSON）
# 注意：必须 kill 旧进程，否则旧 csc 进程仍会跑完并写 done，和新派发的任务并行翻倍。
reset_in_progress_tasks() {
  local task_file
  local reset_count=0
  for task_file in "$TASKS_DIR"/.kb-task-*.json; do
    [[ -f "$task_file" ]] || continue
    local status
    status=$(task_field "$task_file" "status") || continue
    if [[ "$status" == "in_progress" ]]; then
      # 先杀掉遗留进程（重启前的孤儿 csc）
      local old_pid
      old_pid=$(node -e "
        try {
          const d=JSON.parse(require('fs').readFileSync('$task_file','utf8'));
          console.log(d.pid || '');
        } catch(_) { process.exit(0); }
      " 2>/dev/null)
      if [[ -n "$old_pid" ]]; then
        if kill -0 "$old_pid" 2>/dev/null; then
          echo "  🚫 杀掉遗留进程: $(basename "$task_file") (PID: $old_pid)"
          pkill -P "$old_pid" 2>/dev/null || true
          kill "$old_pid" 2>/dev/null || true
          sleep 0.2
          kill -0 "$old_pid" 2>/dev/null && kill -9 "$old_pid" 2>/dev/null || true
          wait "$old_pid" 2>/dev/null || true
        fi
      fi
      # 重置 JSON
      node -e "
        const fs=require('fs');
        const d=JSON.parse(fs.readFileSync('$task_file','utf8'));
        d.status='pending'; d.retry_count=0;
        delete d.session_id; delete d.claimed_at; delete d.pid;
        fs.writeFileSync('${task_file}.tmp', JSON.stringify(d,null,2));
      " 2>/dev/null && mv "${task_file}.tmp" "$task_file" && reset_count=$((reset_count + 1))
      echo "  ➜ 重置任务: $(basename "$task_file")"
    fi
  done
  if [[ $reset_count -gt 0 ]]; then
    echo "[kb-task-run] 已重置 $reset_count 个 in_progress 任务为 pending。"
  fi
}

# 清理锁文件
cleanup_lock() {
  # 只在 PID 匹配时才删除（防止误删后续实例的锁文件）
  if [[ -f "$PID_FILE" ]]; then
    local stored_pid
    stored_pid=$(cat "$PID_FILE" 2>/dev/null) || return
    if [[ "$stored_pid" == "$$" ]]; then
      rm -f "$PID_FILE"
    fi
  fi
}

# 确保当前实例是唯一调度器
ensure_single_instance() {
  kill_previous_instance
  reset_in_progress_tasks

  # 创建锁目录（幂等）
  mkdir -p "$(dirname "$PID_FILE")"

  # 写入当前 PID
  echo $$ > "$PID_FILE"
  echo "[kb-task-run] 调度器已启动 (PID: $$)"
}

# ─── 状态展示 ──────────────────────────────────────────────

print_status() {
  local total=0 pending=0 running=0 done_count=0 failed=0
  local cap_p=0 cap_r=0 cap_d=0 cap_f=0
  local root_p=0 root_r=0 root_d=0 root_f=0
  local fin_p=0 fin_r=0 fin_d=0 fin_f=0

  local running_tasks=()
  local failed_tasks=()

  local task_file label safe type status
  for task_file in "$TASKS_DIR"/.kb-task-*.json; do
    [[ -f "$task_file" ]] || continue
    total=$((total + 1))
    type=$(task_field "$task_file" "type")
    status=$(task_field "$task_file" "status")
    label=$(task_field "$task_file" "label")
    safe=$(task_field "$task_file" "label_safe")
    local error=$(task_field "$task_file" "error")

    case "$status" in
      pending) pending=$((pending + 1));;
      in_progress) running=$((running + 1)); running_tasks+=("$safe|$label");;
      done) done_count=$((done_count + 1));;
      failed) failed=$((failed + 1)); failed_tasks+=("$safe|$label|$error");;
    esac

    case "$type:$status" in
      capability:pending) cap_p=$((cap_p + 1));;
      capability:in_progress) cap_r=$((cap_r + 1));;
      capability:done) cap_d=$((cap_d + 1));;
      capability:failed) cap_f=$((cap_f + 1));;
      root:pending) root_p=$((root_p + 1));;
      root:in_progress) root_r=$((root_r + 1));;
      root:done) root_d=$((root_d + 1));;
      root:failed) root_f=$((root_f + 1));;
      finalize:pending) fin_p=$((fin_p + 1));;
      finalize:in_progress) fin_r=$((fin_r + 1));;
      finalize:done) fin_d=$((fin_d + 1));;
      finalize:failed) fin_f=$((fin_f + 1));;
    esac
  done

  echo "╔══════════════════════════════════════════════════════════════╗"
  printf "║  kb-task-run 状态报告            %-20s ║\n" "$(date '+%Y-%m-%d %H:%M')"
  echo "╠══════════════════════════════════════════════════════════════╣"
  printf "║  总任务数: %-56d ║\n" "$total"
  echo "║                                                              ║"
  printf "║  ┌──────────┬────────┬────────┬────────┬────────┐         ║\n"
  printf "║  │ 类型     │ pending│ running│ done   │ failed │         ║\n"
  printf "║  ├──────────┼────────┼────────┼────────┼────────┤         ║\n"
  printf "║  │capability│ %-6d │ %-6d │ %-6d │ %-6d │         ║\n" "$cap_p" "$cap_r" "$cap_d" "$cap_f"
  printf "║  │ root     │ %-6d │ %-6d │ %-6d │ %-6d │         ║\n" "$root_p" "$root_r" "$root_d" "$root_f"
  printf "║  │finalize  │ %-6d │ %-6d │ %-6d │ %-6d │         ║\n" "$fin_p" "$fin_r" "$fin_d" "$fin_f"
  printf "║  ├──────────┼────────┼────────┼────────┼────────┤         ║\n"
  printf "║  │ 合计     │ %-6d │ %-6d │ %-6d │ %-6d │         ║\n" "$pending" "$running" "$done_count" "$failed"
  printf "║  └──────────┴────────┴────────┴────────┴────────┘         ║\n"
  echo "║                                                              ║"

  if [[ ${#running_tasks[@]} -gt 0 ]]; then
    echo "║  当前运行:                                                    ║"
    local idx=1
    for entry in "${running_tasks[@]}"; do
      local s="${entry%%|*}"
      printf "║    [%d] %-55s ║\n" "$idx" "$s"
      idx=$((idx + 1))
    done
    echo "║                                                              ║"
  fi

  if [[ ${#failed_tasks[@]} -gt 0 ]]; then
    echo "║  失败任务:                                                    ║"
    for entry in "${failed_tasks[@]}"; do
      local s="${entry%%|*}"
      local err="${entry##*|}"
      printf "║    ❌ %-55s ║\n" "$s"
      [[ -n "$err" ]] && printf "║       %-55s ║\n" "→ $err"
    done
    echo "║                                                              ║"
  fi

  echo "╚══════════════════════════════════════════════════════════════╝"
}

# ─── 调度主循环 ──────────────────────────────────────────

scheduler_loop() {
  mkdir -p "$LOG_DIR"
  local running_pids=()
  local running_safes=()

  while true; do
    # ── 刷新缓存（单次 node 调用，替代 N 次 task_field） ──
    load_tasks_cache

    # ── 清理已完成进程 ──────────────────────────────
    local new_pids=()
    local new_safes=()
    local i
    for i in "${!running_pids[@]}"; do
      if kill -0 "${running_pids[$i]}" 2>/dev/null; then
        new_pids+=("${running_pids[$i]}")
        new_safes+=("${running_safes[$i]}")
      else
        local done_idx="${_TASK_IDX_BY_SAFE[${running_safes[$i]}]:-}"
        local done_session=""
        local done_status=""
        local done_file=""
        if [[ -n "$done_idx" ]]; then
          done_session="${_TASK_SESSIONS[$done_idx]}"
          done_status="${_TASK_STATUSES[$done_idx]}"
          done_file="$TASKS_DIR/${_TASK_FILES[$done_idx]}"
        fi
        # 进程已退出但 agent 未把 status 改成 done/failed（常见：LLM 忘记最后一步）
        # → 调度器兜底，强制把 in_progress 收敛为 done。
        if [[ "$done_status" == "in_progress" && -n "$done_file" ]]; then
          node -e "
            const fs=require('fs');
            const d=JSON.parse(fs.readFileSync('$done_file','utf8'));
            if (d.status==='in_progress') { d.status='done'; delete d.pid; }
            fs.writeFileSync('${done_file}.tmp', JSON.stringify(d,null,2));
          " && mv "${done_file}.tmp" "$done_file" 2>/dev/null || true
          done_status="done"
          _TASK_STATUSES[$done_idx]="done"
        fi
        if [[ "$done_status" == "failed" ]]; then
          echo "[$(date '+%H:%M:%S')] 失败: ${running_safes[$i]} (session: ${done_session:-?})"
        else
          echo "[$(date '+%H:%M:%S')] 完成: ${running_safes[$i]} (session: ${done_session:-?})"
        fi
      fi
    done
    running_pids=("${new_pids[@]}")
    running_safes=("${new_safes[@]}")

    # ── 派发任务：填满到 MAX_CONCURRENT（使用缓存）────
    local claimed=0

    while [[ ${#running_pids[@]} -lt $MAX_CONCURRENT ]]; do
      local dispatched_this_round=0
      local available_slots=$((MAX_CONCURRENT - ${#running_pids[@]}))

      local idx
      for idx in "${!_TASK_FILES[@]}"; do
        [[ $dispatched_this_round -ge $available_slots ]] && break

        local safe="${_TASK_SAFES[$idx]}"
        local status="${_TASK_STATUSES[$idx]}"
        local task_file="$TASKS_DIR/${_TASK_FILES[$idx]}"

        [[ "$status" != "pending" ]] && continue

        if ! task_available_cached "$idx"; then
          continue
        fi

        # 生成 session ID
        local session_id
        session_id=$(node -e "console.log(require('crypto').randomUUID())")

        local claimed_at
        claimed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        node -e "
          const d=JSON.parse(require('fs').readFileSync('$task_file','utf8'));
          d.status='in_progress'; d.claimed_at='$claimed_at'; d.session_id='$session_id';
          require('fs').writeFileSync('${task_file}.tmp', JSON.stringify(d,null,2));
        " && mv "${task_file}.tmp" "$task_file"

        # 同步更新缓存状态（避免重新加载）
        _TASK_STATUSES[$idx]="in_progress"
        _TASK_SESSIONS[$idx]="$session_id"

        "$EXECUTOR" -p --session-id "$session_id" \
          "kb-init-frontend --scope $safe" --dangerously-skip-permissions \
          > "$LOG_DIR/${safe}.jsonl" 2>&1 &
        local pid=$!
        running_pids+=("$pid")
        running_safes+=("$safe")

        # 把 PID 写回 JSON（供重置时杀进程用）
        node -e "
          const d=JSON.parse(require('fs').readFileSync('$task_file','utf8'));
          d.pid=$pid;
          require('fs').writeFileSync('${task_file}.tmp', JSON.stringify(d,null,2));
        " && mv "${task_file}.tmp" "$task_file"

        dispatched_this_round=$((dispatched_this_round + 1))
        claimed=$((claimed + 1))
        echo "[$(date '+%H:%M:%S')] 已派发: $safe (PID: $pid, session: $session_id)"
      done

      # 本轮没派发出任何任务（无可消费任务），退出派发循环
      [[ $dispatched_this_round -eq 0 ]] && break
    done

    # ── 检查终止条件（使用缓存）────────────────────
    local any_pending=false
    local any_running=false
    local any_failed=false

    local idx
    for idx in "${!_TASK_STATUSES[@]}"; do
      case "${_TASK_STATUSES[$idx]}" in
        pending) any_pending=true;;
        in_progress) any_running=true;;
        failed) any_failed=true;;
      esac
    done

    if ! $any_pending && ! $any_running; then
      print_status
      if $any_failed; then
        echo "⚠️  存在失败任务。可以重置对应 task status 为 pending 后重新运行。"
      else
        echo "✅ 全部任务完成！"
      fi
      exit 0
    fi

    # 等待任意一个子进程完成（替代固定间隔 sleep）──
    if [[ ${#running_pids[@]} -gt 0 ]]; then
      wait -n "${running_pids[@]}" 2>/dev/null || true
    else
      # 无运行中任务且无任务可派发，等待新任务加入
      sleep "$POLL_INTERVAL"
    fi
  done
}

# ─── REPL 交互模式 ────────────────────────────────────────

# 检查终端能力
_has_smcup() { tput smcup >/dev/null 2>&1; }

# 保存/恢复终端状态（用于 claude --resume 等外部命令前后）
_repl_suspend() {
  _has_smcup && tput rmcup 2>/dev/null
}

_repl_resume() {
  _has_smcup && tput smcup 2>/dev/null
}

# 单次 node 调用：读取全部 task → CJK 安全排版 → 分区输出
repl_refresh() {
  local search_filter="${1:-}"  # 空 = 不过滤
  local output
  output=$(node -e "
    const fs = require('fs'), path = require('path');
    const dir = '$TASKS_DIR', logDir = '$LOG_DIR';
    const search = '$search_filter'.toLowerCase();
    const W = process.stdout.columns || 100;

    // 读取全部 task
    let files;
    try { files = fs.readdirSync(dir).filter(f => f.startsWith('.kb-task-') && f.endsWith('.json')); }
    catch(_) { files = []; }
    let tasks = files.map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        return { ...d, _f: f };
      } catch(_) { return null; }
    }).filter(Boolean);

    // REPL 进程存活校验：in_progress 但进程已死 → 强制收敛 done
    for (const t of tasks) {
      if (t.status === 'in_progress' && t.pid) {
        try { process.kill(t.pid, 0); }
        catch (_) {
          // 进程不存在 → 自动收敛为 done（先更新文件，再同步内存）
          try {
            const fp = path.join(dir, t._f);
            const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
            if (d.status === 'in_progress') {
              d.status = 'done';
              delete d.pid;
              fs.writeFileSync(fp + '.tmp', JSON.stringify(d, null, 2));
              fs.renameSync(fp + '.tmp', fp);
              t.status = 'done';
            }
          } catch(_) {}
        }
      }
    }

    // 搜索过滤
    if (search) {
      tasks = tasks.filter(t => {
        const haystack = [t.label||'', t.label_safe||'', t.session_id||''].join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    // 排序: running > failed > pending > done
    const order = { in_progress:0, failed:1, pending:2, done:3 };
    tasks.sort((a,b) => (order[a.status]??99) - (order[b.status]??99));

    // CJK 列宽 (近似)
    function cw(s) {
      let w = 0;
      for (const ch of s) {
        const cp = ch.codePointAt(0);
        if (cp > 0x2E7F && cp < 0xA000 || cp > 0xF8FF && cp < 0xFE10 ||
            cp > 0xFEE0 && cp < 0xFFF0 || cp > 0x1EF00 && cp < 0x20000 ||
            cp > 0x2FFFF && cp < 0x40000 || cp > 0x1F000 && cp < 0x1FFFF)
          w += 2;
        else w += 1;
      }
      return w;
    }
    function pad(s, n) { const cur = cw(s); return cur >= n ? s : s + ' '.repeat(n - cur); }

    // 统计
    let rn=0, fl=0, pd=0, dn=0;
    for (const t of tasks) { if (t.status==='in_progress') rn++; else if (t.status==='failed') fl++; else if (t.status==='pending') pd++; else if (t.status==='done') dn++; }
    const tot = tasks.length;
    const CI = W - 4;

    const now = new Date();
    const ts = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');

    // ── HEADER ──
    const header = [];
    const pushH = s => header.push('║ ' + pad(s, CI) + ' ║');
    header.push('╔' + '═'.repeat(CI) + '╗');
    pushH('kb-task-run REPL          ' + ts);
    header.push('╠' + '═'.repeat(CI) + '╣');
    pushH('总: ' + tot + '  │ pending: ' + pd + '  │ running: ' + rn + '  │ done: ' + dn + '  │ failed: ' + fl);
    header.push('╠' + '═'.repeat(CI) + '╣');

    // ── CONTENT ──
    const content = [];
    let sectionType = '';
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const idx = i + 1;
      const status = t.status || '';

      if (status !== sectionType) {
        sectionType = status;
        if (content.length > 0) content.push('');
        const label = status === 'in_progress' ? '运行中' : status === 'failed' ? '失败' : status === 'pending' ? '等待中' : '已完成';
        const n = status === 'in_progress' ? rn : status === 'failed' ? fl : status === 'pending' ? pd : dn;
        content.push('  ' + label + ' (' + n + ')');
      }

      const icon = status === 'in_progress' ? '⏳' : status === 'failed' ? '❌' : status === 'pending' ? '○' : '✅';
      const hasLog = fs.existsSync(path.join(logDir, (t.label_safe||'') + '.jsonl')) ? '📄' : ' ';

      const line1 = '  [' + idx + '] ' + pad(t.label || '', 18) + '  ' + icon + ' ' + pad(status, 10) + ' ' + hasLog + ' ' + (t.label_safe||'');
      content.push(line1);

      if (t.session_id) {
        content.push('      session: ' + t.session_id);
      }
      if (t.error) {
        content.push('      → ' + (t.error || ''));
      }
    }

    // ── FOOTER ──
    const footer = [];
    footer.push('╠' + '═'.repeat(CI) + '╣');
    footer.push('║ ' + pad('操作: [N]恢复  r刷新  s搜索  j↓k↑逐行  ↑↓翻页  g首G尾  h帮助  x重置  q退出', CI) + ' ║');
    footer.push('╚' + '═'.repeat(CI) + '╝');

    // 输出分区
    console.log('===SECTION:HEADER===');
    for (const l of header) console.log(l);
    console.log('===SECTION:CONTENT===');
    for (const l of content) console.log(l);
    console.log('===SECTION:FOOTER===');
    for (const l of footer) console.log(l);
    console.log('===SECTION:TSV===');
    for (const t of tasks) {
      const esc = s => String(s).replace(/\t/g,' ').replace(/\n/g,' ');
      console.log([esc(t.label_safe||''), esc(t.label||''), esc(t.status||''), esc(t.type||''), esc(t.session_id||''), esc(t.error||''), t._f].join('\\t'));
    }
    console.log('===SECTION:END===');
  " 2>/dev/null) || output=""

  # 清空全局数组
  HEADER_LINES=(); CONTENT_LINES=(); FOOTER_LINES=()
  TASK_FILES=(); TASK_SAFES=(); TASK_LABELS=(); TASK_STATUSES=()
  TASK_TYPES=(); TASK_ERRORS=(); TASK_SESSIONS=(); TASK_COUNT=0

  if [[ -z "$output" ]]; then
    HEADER_LINES=("╔══════════════════════════════════════════════════════════════╗" "║  kb-task-run REPL                                           ║" "╚══════════════════════════════════════════════════════════════╝")
    CONTENT_LINES=("  （无任务数据）")
    FOOTER_LINES=()
    return 1
  fi

  # 解析分区
  local section=""
  while IFS= read -r line; do
    case "$line" in
      "===SECTION:HEADER===") section="header"; continue ;;
      "===SECTION:CONTENT===") section="content"; continue ;;
      "===SECTION:FOOTER===") section="footer"; continue ;;
      "===SECTION:TSV===") section="tsv"; continue ;;
      "===SECTION:END===") section=""; continue ;;
    esac
    case "$section" in
      header) HEADER_LINES+=("$line") ;;
      content) CONTENT_LINES+=("$line") ;;
      footer) FOOTER_LINES+=("$line") ;;
      tsv)
        [[ -z "$line" ]] && continue
        local rest="$line"
        local safe label status type sid err fname
        safe="${rest%%$'\t'*}" && rest="${rest#*$'\t'}"
        label="${rest%%$'\t'*}" && rest="${rest#*$'\t'}"
        status="${rest%%$'\t'*}" && rest="${rest#*$'\t'}"
        type="${rest%%$'\t'*}"   && rest="${rest#*$'\t'}"
        sid="${rest%%$'\t'*}"    && rest="${rest#*$'\t'}"
        err="${rest%%$'\t'*}"    && fname="${rest#*$'\t'}"
        TASK_SAFES+=("$safe"); TASK_LABELS+=("$label"); TASK_STATUSES+=("$status")
        TASK_TYPES+=("$type"); TASK_SESSIONS+=("$sid"); TASK_ERRORS+=("$err"); TASK_FILES+=("$fname")
        TASK_COUNT=$((TASK_COUNT + 1))
        ;;
    esac
  done <<< "$output"
  return 0
}

# 绘制终端布局：固定顶栏 + 可滚动内容 + 固定底栏 + 固定输入行
# 参数: "content_only" — 仅重绘内容区（用于滚动），跳过顶栏/底栏
repl_draw() {
  local mode="${1:-full}"

  local lines cols
  lines=$(tput lines 2>/dev/null || echo 24)
  cols=$(tput cols 2>/dev/null || echo 80)

  local header_h=${#HEADER_LINES[@]}
  local footer_h=${#FOOTER_LINES[@]}
  local input_h=1
  local content_max=$((lines - header_h - footer_h - input_h))
  [[ $content_max -lt 1 ]] && content_max=1

  local content_start=$header_h
  local content_end=$((lines - footer_h - input_h - 1))
  local E=$'\e'  # ESC 字节

  # ── 整帧构建为一个字符串，一次性写入 ──
  local buf=""

  # ── 1. 顶栏 ──
  if [[ "$mode" != "content_only" ]]; then
    local i
    for ((i=0; i<header_h; i++)); do
      buf+="${E}[${i};1H${E}[K${HEADER_LINES[$i]}"
    done
  fi

  # ── 2. 内容区 ──
  local start=$SCROLL_OFFSET
  local total_content=${#CONTENT_LINES[@]}
  local has_more=false
  [[ $total_content -gt $((SCROLL_OFFSET + content_max)) ]] && has_more=true
  local draw_max=$content_max
  $has_more && draw_max=$((content_max - 1))
  [[ $draw_max -lt 1 ]] && draw_max=1

  local i
  for ((i=0; i<content_max; i++)); do
    buf+="${E}[$((content_start + i));1H${E}[K"
    if [[ $i -lt $draw_max ]]; then
      local idx=$((start + i))
      if [[ $idx -lt $total_content ]]; then
        buf+="${CONTENT_LINES[$idx]}"
      fi
    elif $has_more; then
      # 最后一行 → 滚动提示
      buf+="  ... 还有 $((total_content - SCROLL_OFFSET - draw_max)) 行 (j/k 滚动) ..."
    fi
  done

  # ── 3. 底栏 ──
  if [[ "$mode" != "content_only" ]]; then
    local footer_start=$((content_end + 1))
    for ((i=0; i<footer_h; i++)); do
      buf+="${E}[$((footer_start + i));1H${E}[K${FOOTER_LINES[$i]}"
    done
  fi

  # ── 4. 输入行 ──
  buf+="${E}[$((lines - 1));1H${E}[K"

  # ── 一次性写入终端 ──
  printf '%s' "$buf"
}

# 选中任务 → claude --resume 恢复对话
repl_view_log() {
  local idx="$1"
  local safe="${TASK_SAFES[$idx]}"
  local status="${TASK_STATUSES[$idx]}"
  local label="${TASK_LABELS[$idx]}"
  local sid="${TASK_SESSIONS[$idx]}"

  if [[ -z "$sid" ]]; then
    _repl_suspend
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    printf "  %s (%s)\n" "$label" "$safe"
    echo "════════════════════════════════════════════════════════════════"
    echo ""
    echo "（无 session_id，无法恢复）"
    echo "按 Enter 返回..."
    read -r
    _repl_resume
    repl_draw
    return
  fi

  _repl_suspend
  echo ""
  echo "════════════════════════════════════════════════════════════════"
  printf "  %s [%s]\n" "$label" "$status"
  printf "  Session: %s\n" "$sid"
  echo "════════════════════════════════════════════════════════════════"
  echo ""
  echo "执行: $EXECUTOR --resume $sid"
  echo "（退出后按 Enter 返回菜单）"
  echo ""

  # claude --resume 打开交互式会话，阻塞等待退出
  "$EXECUTOR" --resume "$sid"

  echo ""
  echo "按 Enter 返回菜单..."
  read -r
  _repl_resume
  repl_draw
}

# 重置单个任务到 pending（不涉及交互，仅写文件）
_reset_task_file() {
  local idx="$1"
  local safe="${TASK_SAFES[$idx]}"
  local label="${TASK_LABELS[$idx]}"
  local fname="${TASK_FILES[$idx]}"

  [[ -z "$safe" ]] && return 1

  # 先读取进程 PID 并杀掉
  local pid
  pid=$(node -e "
    try {
      const d=JSON.parse(require('fs').readFileSync('$TASKS_DIR/$fname','utf8'));
      console.log(d.pid||'');
    } catch(_) { process.exit(0); }
  " 2>/dev/null)
  if [[ -n "$pid" ]]; then
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo "  🔪 已杀死进程 $pid" || echo "  ⚠️  无法杀死进程 $pid"
    fi
    # 等待进程彻底退出，避免调度器读到残留 JSON 前进程仍在跑
    sleep 0.3 2>/dev/null || true
  fi

  node -e "
    const d = JSON.parse(require('fs').readFileSync('$TASKS_DIR/$fname','utf8'));
    d.status = 'pending';
    delete d.error;
    delete d.session_id;
    delete d.claimed_at;
    delete d.pid;
    require('fs').writeFileSync('${TASKS_DIR}/${fname}.tmp', JSON.stringify(d, null, 2));
  " && mv "${TASKS_DIR}/${fname}.tmp" "$TASKS_DIR/$fname" && echo "  ✅ $label ($safe)" || echo "  ❌ $label ($safe)"

  return 0
}

# 交互重置单个任务（保留旧接口）
repl_reset_task() {
  local idx="$1"
  local safe="${TASK_SAFES[$idx]}"
  local label="${TASK_LABELS[$idx]}"
  local status="${TASK_STATUSES[$idx]}"

  [[ -z "$safe" ]] && return

  _repl_suspend
  echo ""
  printf "确定要将任务 [%s] (%s) 从 %s 重置为 pending 吗？(y/N): " "$label" "$safe" "$status"
  read -r confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" && "$confirm" != "yes" ]]; then
    echo "已取消。"
    echo "按 Enter 返回..."
    read -r
    _repl_resume
    repl_draw
    return
  fi

  _reset_task_file "$idx"
  echo "按 Enter 返回..."
  read -r
  _repl_resume
  repl_draw
}

# REPL 帮助
repl_help() {
  _repl_suspend
  clear 2>/dev/null || true
  echo "═══ kb-task-run REPL 帮助 ═══"
  echo ""
  echo "  按键     功能"
  echo "  ──────  ─────────────────────────────────"
  echo "  1-9      恢复选中 session ($EXECUTOR --resume)"
  echo "  j / k    逐行向下/向上滚动"
  echo "  ↑ / ↓    向上/向下翻一页"
  echo "  g        跳到开头"
  echo "  G        跳到末尾"
  echo "  r/R      刷新任务列表"
  echo "  s/S      搜索 (按 label / label_safe / session_id)"
  echo "  h/H      显示此帮助"
  echo "  x/X      重置为 pending (输入编号，空格隔开可批量)"
  echo "  q/Q      退出 REPL"
  echo ""
  echo "  状态图标:  ⏳运行中  ○等待中  ✅已完成  ❌失败"
  echo "  日志图标:  📄有日志文件"
  echo ""
  echo "  可直接复制 session_id 用于 $EXECUTOR --resume 恢复。"
  echo "  要启动调度器，在另一个终端运行:"
  echo "    bash \$0 <输出目录> --run"
  echo ""
  echo "按 Enter 返回..."
  read -r
  _repl_resume
  repl_draw
}

repl_mode() {
  local search=""
  local SCROLL_OFFSET=0

  # 进入备用屏幕缓冲区
  if _has_smcup; then
    tput smcup
    # 退出时恢复终端
    trap 'tput rmcup 2>/dev/null' EXIT
  fi

  # 主循环：刷新数据 + 全量绘制
  while true; do
    # 获取最新任务数据
    repl_refresh "$search"
    local ret=$?

    # 修正滚动偏移：确保不超出范围
    local content_max
    content_max=$(($(tput lines 2>/dev/null || echo 24) - ${#HEADER_LINES[@]} - ${#FOOTER_LINES[@]} - 1))
    [[ $content_max -lt 1 ]] && content_max=1
    local max_offset=$((${#CONTENT_LINES[@]} - content_max))
    [[ $max_offset -lt 0 ]] && max_offset=0
    if [[ $SCROLL_OFFSET -gt $max_offset ]]; then
      SCROLL_OFFSET=$max_offset
    fi

    if [[ $ret -ne 0 ]]; then
      repl_draw
      printf '> '
      read -r _
      continue
    fi

    # 全量绘制（顶栏 + 内容 + 底栏）
    repl_draw

    # ── 内层循环：单字符读取 + 内容区快速重绘（不刷全屏） ──
    while true; do
      printf '> '
      IFS= read -r -n 1 choice
      choice="${choice:-}"

      case "$choice" in
        j)
          if [[ $SCROLL_OFFSET -lt $max_offset ]]; then
            SCROLL_OFFSET=$((SCROLL_OFFSET + 1))
            repl_draw content_only
          fi
          ;;
        k)
          if [[ $SCROLL_OFFSET -gt 0 ]]; then
            SCROLL_OFFSET=$((SCROLL_OFFSET - 1))
            repl_draw content_only
          fi
          ;;
        g)
          SCROLL_OFFSET=0
          repl_draw content_only
          ;;
        G)
          SCROLL_OFFSET=$max_offset
          repl_draw content_only
          ;;
        $'\e')
          local esc_seq
          IFS= read -r -n 2 -t 0.1 esc_seq
          case "$esc_seq" in
            '[A')  # 上箭头 — 翻一页
              SCROLL_OFFSET=$((SCROLL_OFFSET - content_max))
              [[ $SCROLL_OFFSET -lt 0 ]] && SCROLL_OFFSET=0
              repl_draw content_only
              ;;
            '[B')  # 下箭头 — 翻一页
              SCROLL_OFFSET=$((SCROLL_OFFSET + content_max))
              [[ $SCROLL_OFFSET -gt $max_offset ]] && SCROLL_OFFSET=$max_offset
              repl_draw content_only
              ;;
            '[5')  # PageUp
              IFS= read -r -n 1 -t 0.05 _
              SCROLL_OFFSET=$((SCROLL_OFFSET - content_max))
              [[ $SCROLL_OFFSET -lt 0 ]] && SCROLL_OFFSET=0
              repl_draw content_only
              ;;
            '[6')  # PageDown
              IFS= read -r -n 1 -t 0.05 _
              SCROLL_OFFSET=$((SCROLL_OFFSET + content_max))
              [[ $SCROLL_OFFSET -gt $max_offset ]] && SCROLL_OFFSET=$max_offset
              repl_draw content_only
              ;;
          esac
          ;;
        r|R)
          search=""
          SCROLL_OFFSET=0
          break ;;
        s|S)
          printf '\r搜索 (回车取消): '
          read -r new_search
          search="${new_search,,}"
          SCROLL_OFFSET=0
          break ;;
        h|H)
          repl_help
          ;;
        x|X)
          # 提示输入编号（空格隔开）→ 批量重置到 pending
          printf '\r重置任务编号 (空格隔开): '
          local reset_input
          read -r reset_input
          if [[ -z "$reset_input" ]]; then
            : # 空输入，什么都不做
          elif [[ "$reset_input" =~ ^[0-9\ ]+$ ]]; then
            local -a nums=()
            local -a labels=()
            local n valid=true
            for n in $reset_input; do
              local idx=$((n - 1))
              if [[ $idx -ge 0 && $idx -lt $TASK_COUNT ]]; then
                if [[ "${TASK_STATUSES[$idx]}" != "pending" ]]; then
                  nums+=("$n")
                  labels+=("${TASK_LABELS[$idx]}")
                fi
              fi
            done
            if [[ ${#nums[@]} -eq 0 ]]; then
              printf '\r没有可重置的任务（所选任务均已是 pending）\n'
              sleep 1.5
            else
              _repl_suspend
              echo ""
              echo "将重置以下 ${#nums[@]} 个任务:"
              local i
              for i in "${!nums[@]}"; do
                printf "  [%s] %s\n" "${nums[$i]}" "${labels[$i]}"
              done
              printf "确定? (y/N): "
              read -r confirm
              if [[ "$confirm" == "y" || "$confirm" == "Y" || "$confirm" == "yes" ]]; then
                echo ""
                local j
                for j in "${!nums[@]}"; do
                  local idx=$((nums[$j] - 1))
                  _reset_task_file "$idx"
                done
                echo ""
                echo "按 Enter 返回..."
                read -r
              fi
              _repl_resume
              # 回到外层循环重新刷新
              repl_refresh "$search"
              SCROLL_OFFSET=0
              break
            fi
          else
            printf '\r无效输入，请输入数字（空格隔开）\n'
            sleep 1.5
          fi
          ;;
        q|Q)
          echo ""
          echo "退出 REPL。调度器继续在后台运行。"
          break 2  # 退出内外两层循环
          ;;
        [0-9]*)
          # 累积数字 → 任务编号
          local num="$choice"
          while true; do
            local next_char
            IFS= read -r -n 1 -t 0.2 next_char || break
            case "$next_char" in
              [0-9]) num="$num$next_char" ;;
              *) break ;;
            esac
          done
          if [[ -n "$num" ]]; then
            local idx=$((num - 1))
            if [[ $idx -ge 0 && $idx -lt $TASK_COUNT ]]; then
              repl_view_log "$idx"
              # 数据可能已变更，回到外层循环重新刷新
              repl_refresh "$search"
              SCROLL_OFFSET=0
              break
            else
              # 显示错误提示
              _repl_suspend
              echo ""
              echo "无效编号: $num (共 $TASK_COUNT 个任务)"
              echo "按 Enter 继续..."
              read -r
              _repl_resume
              repl_draw
            fi
          fi
          ;;
        *)
          ;;
      esac
    done
  done
}

# ─── main ──────────────────────────────────────────────────

case "$MODE" in
  loop)
    # 调度器模式 (--run)：确保单实例 + 注册退出清理
    ensure_single_instance
    trap 'cleanup_lock' EXIT
    trap 'cleanup_lock; exit 1' INT TERM
    scheduler_loop
    ;;
  *)
    # 默认: REPL 交互浏览器
    if [[ ! -d "$TASKS_DIR" ]]; then
      echo "错误: 任务目录不存在: $TASKS_DIR"
      echo "请先运行 create-tasks.js 创建任务队列。"
      echo ""
      echo "启动调度器: bash $0 <输出目录> --run"
      exit 1
    fi
    repl_mode
    ;;
esac
