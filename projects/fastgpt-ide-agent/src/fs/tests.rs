use super::handlers::{DEFAULT_MAX_FILE_BYTES, parse_max_file_bytes};
use super::watcher::{
    FsChangeBatch, build_fs_change_notification, collect_debounced_event_paths,
    collect_fs_event_paths, publish_fs_change_batch,
};
use super::{FsPermission, handle_fs_request, handle_fs_request_with_limit};
use crate::protocol::{JsonRpcError, JsonRpcErrorCode, JsonRpcRequest};
use crate::workspace::init_test_workspace;
use notify_debouncer_full::DebouncedEvent;
use notify_debouncer_full::notify::Event;
use notify_debouncer_full::notify::event::{
    AccessKind, AccessMode, CreateKind, EventAttributes, EventKind,
};
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use tokio::sync::broadcast;

fn entry_names(arr: &Value) -> Vec<&str> {
    arr.as_array()
        .unwrap()
        .iter()
        .filter_map(|entry| entry["name"].as_str())
        .collect()
}

fn fs_request(method: &str, params: Option<Value>) -> JsonRpcRequest {
    JsonRpcRequest {
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

#[cfg(unix)]
#[tokio::test]
async fn test_fs_allows_reading_and_writing_symlinks_pointing_outside_workspace() {
    let temp_workspace = init_test_workspace();
    let outside = tempfile::tempdir().unwrap();
    let outside_file = outside.path().join("external.txt");
    fs::write(&outside_file, b"hello").unwrap();

    let link_path = temp_workspace.join("external_link.txt");
    let _ = fs::remove_file(&link_path);
    std::os::unix::fs::symlink(&outside_file, &link_path).unwrap();

    let read_res = fs_ok("fs/read_file", json!({ "path": "external_link.txt" })).await;
    assert_eq!(read_res["content"], json!("aGVsbG8="));

    let old_etag = read_res["etag"].as_str().unwrap();
    fs_ok(
        "fs/write_file",
        json!({
            "path": "external_link.txt",
            "content": "dXBkYXRlZA==",
            "old_etag": old_etag
        }),
    )
    .await;
    assert_eq!(fs::read(&outside_file).unwrap(), b"updated");

    let _ = fs::remove_file(&link_path);
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
            EventKind::Access(AccessKind::Open(AccessMode::Read)),
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

#[tokio::test]
async fn test_reserved_workspace_root_entries_are_hidden_from_listings_and_events() {
    let temp_workspace = init_test_workspace();
    let _ = fs::remove_dir_all(temp_workspace.join("lost+found"));
    let _ = fs::remove_dir_all(temp_workspace.join(".hidden_dotdir"));
    let _ = fs::remove_dir_all(temp_workspace.join("nested_reserved_check"));
    let _ = fs::remove_file(temp_workspace.join("visible_reserved_check.txt"));

    fs::create_dir_all(temp_workspace.join("lost+found")).unwrap();
    fs::create_dir_all(temp_workspace.join(".hidden_dotdir/pip-cache")).unwrap();
    fs::write(
        temp_workspace.join(".hidden_dotdir/pip-cache/pkg.whl"),
        b"whl",
    )
    .unwrap();
    fs::create_dir_all(temp_workspace.join("nested_reserved_check/lost+found")).unwrap();
    fs::write(
        temp_workspace.join("nested_reserved_check/lost+found/keep.txt"),
        b"ok",
    )
    .unwrap();
    fs::write(temp_workspace.join("visible_reserved_check.txt"), b"ok").unwrap();

    let dir_res = fs_ok("fs/read_dir", json!({ "path": "." })).await;
    let names = entry_names(&dir_res);
    assert!(!names.contains(&"lost+found"));
    assert!(names.contains(&".hidden_dotdir"));
    assert!(names.contains(&"visible_reserved_check.txt"));
    assert!(names.contains(&"nested_reserved_check"));

    let nested_dir_res = fs_ok("fs/read_dir", json!({ "path": "nested_reserved_check" })).await;
    assert!(entry_names(&nested_dir_res).contains(&"lost+found"));

    let tree_res = fs_ok(
        "fs/read_dir_recursive",
        json!({ "path": ".", "maxDepth": 3, "excludeNames": [] }),
    )
    .await;
    let root_tree_names = entry_names(&tree_res["files"]);
    assert!(!root_tree_names.contains(&"lost+found"));
    assert!(root_tree_names.contains(&".hidden_dotdir"));
    assert!(root_tree_names.contains(&"visible_reserved_check.txt"));

    let nested_node = tree_res["files"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| node["name"] == "nested_reserved_check")
        .unwrap();
    assert!(entry_names(&nested_node["children"]).contains(&"lost+found"));

    let event = notify_event(
        EventKind::Create(CreateKind::File),
        vec![
            temp_workspace.join("lost+found/1234"),
            temp_workspace.join(".hidden_dotdir/pip-cache/pkg.whl"),
            temp_workspace.join("nested_reserved_check/lost+found/keep.txt"),
            temp_workspace.join("visible_reserved_check.txt"),
        ],
    );
    let paths = collect_fs_event_paths(&event);
    assert_eq!(
        paths,
        vec![
            ".hidden_dotdir/pip-cache/pkg.whl".to_string(),
            "nested_reserved_check/lost+found/keep.txt".to_string(),
            "visible_reserved_check.txt".to_string(),
        ]
    );

    let _ = fs::remove_dir_all(temp_workspace.join("lost+found"));
    let _ = fs::remove_dir_all(temp_workspace.join(".hidden_dotdir"));
    let _ = fs::remove_dir_all(temp_workspace.join("nested_reserved_check"));
    let _ = fs::remove_file(temp_workspace.join("visible_reserved_check.txt"));
}

#[cfg(unix)]
#[tokio::test]
async fn test_delete_removes_symlink_entry_without_touching_target() {
    let temp_workspace = init_test_workspace();
    let outside = tempfile::tempdir().unwrap();
    let keep_file = outside.path().join("keep.txt");
    fs::write(&keep_file, "must stay").unwrap();

    let link_path = temp_workspace.join("delete_symlink_entry");
    let _ = fs::remove_file(&link_path);
    let _ = fs::remove_dir_all(&link_path);
    std::os::unix::fs::symlink(outside.path(), &link_path).unwrap();

    fs_ok("fs/delete", json!({ "path": "delete_symlink_entry" })).await;

    assert!(fs::symlink_metadata(&link_path).is_err());
    assert_eq!(fs::read_to_string(&keep_file).unwrap(), "must stay");
}

#[tokio::test]
async fn test_atomic_tmp_files_are_hidden_from_listings_and_events() {
    let temp_workspace = init_test_workspace();
    let dir = temp_workspace.join("atomic_tmp_visibility");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(".env"), b"KEEP=1").unwrap();
    fs::write(dir.join(".env.fastgpt-tmp-42"), b"TEMP").unwrap();
    fs::write(dir.join("visible.txt"), b"ok").unwrap();

    let dir_res = fs_ok("fs/read_dir", json!({ "path": "atomic_tmp_visibility" })).await;
    let names = entry_names(&dir_res);
    assert!(names.contains(&".env"));
    assert!(names.contains(&"visible.txt"));
    assert!(!names.contains(&".env.fastgpt-tmp-42"));

    let tree_res = fs_ok(
        "fs/read_dir_recursive",
        json!({ "path": "atomic_tmp_visibility", "maxDepth": 2, "excludeNames": [] }),
    )
    .await;
    let tree_names = entry_names(&tree_res["files"]);
    assert!(tree_names.contains(&".env"));
    assert!(tree_names.contains(&"visible.txt"));
    assert!(!tree_names.contains(&".env.fastgpt-tmp-42"));

    let event = notify_event(
        EventKind::Create(CreateKind::File),
        vec![
            dir.join(".env.fastgpt-tmp-42"),
            dir.join(".env"),
            dir.join("visible.txt"),
        ],
    );
    let paths = collect_fs_event_paths(&event);
    assert_eq!(
        paths,
        vec![
            "atomic_tmp_visibility/.env".to_string(),
            "atomic_tmp_visibility/visible.txt".to_string(),
        ]
    );

    let _ = fs::remove_dir_all(&dir);
}

#[tokio::test]
async fn test_disk_quota_blocks_write_and_mkdir_but_allows_read_move_and_delete() {
    let temp_workspace = init_test_workspace();
    let dir = temp_workspace.join("disk_quota_ws_test");
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("seed.bin"), vec![b'x'; 16 * 1024]).unwrap();

    let call = |method, params| {
        handle_fs_request_with_limit(
            fs_request(method, Some(params)),
            FsPermission::Write,
            Some(1),
        )
    };

    // 配额设为 1 字节，写入与建目录拒绝（-32005），读/改名/删除始终放行。
    assert_eq!(
        call(
            "fs/write_file",
            json!({ "path": "disk_quota_ws_test/new.txt", "content": "" })
        )
        .await
        .error
        .unwrap()
        .code,
        JsonRpcErrorCode::DiskQuotaExceeded
    );
    assert_eq!(
        call("fs/mkdir", json!({ "path": "disk_quota_ws_test/subdir" }))
            .await
            .error
            .unwrap()
            .code,
        JsonRpcErrorCode::DiskQuotaExceeded
    );
    assert!(
        call("fs/read_dir", json!({ "path": "disk_quota_ws_test" }))
            .await
            .error
            .is_none()
    );
    assert!(
        call(
            "fs/move",
            json!({
                "from": "disk_quota_ws_test/seed.bin",
                "to": "disk_quota_ws_test/seed-moved.bin"
            })
        )
        .await
        .error
        .is_none()
    );
    assert!(
        call("fs/delete", json!({ "path": "disk_quota_ws_test" }))
            .await
            .error
            .is_none()
    );
    assert!(!dir.exists());
}
