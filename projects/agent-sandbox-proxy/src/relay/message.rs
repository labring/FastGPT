use axum::extract::ws::{Message as AxumMsg, WebSocket as AxumWs};
use futures_util::{SinkExt, stream::SplitSink};
use tokio_tungstenite::tungstenite::{
    Error as WsError, error::CapacityError, protocol::Message as WsMsg,
};

type ClientWsSink = SplitSink<AxumWs, AxumMsg>;

const WS_CLOSE_MESSAGE_TOO_BIG_CODE: u16 = 1009;
pub(super) const WS_CLOSE_INTERNAL_ERROR_CODE: u16 = 1011;

pub(super) enum UpstreamControl {
    Close(WsMsg),
    Flush,
}

pub(super) fn is_upstream_closed_error(error: &WsError) -> bool {
    matches!(error, WsError::ConnectionClosed | WsError::AlreadyClosed)
        || matches!(
            error,
            WsError::Io(io_error)
                if matches!(
                    io_error.kind(),
                    std::io::ErrorKind::ConnectionReset
                        | std::io::ErrorKind::BrokenPipe
                        | std::io::ErrorKind::NotConnected
                )
        )
}

pub(super) fn upstream_error_client_close(error: &WsError) -> (u16, &'static str) {
    if matches!(
        error,
        WsError::Capacity(CapacityError::MessageTooLong { .. })
    ) {
        (WS_CLOSE_MESSAGE_TOO_BIG_CODE, "Sandbox message too large")
    } else {
        (
            WS_CLOSE_INTERNAL_ERROR_CODE,
            "Sandbox agent connection lost",
        )
    }
}

pub(super) async fn close_client_ws(client_sink: &mut ClientWsSink, code: u16, reason: &str) {
    let _ = client_sink.send(client_close_message(code, reason)).await;
}

pub(super) fn send_client_close(
    client_tx: &tokio::sync::mpsc::Sender<AxumMsg>,
    code: u16,
    reason: &str,
) {
    send_client_close_message(client_tx, client_close_message(code, reason));
}

pub(super) fn send_client_close_message(
    client_tx: &tokio::sync::mpsc::Sender<AxumMsg>,
    message: AxumMsg,
) {
    let _ = client_tx.try_send(message);
}

pub(super) fn send_upstream_close(
    upstream_tx: &tokio::sync::mpsc::Sender<UpstreamControl>,
    message: WsMsg,
) {
    let _ = upstream_tx.try_send(UpstreamControl::Close(message));
}

pub(super) fn send_upstream_flush(upstream_tx: &tokio::sync::mpsc::Sender<UpstreamControl>) {
    let _ = upstream_tx.try_send(UpstreamControl::Flush);
}

pub(super) fn client_close_message(code: u16, reason: &str) -> AxumMsg {
    AxumMsg::Close(Some(axum::extract::ws::CloseFrame {
        code,
        reason: reason.into(),
    }))
}

pub(super) fn upstream_close_message(code: u16, reason: &str) -> WsMsg {
    axum_to_tungstenite(client_close_message(code, reason))
}

/// Converts every Axum WebSocket message variant into its Tungstenite counterpart.
pub(super) fn axum_to_tungstenite(message: AxumMsg) -> WsMsg {
    match message {
        AxumMsg::Text(text) => WsMsg::Text(text.to_string().into()),
        AxumMsg::Binary(data) => WsMsg::Binary(data),
        AxumMsg::Ping(data) => WsMsg::Ping(data),
        AxumMsg::Pong(data) => WsMsg::Pong(data),
        AxumMsg::Close(frame) => {
            WsMsg::Close(frame.map(
                |frame| tokio_tungstenite::tungstenite::protocol::CloseFrame {
                    code: frame.code.into(),
                    reason: frame.reason.to_string().into(),
                },
            ))
        }
    }
}

/// Drops Tungstenite's raw frame variant, which Axum does not expose.
pub(super) fn tungstenite_to_axum(message: WsMsg) -> Option<AxumMsg> {
    match message {
        WsMsg::Text(text) => Some(AxumMsg::Text(text.to_string().into())),
        WsMsg::Binary(data) => Some(AxumMsg::Binary(data)),
        WsMsg::Ping(data) => Some(AxumMsg::Ping(data)),
        WsMsg::Pong(data) => Some(AxumMsg::Pong(data)),
        WsMsg::Close(frame) => Some(AxumMsg::Close(frame.map(|frame| {
            axum::extract::ws::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason.to_string().into(),
            }
        }))),
        WsMsg::Frame(_) => None,
    }
}
