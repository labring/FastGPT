use std::env;
use std::fs::{File, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

use base64::Engine;
#[cfg(unix)]
use std::os::unix::fs::OpenOptionsExt;

const IDE_AGENT_PASSWORD_BYTES: usize = 32;

fn generate_ide_agent_password() -> String {
    let mut bytes = [0u8; IDE_AGENT_PASSWORD_BYTES];
    File::open("/dev/urandom")
        .and_then(|mut file| file.read_exact(&mut bytes))
        .expect("Failed to read random bytes for IDE Agent password");
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn get_password_path() -> PathBuf {
    let home = env::var("HOME").unwrap_or_else(|_| {
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg("echo ~")
            .output()
            .expect("Failed to execute sh for HOME resolution");
        String::from_utf8(output.stdout).unwrap().trim().to_string()
    });
    PathBuf::from(home).join(".fastgpt-ide-agent-password")
}

pub fn load_or_create_ide_agent_password() -> Result<String, String> {
    let password_path = get_password_path();
    let password_path = password_path.as_path();

    match std::fs::read_to_string(password_path) {
        Ok(content) => {
            let password = content.trim().to_string();
            if !password.is_empty() {
                return Ok(password);
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Failed to read IDE Agent password file: {}", err)),
    }

    let parent = password_path
        .parent()
        .ok_or_else(|| "Invalid IDE Agent password file path".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|err| format!("Failed to create IDE Agent password directory: {}", err))?;

    let password = generate_ide_agent_password();
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        options.mode(0o600);
    }
    let mut file = options
        .open(password_path)
        .map_err(|err| format!("Failed to create IDE Agent password file: {}", err))?;
    file.write_all(format!("{}\n", password).as_bytes())
        .map_err(|err| format!("Failed to write IDE Agent password file: {}", err))?;

    Ok(password)
}
