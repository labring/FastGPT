use std::sync::Arc;

use tokio::net::TcpListener;

mod connection;
mod fs;
mod password;
mod preview;
mod protocol;
mod terminal;
mod workspace;

use connection::handle_connection;
use password::load_or_create_ide_agent_password;
use workspace::get_workspace_root;

const WS_BIND_ADDR: &str = "0.0.0.0:1318";
const PREVIEW_BIND_ADDR: &str = "0.0.0.0:1319";

#[tokio::main]
async fn main() {
    let workspace = get_workspace_root();
    println!(
        "FastGPT IDE Agent starting. Workspace root: {:?}",
        workspace
    );

    if !workspace.exists() {
        tokio::fs::create_dir_all(workspace)
            .await
            .unwrap_or_else(|err| {
                panic!("Failed to create workspace root {:?}: {}", workspace, err)
            });
    }

    let password = Arc::new(
        load_or_create_ide_agent_password().expect("Failed to initialize IDE Agent password"),
    );

    let ws_listener = TcpListener::bind(WS_BIND_ADDR)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to {}", WS_BIND_ADDR));
    println!("FastGPT IDE Agent listening on {}", WS_BIND_ADDR);

    let preview_listener = TcpListener::bind(PREVIEW_BIND_ADDR)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to {}", PREVIEW_BIND_ADDR));
    println!(
        "FastGPT IDE Agent preview server listening on {}",
        PREVIEW_BIND_ADDR
    );

    let serve_ws = async {
        loop {
            match ws_listener.accept().await {
                Ok((stream, _)) => {
                    let expected_password = Arc::clone(&password);
                    tokio::spawn(async move {
                        handle_connection(stream, expected_password).await;
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
    };

    tokio::select! {
        _ = serve_ws => {}
        result = preview::serve_preview(preview_listener, Arc::clone(&password)) => {
            panic!("Preview server stopped unexpectedly: {result:?}");
        }
    };
}
