use std::env;
use std::io::{Read, Write};
use std::thread;

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use thiserror::Error;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use crate::workspace::get_workspace_root;

const PTY_CHANNEL_CAPACITY: usize = 100;

#[derive(Debug)]
pub(super) enum PtyCommand {
    Write(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

#[derive(Debug, Error)]
pub(super) enum TerminalError {
    #[error("failed to {operation}: {message}")]
    Pty {
        operation: &'static str,
        message: String,
    },
    #[error("failed to spawn {name} thread")]
    ThreadSpawn {
        name: &'static str,
        #[source]
        source: std::io::Error,
    },
    #[error("{name} thread panicked")]
    ThreadPanic { name: &'static str },
    #[error("PTY setup task failed")]
    SetupTask(#[source] tokio::task::JoinError),
    #[error("PTY cleanup task failed")]
    CleanupTask(#[source] tokio::task::JoinError),
}

impl TerminalError {
    fn pty(operation: &'static str, error: impl std::fmt::Display) -> Self {
        Self::Pty {
            operation,
            message: error.to_string(),
        }
    }
}

/// Bridges the async WebSocket session to the blocking `portable-pty` API.
pub(super) struct PtyBridge {
    command_tx: mpsc::Sender<PtyCommand>,
    child: Box<dyn portable_pty::Child + Send>,
    reader_thread: thread::JoinHandle<()>,
    control_thread: thread::JoinHandle<()>,
}

impl PtyBridge {
    /// Creates the PTY on Tokio's blocking pool; persistent I/O then runs on dedicated threads.
    pub(super) async fn spawn(outbound_tx: mpsc::Sender<Message>) -> Result<Self, TerminalError> {
        tokio::task::spawn_blocking(move || Self::spawn_blocking(outbound_tx))
            .await
            .map_err(TerminalError::SetupTask)?
    }

    fn spawn_blocking(outbound_tx: mpsc::Sender<Message>) -> Result<Self, TerminalError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| TerminalError::pty("open PTY", error))?;

        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
        let mut command = CommandBuilder::new(shell);
        command.cwd(get_workspace_root());
        command.env("TERM", "xterm-256color");

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| TerminalError::pty("clone PTY reader", error))?;
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|error| TerminalError::pty("take PTY writer", error))?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| TerminalError::pty("spawn PTY command", error))?;

        let (command_tx, mut command_rx) = mpsc::channel(PTY_CHANNEL_CAPACITY);
        let master = pair.master;
        let control_thread = match thread::Builder::new()
            .name("fastgpt-pty-control".to_string())
            .spawn(move || {
                while let Some(command) = command_rx.blocking_recv() {
                    let result = match command {
                        PtyCommand::Write(data) => {
                            writer.write_all(&data).and_then(|()| writer.flush())
                        }
                        PtyCommand::Resize { rows, cols } => master
                            .resize(PtySize {
                                rows,
                                cols,
                                pixel_width: 0,
                                pixel_height: 0,
                            })
                            .map_err(std::io::Error::other),
                    };
                    if result.is_err() {
                        break;
                    }
                }
            }) {
            Ok(thread) => thread,
            Err(source) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(TerminalError::ThreadSpawn {
                    name: "PTY control",
                    source,
                });
            }
        };

        let reader_thread = match thread::Builder::new()
            .name("fastgpt-pty-reader".to_string())
            .spawn(move || {
                let mut buffer = [0_u8; 4096];
                loop {
                    match reader.read(&mut buffer) {
                        Ok(0) => break,
                        Ok(read_len) => {
                            let message = Message::Binary(buffer[..read_len].to_vec().into());
                            if outbound_tx.blocking_send(message).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            }) {
            Ok(thread) => thread,
            Err(source) => {
                drop(command_tx);
                let _ = child.kill();
                let _ = child.wait();
                let _ = control_thread.join();
                return Err(TerminalError::ThreadSpawn {
                    name: "PTY reader",
                    source,
                });
            }
        };

        Ok(Self {
            command_tx,
            child,
            reader_thread,
            control_thread,
        })
    }

    pub(super) fn command_sender(&self) -> mpsc::Sender<PtyCommand> {
        self.command_tx.clone()
    }

    /// Stops the child process before joining both blocking PTY threads.
    pub(super) async fn shutdown(self) -> Result<(), TerminalError> {
        let Self {
            command_tx,
            mut child,
            reader_thread,
            control_thread,
        } = self;
        drop(command_tx);

        tokio::task::spawn_blocking(move || {
            let _ = child.kill();
            let _ = child.wait();
            control_thread
                .join()
                .map_err(|_| TerminalError::ThreadPanic {
                    name: "PTY control",
                })?;
            reader_thread
                .join()
                .map_err(|_| TerminalError::ThreadPanic { name: "PTY reader" })?;
            Ok(())
        })
        .await
        .map_err(TerminalError::CleanupTask)?
    }
}
