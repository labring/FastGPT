use std::sync::Arc;

use tokio::net::TcpListener;

mod connection;
mod fs;
mod password;
mod protocol;
mod terminal;
mod workspace;

use connection::handle_connection;
use password::load_or_create_ide_agent_password;
use workspace::get_workspace_root;

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

    let password = Arc::new(
        load_or_create_ide_agent_password().expect("Failed to initialize IDE Agent password"),
    );

    let bind_addr =
        std::env::var("IDE_AGENT_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:1318".to_string());
    let listener = TcpListener::bind(&bind_addr)
        .await
        .unwrap_or_else(|_| panic!("Failed to bind to {}", bind_addr));
    println!("FastGPT IDE Agent listening on {}", bind_addr);

    loop {
        match listener.accept().await {
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
}
