use super::handlers::{DEFAULT_MAX_FILE_BYTES, parse_max_file_bytes};
use super::watcher::{
    FsChangeBatch, build_fs_change_notification, collect_debounced_event_paths,
    collect_fs_event_paths, publish_fs_change_batch,
};
use super::{FsPermission, handle_fs_request};
use crate::protocol::{JsonRpcError, JsonRpcErrorCode, JsonRpcRequest};
use crate::workspace::init_test_workspace;
use notify::Event;
use notify::event::{CreateKind, EventAttributes, EventKind};
use notify_debouncer_full::DebouncedEvent;
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tokio::sync::broadcast;

fn fs_request(method: &str, params: Option<Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        id: json!(1),
        method: method.to_string(),
        params,
    }
}

async fn fs_ok(method: &str, params: Value) -> Value {
    let resp = handle_fs_request(fs_request(method, Some(params)), FsPermission::Write).await;
    match (resp.result, resp.error) {
        (Some(result), None) => result,
        (_, Some(error)) => panic!("unexpected fs error for {method}: {error:?}"),
        (None, None) => panic!("missing fs result for {method}"),
    }
}

async fn fs_err(method: &str, params: Option<Value>, permission: FsPermission) -> JsonRpcError {
    let resp = handle_fs_request(fs_request(method, params), permission).await;
    match (resp.result, resp.error) {
        (None, Some(error)) => error,
        (Some(result), _) => panic!("unexpected fs result for {method}: {result:?}"),
        (None, None) => panic!("missing fs error for {method}"),
    }
}

fn notify_event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
    Event {
        kind,
        paths,
        attrs: EventAttributes::new(),
    }
}

#[tokio::test]
async fn test_fs_crud_and_tree_workflow() {
    let temp_workspace = init_test_workspace();
    let _ = fs::remove_dir_all(temp_workspace.join("src_test"));

    let mkdir_result = fs_ok("fs/mkdir", json!({ "path": "src_test" })).await;
    assert_eq!(mkdir_result["success"], json!(true));

    let write_result = fs_ok(
        "fs/write_file",
        json!({
            "path": "src_test/hello.txt",
            "content": "SGVsbG8gUnVzdCE="
        }),
    )
    .await;
    let initial_etag = write_result["etag"]
        .as_str()
        .expect("write_file should return etag");
    assert!(initial_etag.starts_with("sha256:"));

    fs_ok(
        "fs/write_file",
        json!({
            "path": "missing_parent/a/hello.txt",
            "content": "SGVsbG8gUnVzdCE="
        }),
    )
    .await;
    assert!(temp_workspace.join("missing_parent/a/hello.txt").exists());

    let read_result = fs_ok("fs/read_file", json!({ "path": "src_test/hello.txt" })).await;
    assert_eq!(read_result["content"], json!("SGVsbG8gUnVzdCE="));
    assert_eq!(read_result["etag"], json!(initial_etag));

    let tree_result = fs_ok("fs/read_dir_recursive", json!({ "path": "." })).await;
    let files = tree_result["files"].as_array().unwrap();
    assert!(!files.is_empty());
    let src_node = files
        .iter()
        .find(|node| node["name"] == json!("src_test"))
        .expect("src_test node should be present");
    assert_eq!(src_node["type"], json!("directory"));
}

#[tokio::test]
async fn test_write_file_rejects_stale_etag() {
    let temp_workspace = init_test_workspace();
    let _ = fs::remove_file(temp_workspace.join("etag_conflict.txt"));

    let write_result = fs_ok(
        "fs/write_file",
        json!({
            "path": "etag_conflict.txt",
            "content": "b25l"
        }),
    )
    .await;
    let old_etag = write_result["etag"].as_str().unwrap();

    fs_ok(
        "fs/write_file",
        json!({
            "path": "etag_conflict.txt",
            "content": "dHdv",
            "old_etag": old_etag
        }),
    )
    .await;

    let conflict_err = fs_err(
        "fs/write_file",
        Some(json!({
            "path": "etag_conflict.txt",
            "content": "dGhyZWU=",
            "old_etag": old_etag
        })),
        FsPermission::Write,
    )
    .await;
    assert_eq!(conflict_err.code, JsonRpcErrorCode::FileConflict);
    assert!(conflict_err.message.contains("Data Conflict"));
}

#[tokio::test]
async fn test_write_existing_file_requires_etag() {
    let temp_workspace = init_test_workspace();
    let file_path = temp_workspace.join("etag_required.txt");
    let _ = fs::remove_file(&file_path);
    fs::write(&file_path, "current").unwrap();

    let conflict_err = fs_err(
        "fs/write_file",
        Some(json!({
            "path": "etag_required.txt",
            "content": "bmV4dA=="
        })),
        FsPermission::Write,
    )
    .await;
    assert_eq!(conflict_err.code, JsonRpcErrorCode::FileConflict);
    assert!(conflict_err.message.contains("Data Conflict"));
}

