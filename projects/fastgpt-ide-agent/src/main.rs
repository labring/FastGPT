use std::collections::HashSet;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::SystemTime;
use tokio::net::{TcpListener, TcpStream};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{Read, Write};
use tokio_tungstenite::tungstenite::Message;

static WORKSPACE_ROOT: OnceLock<PathBuf> = OnceLock::new();

fn get_workspace_root() -> &'static Path {
    WORKSPACE_ROOT.get_or_init(|| {
        let dir = env::var("FASTGPT_WORKDIR").unwrap_or_else(|_| "/workspace".to_string());
        PathBuf::from(dir)
    })
}

#[derive(Deserialize, Serialize, Debug)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: serde_json::Value,
    method: String,
    params: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize, Deserialize, Debug)]
struct JsonRpcError {
    code: i32,
    message: String,
}

#[derive(Deserialize, Debug, Clone)]
struct TicketClaims {
    channel: String,
    permission: String,
    #[serde(rename = "exp")]
    _exp: u64,
}

async fn sanitize_path(input_path: &str) -> Result<PathBuf, String> {
    let base = get_workspace_root();

    // 还原前端 API 既定契约：剥离前导 '/' 字符，将其转换为工作区相对路径以通过 path_security 校验
    let relative_path = input_path.strip_prefix('/').unwrap_or(input_path);

    path_security::validate_path(Path::new(relative_path), base).map_err(|e| e.to_string())
}

async fn handle_read_dir(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    let mut entries = Vec::new();
    let mut dir = tokio::fs::read_dir(clean_path)
        .await
        .map_err(|e| e.to_string())?;

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = metadata.is_dir();
        let size = metadata.len();
        let mtime = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        entries.push(json!({
            "name": name,
            "is_dir": is_dir,
            "size": size,
            "mtime": mtime
        }));
    }

    Ok(serde_json::Value::Array(entries))
}

async fn handle_read_file(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    let mut file = tokio::fs::File::open(&clean_path)
        .await
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;

    let mut content_bytes = Vec::with_capacity(metadata.len() as usize);
    use tokio::io::AsyncReadExt;
    file.read_to_end(&mut content_bytes)
        .await
        .map_err(|e| e.to_string())?;

    let mut content_b64 = String::with_capacity(content_bytes.len().div_ceil(3) * 4);
    base64::engine::general_purpose::STANDARD.encode_string(&content_bytes, &mut content_b64);
    let mtime = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(json!({
        "content": content_b64,
        "mtime": mtime
    }))
}

async fn handle_write_file(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let content_b64 = params
        .get("content")
        .and_then(|v| v.as_str())
        .ok_or("content param required")?;

    let clean_path = sanitize_path(path_str).await?;

    if clean_path.exists() {
        let metadata = tokio::fs::metadata(&clean_path)
            .await
            .map_err(|e| e.to_string())?;
        let actual_mtime = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // 校验修改时间防冲突
        if params
            .get("old_mtime")
            .and_then(|v| v.as_u64())
            .is_some_and(|old_val| old_val != actual_mtime)
        {
            return Err("conflict".to_string());
        }
    }

    let raw_bytes = base64::engine::general_purpose::STANDARD
        .decode(content_b64)
        .map_err(|e| e.to_string())?;

    if let Some(parent) = clean_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    use tokio::io::AsyncWriteExt;
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&clean_path)
        .await
        .map_err(|e| e.to_string())?;

    file.write_all(&raw_bytes)
        .await
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().await.map_err(|e| e.to_string())?;

    let new_mtime = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(json!({ "mtime": new_mtime }))
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct FsTreeNode {
    name: String,
    #[serde(rename = "type")]
    item_type: String, // "file" | "directory"
    size: u64,
    mtime: u64,
    path: String,
    level: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<FsTreeNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    loaded: Option<bool>,
}

