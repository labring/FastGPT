use std::env;
use std::io;
use std::time::Duration;

use pty_process::{Command, Size};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Child;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::protocol::frame::{CloseFrame, coding::CloseCode};
use tracing::warn;

use crate::connection::finish_or_abort;
use crate::disk::{DISK_SOFT_LIMIT_ENV, disk_soft_limit_bytes};
use crate::workspace::get_workspace_root;

const PTY_CHANNEL_CAPACITY: usize = 64;
const PTY_SHUTDOWN_READER_TIMEOUT: Duration = Duration::from_secs(2);

pub(super) enum PtyCommand {
    Write(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

/// 在子 shell `fork` 后、`exec` 前设置 `RLIMIT_FSIZE` 硬上限，防止单文件瞬间写爆磁盘且不限制 `ide-agent` 自身。
#[cfg(unix)]
fn apply_fsize_limit(command: Command, fsize_limit: Option<u64>) -> Command {
    let Some(limit) = fsize_limit else {
        return command;
    };
    let rlim = limit as libc::rlim_t;
    // Safety: `libc::setrlimit` is an async-signal-safe POSIX syscall operating only on stack data.
    unsafe {
        command.pre_exec(move || {
            let resource_limit = libc::rlimit {
                rlim_cur: rlim,
                rlim_max: rlim,
            };
            if libc::setrlimit(libc::RLIMIT_FSIZE, &resource_limit) != 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        })
    }
}

#[cfg(not(unix))]
fn apply_fsize_limit(command: Command, _fsize_limit: Option<u64>) -> Command {
    command
}

/// Bridges one async WebSocket session to a child shell running on an async Unix PTY.
pub(super) struct PtyBridge {
    command_tx: mpsc::Sender<PtyCommand>,
    child: Child,
    reader_task: JoinHandle<()>,
    control_task: JoinHandle<()>,
}

impl PtyBridge {
    /// Spawns the default shell inside an async PTY with optional Docker `RLIMIT_FSIZE` protection.
    ///
    /// When `over_quota` is true, enforces `RLIMIT_FSIZE=0` and `HISTFILE=/dev/null` so the user can
    /// still open a shell to inspect and remove `$HOME` caches or oversized workspace files without
    /// growing files further.
    pub(super) fn spawn(
        outbound_tx: mpsc::Sender<Message>,
        over_quota: bool,
    ) -> Result<Self, String> {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut command = Command::new(shell)
            .current_dir(get_workspace_root())
            .env("TERM", "xterm-256color");
        for bootstrap_var in [
            "FASTGPT_WORKDIR",
            "FASTGPT_RUNTIME_DIR",
            DISK_SOFT_LIMIT_ENV,
            "FASTGPT_IDE_MAX_FILE_BYTES",
            "FASTGPT_IDE_WS_MAX_MESSAGE_BYTES",
            "FASTGPT_IDE_WS_MAX_FRAME_BYTES",
        ] {
            command = command.env_remove(bootstrap_var);
        }
        let fsize_limit = if over_quota {
            command = command.env("HISTFILE", "/dev/null");
            Some(0)
        } else {
            disk_soft_limit_bytes()
        };
        command = apply_fsize_limit(command, fsize_limit);
        Self::spawn_command(command, outbound_tx)
    }

    #[cfg(test)]
    pub(super) fn spawn_for_test(
        command: Command,
        fsize_limit: Option<u64>,
        outbound_tx: mpsc::Sender<Message>,
    ) -> Result<Self, String> {
        Self::spawn_command(apply_fsize_limit(command, fsize_limit), outbound_tx)
    }

    fn spawn_command(command: Command, outbound_tx: mpsc::Sender<Message>) -> Result<Self, String> {
        let (pty, pts) = pty_process::open().map_err(|err| format!("failed to open PTY: {err}"))?;
        pty.resize(Size::new(24, 80))
            .map_err(|err| format!("failed to initialize PTY size: {err}"))?;

        let child = command
            .spawn(pts)
            .map_err(|err| format!("failed to spawn PTY command: {err}"))?;

        let (mut reader, mut writer) = pty.into_split();
        let (command_tx, mut command_rx) = mpsc::channel(PTY_CHANNEL_CAPACITY);

        let control_task = tokio::spawn(async move {
            while let Some(command) = command_rx.recv().await {
                let ok = match command {
                    PtyCommand::Write(data) => {
                        writer.write_all(&data).await.is_ok() && writer.flush().await.is_ok()
                    }
                    PtyCommand::Resize { rows, cols } => {
                        writer.resize(Size::new(rows, cols)).is_ok()
                    }
                };
                if !ok {
                    break;
                }
            }
        });

        let reader_task = tokio::spawn(async move {
            let mut buffer = [0_u8; 4096];
            loop {
                match reader.read(&mut buffer).await {
                    Ok(0) | Err(_) => {
                        // Notify the WebSocket sender immediately when the shell exits so
                        // `handle_terminal_session` closes cleanly instead of waiting on `outbound_tx`.
                        let _ = outbound_tx
                            .send(Message::Close(Some(CloseFrame {
                                code: CloseCode::Normal,
                                reason: "Shell exited".into(),
                            })))
                            .await;
                        break;
                    }
                    Ok(read_len) => {
                        let message = Message::Binary(buffer[..read_len].to_vec().into());
                        if outbound_tx.send(message).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });

        Ok(Self {
            command_tx,
            child,
            reader_task,
            control_task,
        })
    }

    pub(super) fn command_sender(&self) -> mpsc::Sender<PtyCommand> {
        self.command_tx.clone()
    }

    /// Stops the child process group and tears down async PTY tasks with a bounded reader wait.
    pub(super) async fn shutdown(self) {
        let Self {
            command_tx,
            mut child,
            mut reader_task,
            mut control_task,
        } = self;
        drop(command_tx);

        #[cfg(unix)]
        if let Some(pid) = child.id() {
            // `pty_process::Command::spawn` starts a new session/process group led by `pid`.
            // Signal the whole group before `wait` (while `pid` cannot be recycled) to reap children too.
            unsafe {
                libc::killpg(pid as libc::pid_t, libc::SIGKILL);
            }
        } else {
            let _ = child.start_kill();
        }
        #[cfg(not(unix))]
        let _ = child.start_kill();

        let _ = child.wait().await;
        finish_or_abort(&mut control_task).await;

        // A detached `setsid` descendant can keep the PTY slave fd open, preventing EOF on `reader`.
        if tokio::time::timeout(PTY_SHUTDOWN_READER_TIMEOUT, &mut reader_task)
            .await
            .is_err()
        {
            warn!("Timed out waiting for PTY reader task to observe EOF after shutdown");
            reader_task.abort();
            let _ = reader_task.await;
        }
    }
}
