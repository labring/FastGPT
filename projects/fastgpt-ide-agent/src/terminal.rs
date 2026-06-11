use std::env;
use std::io::{Read, Write};
use std::thread;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;

use crate::workspace::get_workspace_root;

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
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    Ok((pair, writer, child))
}

pub async fn handle_terminal_session<S>(ws_stream: tokio_tungstenite::WebSocketStream<S>)
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

    let (outbound_tx, mut rx) = tokio::sync::mpsc::channel::<Message>(100);
    let (close_tx, mut close_rx) = tokio::sync::oneshot::channel::<Option<CloseFrame>>();
    let pty_tx = outbound_tx.clone();
    // PTY reader 是长生命周期阻塞循环，使用专用 OS 线程，避免占用 Tokio blocking pool。
    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if pty_tx
                        .blocking_send(Message::Binary(buffer[..n].to_vec().into()))
                        .is_err()
                    {
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
        loop {
            tokio::select! {
                biased;
                close_reason = &mut close_rx => {
                    if let Ok(frame) = close_reason {
                        let _ = ws_sink.send(Message::Close(frame)).await;
                    }
                    break;
                }
                message = rx.recv() => {
                    let Some(message) = message else {
                        break;
                    };
                    if ws_sink.send(message).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    let mut close_tx = Some(close_tx);
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
                Message::Close(frame) => {
                    if let Some(tx) = close_tx.take() {
                        let _ = tx.send(frame);
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => {},
        _ = &mut recv_task => {},
    }

    if !send_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut send_task).await;
    }
    if !recv_task.is_finished() {
        let _ = tokio::time::timeout(Duration::from_millis(200), &mut recv_task).await;
    }

    if !send_task.is_finished() {
        send_task.abort();
    }
    if !recv_task.is_finished() {
        recv_task.abort();
    }

    // 回收子进程资源以杜绝僵尸进程，触发 PTY Reader 的 EOF 以正常退出阻塞线程
    let _ = child.kill();
    tokio::task::spawn_blocking(move || {
        let _ = child.wait();
    });
}