#[tokio::test]
async fn test_create_and_move_to_nested_missing_parent() {
    let temp_workspace = init_test_workspace();
    let _ = fs::remove_dir_all(temp_workspace.join("nested_create_test"));

    fs_ok("fs/mkdir", json!({ "path": "nested_create_test/a/b" })).await;
    assert!(temp_workspace.join("nested_create_test/a/b").is_dir());

    fs::write(temp_workspace.join("nested_create_test/source.txt"), "move").unwrap();
    fs_ok(
        "fs/move",
        json!({
            "from": "nested_create_test/source.txt",
            "to": "nested_create_test/c/d/target.txt"
        }),
    )
    .await;
    assert!(
        temp_workspace
            .join("nested_create_test/c/d/target.txt")
            .exists()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn test_move_renames_final_symlink_entry_without_following_target() {
    let temp_workspace = init_test_workspace();
    let outside = tempfile::tempdir().unwrap();
    let link_path = temp_workspace.join("move_symlink_source");
    let moved_link_path = temp_workspace.join("move_symlink_target");
    let _ = fs::remove_file(&link_path);
    let _ = fs::remove_file(&moved_link_path);
    let _ = fs::remove_dir_all(&moved_link_path);
    std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();

    fs_ok(
        "fs/move",
        json!({
            "from": "move_symlink_source",
            "to": "move_symlink_target"
        }),
    )
    .await;

    assert!(!link_path.exists());
    assert!(
        fs::symlink_metadata(&moved_link_path)
            .unwrap()
            .file_type()
            .is_symlink()
    );
    assert!(outside.path().exists());
}

#[tokio::test]
async fn test_read_only_ticket_rejects_write_methods() {
    let _temp_workspace = init_test_workspace();

    let write_err = fs_err(
        "fs/write_file",
        Some(json!({
            "path": "readonly.txt",
            "content": "SGVsbG8="
        })),
        FsPermission::Read,
    )
    .await;
    assert_eq!(write_err.code, JsonRpcErrorCode::PermissionDenied);
    assert!(write_err.message.contains("read-only"));

    let exec_err = fs_err(
        "fs/exec",
        Some(json!({ "command": "echo denied" })),
        FsPermission::Read,
    )
    .await;
    assert_eq!(exec_err.code, JsonRpcErrorCode::PermissionDenied);
    assert!(exec_err.message.contains("read-only"));
}

#[tokio::test]
async fn test_delete_and_move_reject_workspace_root() {
    let _temp_workspace = init_test_workspace();

    let delete_err = fs_err(
        "fs/delete",
        Some(json!({ "path": "." })),
        FsPermission::Write,
    )
    .await;
    assert!(delete_err.message.contains("workspace root"));

    let move_err = fs_err(
        "fs/move",
        Some(json!({ "from": ".", "to": "moved-root" })),
        FsPermission::Write,
    )
    .await;
    assert!(move_err.message.contains("workspace root"));
}

#[tokio::test]
async fn test_unknown_fs_method_returns_jsonrpc_error() {
    let _temp_workspace = init_test_workspace();

    let err = fs_err("fs/invalid_method", None, FsPermission::Write).await;
    assert_eq!(err.code, JsonRpcErrorCode::MethodNotFound);
    assert!(err.message.contains("Method not found"));
}

#[test]
fn test_parse_max_file_bytes() {
    assert_eq!(parse_max_file_bytes(Some("2048")), 2048);
    assert_eq!(parse_max_file_bytes(Some("0")), DEFAULT_MAX_FILE_BYTES);
    assert_eq!(parse_max_file_bytes(Some("bad")), DEFAULT_MAX_FILE_BYTES);
    assert_eq!(parse_max_file_bytes(None), DEFAULT_MAX_FILE_BYTES);
}

#[tokio::test]
async fn test_exec_runs_in_workspace_and_returns_output() {
    let temp_workspace = init_test_workspace();

    let result = fs_ok("fs/exec", json!({ "command": "pwd && printf done" })).await;

    assert_eq!(result["exitCode"], json!(0));
    let stdout = result["stdout"].as_str().unwrap();
    assert!(stdout.contains(temp_workspace.to_str().unwrap()));
    assert!(stdout.contains("done"));
}

#[tokio::test]
async fn test_exec_returns_non_zero_exit_code_and_stderr() {
    let _temp_workspace = init_test_workspace();

    let result = fs_ok("fs/exec", json!({ "command": "printf err >&2; exit 7" })).await;

    assert_eq!(result["exitCode"], json!(7));
    assert_eq!(result["stderr"], json!("err"));
}

#[tokio::test]
async fn test_exec_respects_timeout_ms() {
    let _temp_workspace = init_test_workspace();

    let result = fs_ok("fs/exec", json!({ "command": "sleep 2", "timeoutMs": 1 })).await;

    assert_eq!(result["exitCode"], json!(-1));
    assert!(result["stderr"].as_str().unwrap().contains("timed out"));
}

#[test]
fn test_collect_fs_event_paths_normalizes_paths() {
    let temp_workspace = init_test_workspace();
    let event = notify_event(
        EventKind::Create(CreateKind::File),
        vec![
            temp_workspace.join("src").join("index.ts"),
            temp_workspace.join("package.json"),
        ],
    );

    let paths = collect_fs_event_paths(&event);
    assert_eq!(paths, vec!["src/index.ts", "package.json"]);
}

#[test]
fn test_collect_fs_event_paths_does_not_hardcode_common_build_dirs() {
    let temp_workspace = init_test_workspace();
    let event = notify_event(
        EventKind::Create(CreateKind::File),
        vec![
            temp_workspace
                .join("node_modules")
                .join("pkg")
                .join("index.js"),
            temp_workspace.join(".git").join("HEAD"),
            temp_workspace.join("dist").join("index.js"),
            temp_workspace.join("build").join("index.js"),
        ],
    );

    let paths = collect_fs_event_paths(&event);
    assert_eq!(
        paths,
        vec![
            "node_modules/pkg/index.js",
            ".git/HEAD",
            "dist/index.js",
            "build/index.js"
        ]
    );
}

#[test]
fn test_collect_debounced_event_paths_ignores_access_events() {
    let temp_workspace = init_test_workspace();
    let events = vec![DebouncedEvent::new(
        notify_event(
            EventKind::Access(notify::event::AccessKind::Open(
                notify::event::AccessMode::Read,
            )),
            vec![temp_workspace.join("skills")],
        ),
        Instant::now(),
    )];

    let (paths, overflow) = collect_debounced_event_paths(&events);

    assert!(paths.is_empty());
    assert!(!overflow);
}

#[test]
fn test_build_fs_change_notification_uses_jsonrpc_notification_shape() {
    let notification = build_fs_change_notification(
        vec!["src/index.ts".to_string()],
        vec!["create".to_string()],
        false,
        42,
    );
    let value = serde_json::to_value(notification).unwrap();

    assert_eq!(value.get("jsonrpc").and_then(|v| v.as_str()), Some("2.0"));
    assert_eq!(
        value.get("method").and_then(|v| v.as_str()),
        Some("fs/did_change")
    );
    assert!(value.get("id").is_none());
    assert_eq!(
        value.pointer("/params/paths/0").and_then(|v| v.as_str()),
        Some("src/index.ts")
    );
    assert_eq!(
        value.pointer("/params/seq").and_then(|v| v.as_u64()),
        Some(42)
    );
    assert_eq!(
        value.pointer("/params/kinds/0").and_then(|v| v.as_str()),
        Some("create")
    );
    assert_eq!(
        value.pointer("/params/overflow").and_then(|v| v.as_bool()),
        Some(false)
    );
}

#[test]
fn test_publish_fs_change_batch_increments_seq() {
    let (tx, mut rx) = broadcast::channel(4);
    let mut next_seq = 0_u64;

    publish_fs_change_batch(
        &tx,
        &mut next_seq,
        FsChangeBatch {
            seq: 0,
            paths: vec!["src/index.ts".to_string()],
            kinds: vec!["modify".to_string()],
            overflow: false,
        },
    );

    let batch = rx.try_recv().unwrap();
    assert_eq!(batch.seq, 1);
    assert_eq!(batch.paths, vec!["src/index.ts"]);
    assert_eq!(batch.kinds, vec!["modify"]);
    assert!(!batch.overflow);
}

#[test]
fn test_publish_fs_change_batch_can_emit_overflow_only_notification() {
    let (tx, mut rx) = broadcast::channel(4);
    let mut next_seq = 7_u64;

    publish_fs_change_batch(
        &tx,
        &mut next_seq,
        FsChangeBatch {
            seq: 0,
            paths: Vec::new(),
            kinds: vec!["overflow".to_string()],
            overflow: true,
        },
    );

    let batch = rx.try_recv().unwrap();
    assert_eq!(batch.seq, 8);
    assert!(batch.paths.is_empty());
    assert_eq!(batch.kinds, vec!["overflow"]);
    assert!(batch.overflow);
}
