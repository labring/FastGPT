use std::collections::BTreeSet;
use std::sync::OnceLock;
use std::time::Duration;

use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, EventKindMask, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    DebounceEventResult, DebouncedEvent, RecommendedCache, new_debouncer_opt,
};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use tokio_tungstenite::tungstenite::Message;

use crate::protocol::JsonRpcNotification;
use crate::workspace::{get_workspace_root, normalize_workspace_relative_path};

const FS_CHANGE_DEBOUNCE_MS: u64 = 500;
const FS_CHANGE_MAX_PATHS: usize = 200;
const FS_WATCH_BROADCAST_CAPACITY: usize = 128;

#[derive(Debug, Clone)]
pub(super) struct FsChangeBatch {
    pub(super) seq: u64,
    pub(super) paths: Vec<String>,
    pub(super) kinds: Vec<String>,
    pub(super) overflow: bool,
}

pub(super) struct FsWatchHub {
    pub(super) tx: broadcast::Sender<FsChangeBatch>,
}

static FS_WATCH_HUB: OnceLock<FsWatchHub> = OnceLock::new();

fn get_fs_event_kind(event_kind: &EventKind) -> Option<&'static str> {
    match event_kind {
        EventKind::Create(_) => Some("create"),
        EventKind::Remove(_) => Some("remove"),
        EventKind::Modify(ModifyKind::Name(_)) => Some("rename"),
        EventKind::Modify(_) => Some("modify"),
        _ => None,
    }
}

pub(super) fn collect_fs_event_paths(event: &Event) -> Vec<String> {
    event
        .paths
        .iter()
        .filter_map(|path| normalize_workspace_relative_path(path))
        .collect()
}

pub(super) fn collect_debounced_event_paths(events: &[DebouncedEvent]) -> (Vec<String>, bool) {
    let mut paths = BTreeSet::<String>::new();
    let mut overflow = false;

    for event in events {
        if get_fs_event_kind(&event.event.kind).is_none() {
            continue;
        }

        for path in collect_fs_event_paths(&event.event) {
            if !paths.contains(&path) && paths.len() >= FS_CHANGE_MAX_PATHS {
                overflow = true;
                continue;
            }
            paths.insert(path);
        }
    }

    (paths.into_iter().collect(), overflow)
}

fn collect_debounced_event_kinds(events: &[DebouncedEvent]) -> Vec<String> {
    let mut kinds = BTreeSet::<String>::new();
    for event in events {
        if let Some(kind) = get_fs_event_kind(&event.event.kind) {
            kinds.insert(kind.to_string());
        }
    }
    kinds.into_iter().collect()
}

fn debounced_events_need_rescan(events: &[DebouncedEvent]) -> bool {
    events.iter().any(|event| event.event.need_rescan())
}

pub(super) fn build_fs_change_notification(
    paths: Vec<String>,
    kinds: Vec<String>,
    overflow: bool,
    seq: u64,
) -> JsonRpcNotification {
    JsonRpcNotification {
        jsonrpc: "2.0".to_string(),
        method: "fs/did_change".to_string(),
        params: json!({
            "seq": seq,
            "paths": paths,
            "kinds": kinds,
            "overflow": overflow
        }),
    }
}

pub(super) fn publish_fs_change_batch(
    tx: &broadcast::Sender<FsChangeBatch>,
    next_seq: &mut u64,
    batch: FsChangeBatch,
) {
    if batch.paths.is_empty() && !batch.overflow {
        return;
    }

    *next_seq = next_seq.wrapping_add(1);
    let _ = tx.send(FsChangeBatch {
        seq: *next_seq,
        ..batch
    });
}

fn start_workspace_watcher(tx: broadcast::Sender<FsChangeBatch>) {
    let root = get_workspace_root().to_path_buf();
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<DebounceEventResult>();

    // 只订阅真实文件变更，避免 read_dir/read metadata 在 inotify 下触发 Access 事件后自激刷新。
    let watcher_config = Config::default().with_event_kinds(EventKindMask::CORE);
    let mut debouncer = match new_debouncer_opt::<_, RecommendedWatcher, _>(
        Duration::from_millis(FS_CHANGE_DEBOUNCE_MS),
        None,
        move |result| {
            let _ = event_tx.send(result);
        },
        RecommendedCache::new(),
        watcher_config,
    ) {
        Ok(debouncer) => debouncer,
        Err(error) => {
            eprintln!("Failed to create workspace watcher: {error}");
            return;
        }
    };

    if let Err(error) = debouncer.watch(&root, RecursiveMode::Recursive) {
        eprintln!("Failed to watch workspace {root:?}: {error}");
        return;
    }

    tokio::spawn(async move {
        // 持有 debouncer，确保进程级监听器生命周期覆盖整个聚合任务。
        let _debouncer = debouncer;
        let mut next_seq = 0_u64;

        while let Some(event_result) = event_rx.recv().await {
            let batch = match event_result {
                Ok(events) => {
                    let (paths, path_overflow) = collect_debounced_event_paths(&events);
                    let overflow = debounced_events_need_rescan(&events) || path_overflow;
                    let kinds = collect_debounced_event_kinds(&events);
                    FsChangeBatch {
                        seq: 0,
                        paths,
                        kinds: if kinds.is_empty() && overflow {
                            vec!["overflow".to_string()]
                        } else {
                            kinds
                        },
                        overflow,
                    }
                }
                Err(errors) => {
                    for error in errors {
                        eprintln!("Workspace watcher event error: {error}");
                    }
                    FsChangeBatch {
                        seq: 0,
                        paths: Vec::new(),
                        kinds: vec!["overflow".to_string()],
                        overflow: true,
                    }
                }
            };
            publish_fs_change_batch(&tx, &mut next_seq, batch);
        }
    });
}

pub(super) fn fs_watch_hub() -> &'static FsWatchHub {
    FS_WATCH_HUB.get_or_init(|| {
        let (tx, _) = broadcast::channel(FS_WATCH_BROADCAST_CAPACITY);
        start_workspace_watcher(tx.clone());
        FsWatchHub { tx }
    })
}

async fn send_fs_change_batch(
    outbound_tx: &mpsc::Sender<Message>,
    batch: FsChangeBatch,
) -> Result<(), ()> {
    let notification =
        build_fs_change_notification(batch.paths, batch.kinds, batch.overflow, batch.seq);
    if let Ok(text) = serde_json::to_string(&notification) {
        outbound_tx
            .send(Message::Text(text.into()))
            .await
            .map_err(|_| ())?;
    }
    Ok(())
}

pub(super) async fn forward_fs_change_batches(
    mut change_rx: broadcast::Receiver<FsChangeBatch>,
    outbound_tx: mpsc::Sender<Message>,
) {
    let mut last_forwarded_seq = 0_u64;

    loop {
        match change_rx.recv().await {
            Ok(batch) => {
                last_forwarded_seq = batch.seq;
                if send_fs_change_batch(&outbound_tx, batch).await.is_err() {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Lagged(skipped)) => {
                last_forwarded_seq = last_forwarded_seq.wrapping_add(skipped);
                let overflow_batch = FsChangeBatch {
                    seq: last_forwarded_seq,
                    paths: Vec::new(),
                    kinds: vec!["overflow".to_string()],
                    overflow: true,
                };
                if send_fs_change_batch(&outbound_tx, overflow_batch)
                    .await
                    .is_err()
                {
                    break;
                }
            }
            Err(broadcast::error::RecvError::Closed) => break,
        }
    }
}