async fn scan_dir_recursive(
    dir_path: &Path,
    rel_path: String,
    level: usize,
    max_depth: usize,
    exclude_names: Arc<HashSet<String>>,
) -> Result<Vec<FsTreeNode>, String> {
    let mut dir = match tokio::fs::read_dir(dir_path).await {
        Ok(d) => d,
        Err(_) => return Ok(Vec::new()),
    };

    use futures_util::stream::FuturesUnordered;
    let mut tasks = FuturesUnordered::new();

    while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().into_owned();

        if exclude_names.contains(&name) {
            continue;
        }

        let child_path = entry.path();
        let child_rel_path = if rel_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel_path, name)
        };

        // 优先使用轻量 file_type 判定类型，减少元数据系统调用
        let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
        let is_dir = file_type.is_dir();

        let exclude_names_clone = exclude_names.clone();

        // 并发读取元数据并递归扫描子目录
        tasks.push(async move {
            let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
            let size = metadata.len();
            let mtime = metadata
                .modified()
                .unwrap_or(SystemTime::UNIX_EPOCH)
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let mut children = None;
            if is_dir && level < max_depth {
                let sub_children = Box::pin(scan_dir_recursive(
                    &child_path,
                    child_rel_path.clone(),
                    level + 1,
                    max_depth,
                    exclude_names_clone,
                ))
                .await?;
                children = Some(sub_children);
            }

            Ok::<FsTreeNode, String>(FsTreeNode {
                name,
                item_type: if is_dir {
                    "directory".to_string()
                } else {
                    "file".to_string()
                },
                size,
                mtime,
                path: child_rel_path,
                level,
                children,
                loaded: is_dir.then_some(level < max_depth),
            })
        });
    }

    let mut entries = Vec::new();
    while let Some(res) = tasks.next().await {
        entries.push(res?);
    }

    entries.sort_by(|a, b| {
        let a_is_dir = a.item_type == "directory";
        let b_is_dir = b.item_type == "directory";
        if a_is_dir != b_is_dir {
            b_is_dir.cmp(&a_is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

async fn handle_read_dir_recursive(
    params: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params.get("path").and_then(|v| v.as_str()).unwrap_or(".");
    let clean_path = sanitize_path(path_str).await?;
    let max_depth = params
        .get("maxDepth")
        .and_then(|v| v.as_u64())
        .map(|depth| depth.min(50) as usize)
        .unwrap_or(20);

    let exclude_set: HashSet<String> = params
        .get("excludeNames")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_else(|| {
            ["node_modules", ".git", ".next", "dist", "build", ".bun"]
                .iter()
                .map(|s| s.to_string())
                .collect()
        });

    let exclude_names = Arc::new(exclude_set);
    let files = scan_dir_recursive(&clean_path, String::new(), 0, max_depth, exclude_names).await?;

    let mut expanded_paths = Vec::new();
    fn collect_expanded_paths(nodes: &[FsTreeNode], paths: &mut Vec<String>) {
        for node in nodes {
            if node.item_type == "directory" && node.level == 0 {
                paths.push(node.path.clone());
            }
        }
    }
    collect_expanded_paths(&files, &mut expanded_paths);

    Ok(json!({
        "files": files,
        "expandedPaths": expanded_paths
    }))
}

async fn handle_mkdir(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    tokio::fs::create_dir_all(&clean_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

async fn handle_delete(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let path_str = params
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("path param required")?;
    let clean_path = sanitize_path(path_str).await?;

    // 直接尝试删除文件，若报错（如目标是目录）则回退为目录递归删除
    if let Err(e) = tokio::fs::remove_file(&clean_path).await {
        if e.kind() == std::io::ErrorKind::NotFound {
            return Err("File or directory not found".to_string());
        }
        tokio::fs::remove_dir_all(&clean_path)
            .await
            .map_err(|err| err.to_string())?;
    }
    Ok(json!({ "success": true }))
}

async fn handle_move(params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let params = params.ok_or("Params required")?;
    let from_str = params
        .get("from")
        .and_then(|v| v.as_str())
        .ok_or("from param required")?;
    let to_str = params
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or("to param required")?;

    let clean_from = sanitize_path(from_str).await?;
    let clean_to = sanitize_path(to_str).await?;

    // 检查源路径存在性，防止源路径不存在时残留空父目录
    if !clean_from.exists() {
        return Err("Source path does not exist".to_string());
    }

    if let Some(parent) = clean_to.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| e.to_string())?;
    }

    tokio::fs::rename(&clean_from, &clean_to)
        .await
        .map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

fn is_write_fs_method(method: &str) -> bool {
    matches!(
        method,
        "fs/write_file" | "fs/mkdir" | "fs/delete" | "fs/move"
    )
}

async fn handle_fs_request(req: JsonRpcRequest, permission: &str) -> JsonRpcResponse {
    if permission != "write" && is_write_fs_method(req.method.as_str()) {
        return JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32003,
                message: "Forbidden: read-only sandbox ticket".to_string(),
            }),
        };
    }

    let result = match req.method.as_str() {
        "fs/read_dir" => handle_read_dir(req.params).await.map_err(|e| (-32603, e)),
        "fs/read_dir_recursive" => handle_read_dir_recursive(req.params)
            .await
            .map_err(|e| (-32603, e)),
        "fs/read_file" => handle_read_file(req.params).await.map_err(|e| (-32603, e)),
        "fs/write_file" => handle_write_file(req.params).await.map_err(|e| {
            if e == "conflict" {
                (
                    -32001,
                    "Data Conflict: The file has been modified elsewhere.".to_string(),
                )
            } else {
                (-32603, e)
            }
        }),
        "fs/mkdir" => handle_mkdir(req.params).await.map_err(|e| (-32603, e)),
        "fs/delete" => handle_delete(req.params).await.map_err(|e| (-32603, e)),
        "fs/move" => handle_move(req.params).await.map_err(|e| (-32603, e)),
        _ => Err((-32601, "Method not found".to_string())),
    };

    match result {
        Ok(res) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: Some(res),
            error: None,
        },
        Err((code, msg)) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError { code, message: msg }),
        },
    }
}

