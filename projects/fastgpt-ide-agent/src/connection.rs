use std::sync::Arc;

use tokio::net::TcpStream;

use crate::fs::{FsPermission, handle_fs_session};
const MAX_WS_MESSAGE_SIZE: usize = 16 * 1024 * 1024;
const MAX_WS_FRAME_SIZE: usize = 4 * 1024 * 1024;
use crate::terminal::handle_terminal_session;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Channel {
    Fs,
    Terminal,
}

fn ws_config() -> tokio_tungstenite::tungstenite::protocol::WebSocketConfig {
    tokio_tungstenite::tungstenite::protocol::WebSocketConfig::default()
        .max_message_size(Some(MAX_WS_MESSAGE_SIZE))
        .max_frame_size(Some(MAX_WS_FRAME_SIZE))
}

fn extract_token(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
) -> Option<String> {
    extract_query_value(req, "token")
}

fn extract_query_value(
    req: &tokio_tungstenite::tungstenite::handshake::server::Request,
    target_key: &str,
) -> Option<String> {
    req.uri().query().and_then(|query| {
        query.split('&').find_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            (key == target_key).then(|| value.to_string())
        })
    })
}

fn build_unauthorized_response(
    err: &str,
) -> tokio_tungstenite::tungstenite::handshake::server::ErrorResponse {
    let mut resp =
        tokio_tungstenite::tungstenite::http::Response::new(Some(format!("Unauthorized: {}", err)));
    *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::UNAUTHORIZED;
    resp
}

fn parse_channel(path: &str) -> Option<Channel> {
    match path {
        "/fs" => Some(Channel::Fs),
        "/terminal" => Some(Channel::Terminal),
        _ => None,
    }
}

#[allow(clippy::result_large_err)]
pub async fn handle_connection(stream: TcpStream, expected_password: Arc<String>) {
    let mut channel = None;
    let mut fs_permission = FsPermission::Read;

    let ws_stream = match tokio_tungstenite::accept_hdr_async_with_config(
        stream,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         response: tokio_tungstenite::tungstenite::handshake::server::Response| {
            let parsed_channel = parse_channel(req.uri().path())
                .ok_or_else(|| build_unauthorized_response("Unknown websocket path"))?;
            channel = Some(parsed_channel);

            let token_opt = extract_token(req);

            if token_opt.as_deref() != Some(expected_password.as_str()) {
                return Err(build_unauthorized_response(
                    "Invalid or missing agent token",
                ));
            }

            fs_permission = match extract_query_value(req, "permission") {
                Some(value) => FsPermission::parse(&value)
                    .ok_or_else(|| build_unauthorized_response("Invalid fs permission"))?,
                None => FsPermission::Read,
            };

            if parsed_channel == Channel::Terminal && fs_permission != FsPermission::Write {
                return Err(build_unauthorized_response(
                    "Terminal connection requires write permission",
                ));
            }

            Ok(response)
        },
        Some(ws_config()),
    )
    .await
    {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("Failed to accept websocket: {}", e);
            return;
        }
    };

    match channel {
        Some(Channel::Terminal) => handle_terminal_session(ws_stream).await,
        Some(Channel::Fs) => handle_fs_session(ws_stream, fs_permission).await,
        None => eprintln!("Unknown request path after websocket handshake"),
    }
}