async fn handle_fs_session<S>(ws_stream: tokio_tungstenite::WebSocketStream<S>, permission: String)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut ws_sink, mut ws_source) = ws_stream.split();

    while let Some(Ok(msg)) = ws_source.next().await {
        let text_opt = match msg {
            Message::Text(t) => Some(t),
            Message::Binary(b) => String::from_utf8(b).ok(),
            _ => None,
        };

        let Some(text) = text_opt else {
            continue;
        };
        let Ok(req) = serde_json::from_str::<JsonRpcRequest>(&text) else {
            continue;
        };

        let response = handle_fs_request(req, &permission).await;
        if let Ok(response_text) = serde_json::to_string(&response) {
            if ws_sink.send(Message::Text(response_text)).await.is_err() {
                break;
            }
        }
    }
}

#[allow(clippy::type_complexity)]
fn spawn_pty() -> Result<
    (
        portable_pty::PtyPair,
        Box<dyn std::io::Write + Send>,
        Box<dyn portable_pty::Child + Send>,
    ),
    String,
> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let cmd_str = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    let mut cmd = CommandBuilder::new(&cmd_str);
    cmd.cwd(get_workspace_root());

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    Ok((pair, writer, child))
}

async fn handle_terminal_session<S>(ws_stream: tokio_tungstenite::WebSocketStream<S>)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (pair, mut pty_writer, mut child) = match spawn_pty() {
        Ok(val) => val,
        Err(e) => {
            eprintln!("Failed to spawn PTY: {}", e);
            return;
        }
    };

    let mut pty_reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Failed to clone PTY reader: {}", e);
            let _ = child.kill();
            return;
        }
    };

    let (mut ws_sink, mut ws_source) = ws_stream.split();

    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.blocking_send(buffer[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    // master 仅由接收任务独占使用，直接移动其所有权
    let master = pair.master;

    let mut send_task = tokio::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            if ws_sink.send(Message::Binary(bytes)).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_source.next().await {
            match msg {
                Message::Binary(data) if data.len() == 13 && data[0] == 0xFE => {
                    let cols = u32::from_be_bytes([data[1], data[2], data[3], data[4]]);
                    let rows = u32::from_be_bytes([data[5], data[6], data[7], data[8]]);
                    let _ = master.resize(PtySize {
                        rows: rows as u16,
                        cols: cols as u16,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Message::Binary(data) => {
                    if pty_writer.write_all(&data).is_err() {
                        break;
                    }
                    let _ = pty_writer.flush();
                }
                Message::Text(text) => {
                    if pty_writer.write_all(text.as_bytes()).is_err() {
                        break;
                    }
                    let _ = pty_writer.flush();
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
    }

    send_task.abort();
    recv_task.abort();

    // 回收子进程资源以杜绝僵尸进程，触发 PTY Reader 的 EOF 以正常退出阻塞线程
    let _ = child.kill();
    tokio::task::spawn_blocking(move || {
        let _ = child.wait();
    });
}

fn get_jwt_secret() -> Option<String> {
    std::env::var("AGENT_SANDBOX_PROXY_SECRET")
        .ok()
        .filter(|s| !s.trim().is_empty())
}

fn validate_token(
    token: &str,
    secret: &str,
    expected_channel: &str,
) -> Result<TicketClaims, String> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.leeway = 5;

    let claims = decode::<TicketClaims>(token, &decoding_key, &validation)
        .map(|token_data| token_data.claims)
        .map_err(|e| e.to_string())?;

    if claims.channel != expected_channel {
        return Err(format!(
            "JWT channel mismatch: expected {}, actual {}",
            expected_channel, claims.channel
        ));
    }

    if expected_channel == "terminal" && claims.permission != "write" {
        return Err("JWT terminal permission requires write".to_string());
    }

    Ok(claims)
}

fn extract_token(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
) -> Option<String> {
    // 1. 尝试从 Query 提取
    if let Some(query) = req.uri().query() {
        let token = query.split('&').find_map(|p| {
            let mut s = p.splitn(2, '=');
            let k = s.next()?;
            let v = s.next()?;
            if k == "token" || k == "access_token" {
                Some(v.to_string())
            } else {
                None
            }
        });
        if token.is_some() {
            return token;
        }
    }
    // 2. 尝试从 Authorization Header 提取
    req.headers()
        .get(tokio_tungstenite::tungstenite::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .filter(|s| s.to_lowercase().starts_with("bearer "))
        .map(|s| s[7..].to_string())
}

fn build_unauthorized_response(
    err: &str,
) -> tokio_tungstenite::tungstenite::handshake::server::ErrorResponse {
    let mut resp =
        tokio_tungstenite::tungstenite::http::Response::new(Some(format!("Unauthorized: {}", err)));
    *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::UNAUTHORIZED;
    resp
}

#[allow(clippy::result_large_err)]
async fn handle_connection(stream: TcpStream) {
    let mut path = String::new();
    let mut fs_permission = "write".to_string();

    let ws_stream = match tokio_tungstenite::accept_hdr_async(
        stream,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            path = req.uri().path().to_string();
            let expected_channel = if path.ends_with("/terminal") {
                "terminal"
            } else if path.ends_with("/fs") {
                "fs"
            } else {
                return Err(build_unauthorized_response("Unknown websocket path"));
            };

            if let Some(secret) = get_jwt_secret() {
                let token_opt = extract_token(req);
                let validation_res = match token_opt {
                    Some(token) => validate_token(&token, &secret, expected_channel),
                    None => Err("Missing JWT token".to_string()),
                };

                match validation_res {
                    Ok(claims) => {
                        fs_permission = claims.permission;
                    }
                    Err(err) => {
                        eprintln!("JWT validation failed: {}", err);
                        return Err(build_unauthorized_response(&err));
                    }
                }
            } else {
                eprintln!("Warning: fastgpt-ide-agent is running without JWT validation (AGENT_SANDBOX_PROXY_SECRET is empty)");
            }

            Ok(response)
        },
    )
    .await
    {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("Failed to accept websocket: {}", e);
            return;
        }
    };

    if path.ends_with("/terminal") {
        handle_terminal_session(ws_stream).await;
    } else if path.ends_with("/fs") {
        handle_fs_session(ws_stream, fs_permission).await;
    } else {
        eprintln!("Unknown request path for websocket: {}", path);
    }
}

#[tokio::main]
async fn main() {
    let workspace = get_workspace_root();
    println!(
        "FastGPT IDE Agent starting. Workspace root: {:?}",
        workspace
    );

    if !workspace.exists() {
        let _ = tokio::fs::create_dir_all(workspace).await;
    }

    let bind_addr =
        std::env::var("IDE_AGENT_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:1318".to_string());
    let listener = TcpListener::bind(&bind_addr)
        .await
        .expect(&format!("Failed to bind to {}", bind_addr));
    println!("FastGPT IDE Agent listening on {}", bind_addr);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tokio::spawn(async move {
                    handle_connection(stream).await;
                });
            }
            Err(e) => {
                eprintln!(
                    "Accept connection error: {:?}. Temporary pause for 50ms...",
                    e
                );
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::env;
    use std::fs;

    fn init_test_workspace() -> PathBuf {
        let mut temp_dir = env::temp_dir();
        temp_dir.push("fastgpt_ide_agent_test");
        if temp_dir.exists() {
            let _ = fs::remove_dir_all(&temp_dir);
        }
        let _ = fs::create_dir_all(&temp_dir);
        env::set_var("FASTGPT_WORKDIR", temp_dir.to_str().unwrap());
        temp_dir
    }

    #[tokio::test]
    async fn test_sanitize_path_success() {
        let temp_workspace = init_test_workspace();

        // 写入一个虚拟测试文件，以确保 validate_path 能正常通过
        let test_file = temp_workspace.join("dummy.txt");
        let _ = fs::write(&test_file, "dummy");

        let res = sanitize_path("dummy.txt").await;
        assert!(res.is_ok());
        let path = res.unwrap();
        assert!(path.ends_with("dummy.txt"));

        let res = sanitize_path("/dummy.txt").await;
        assert!(res.is_ok());
        let path = res.unwrap();
        assert!(path.ends_with("dummy.txt"));
    }

    #[tokio::test]
    async fn test_sanitize_path_traversal_denied() {
        let _temp_workspace = init_test_workspace();

        let res = sanitize_path("../../../etc/passwd").await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn test_handle_fs_request_jsonrpc_workflow() {
        let _temp_workspace = init_test_workspace();

        // 1. 测试创建目录 (fs/mkdir)
        let mkdir_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/mkdir".to_string(),
            params: Some(json!({ "path": "src_test" })),
        };
        let resp = handle_fs_request(mkdir_req, "write").await;
        assert!(resp.error.is_none());
        assert_eq!(
            resp.result.unwrap().get("success").unwrap().as_bool(),
            Some(true)
        );

        // 2. 测试写入文件 (fs/write_file) - Base64 编码的 "Hello Rust!" 是 "SGVsbG8gUnVzdCE="
        let write_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(2.into()),
            method: "fs/write_file".to_string(),
            params: Some(json!({
                "path": "src_test/hello.txt",
                "content": "SGVsbG8gUnVzdCE="
            })),
        };
        let resp = handle_fs_request(write_req, "write").await;
        assert!(resp.error.is_none());
        let mtime = resp.result.unwrap().get("mtime").unwrap().as_u64();
        assert!(mtime.is_some());

        // 3. 测试读取文件 (fs/read_file)
        let read_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(3.into()),
            method: "fs/read_file".to_string(),
            params: Some(json!({ "path": "src_test/hello.txt" })),
        };
        let resp = handle_fs_request(read_req, "write").await;
        assert!(resp.error.is_none());
        let result_obj = resp.result.unwrap();
        let content_b64 = result_obj.get("content").unwrap().as_str().unwrap();
        assert_eq!(content_b64, "SGVsbG8gUnVzdCE=");

        // 4. 测试递归读取文件树 (fs/read_dir_recursive)
        let read_tree_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(4.into()),
            method: "fs/read_dir_recursive".to_string(),
            params: Some(json!({ "path": "." })),
        };
        let resp = handle_fs_request(read_tree_req, "write").await;
        assert!(resp.error.is_none());
        let tree_res = resp.result.unwrap();
        let files = tree_res.get("files").unwrap().as_array().unwrap();
        assert!(!files.is_empty());
        let first_node = &files[0];
        assert_eq!(first_node.get("name").unwrap().as_str(), Some("src_test"));
        assert_eq!(first_node.get("type").unwrap().as_str(), Some("directory"));

        // 5. 测试非法方法名 (fs/invalid_method) - 应返回标准错误
        let invalid_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(5.into()),
            method: "fs/invalid_method".to_string(),
            params: None,
        };
        let resp = handle_fs_request(invalid_req, "write").await;
        assert!(resp.result.is_none());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32601);
        assert!(err.message.contains("Method not found"));
    }

    #[tokio::test]
    async fn test_read_only_ticket_rejects_write_methods() {
        let _temp_workspace = init_test_workspace();

        let write_req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: serde_json::Value::Number(1.into()),
            method: "fs/write_file".to_string(),
            params: Some(json!({
                "path": "readonly.txt",
                "content": "SGVsbG8="
            })),
        };

        let resp = handle_fs_request(write_req, "read").await;
        assert!(resp.result.is_none());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32003);
        assert!(err.message.contains("read-only"));
    }
}
