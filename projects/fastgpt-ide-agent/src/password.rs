use std::env;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use base64::Engine;
use sha2::{Digest, Sha256};

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

pub const AGENT_TOKEN_HEADER: &str = "x-fastgpt-agent-token";
pub const PASSWORD_FILE_NAME: &str = ".fastgpt-ide-agent-password";
const IDE_AGENT_PASSWORD_BYTES: usize = 32;
const DEFAULT_RUNTIME_DIR: &str = "/var/lib/fastgpt-runtime";

fn generate_ide_agent_password() -> io::Result<String> {
    let mut bytes = [0u8; IDE_AGENT_PASSWORD_BYTES];
    File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

fn resolve_password_path() -> PathBuf {
    let runtime_dir = env::var_os("FASTGPT_RUNTIME_DIR")
        .filter(|val| !val.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(DEFAULT_RUNTIME_DIR));
    runtime_dir.join(PASSWORD_FILE_NAME)
}

fn ensure_owner_only_permissions(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        let meta = std::fs::symlink_metadata(path)?;
        let mode = meta.permissions().mode() & 0o7777;
        if mode != 0o600 {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

pub(crate) fn load_or_create_ide_agent_password_at(path: &Path) -> Result<String, String> {
    let read_existing_password = || -> Result<Option<String>, String> {
        match std::fs::read_to_string(path) {
            Ok(content) => {
                let password = content.trim().to_string();
                if password.is_empty() {
                    Ok(None)
                } else {
                    ensure_owner_only_permissions(path).map_err(|err| {
                        format!("Failed to secure IDE Agent password permissions: {err}")
                    })?;
                    Ok(Some(password))
                }
            }
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(format!("Failed to read IDE Agent password file: {err}")),
        }
    };

    if let Some(password) = read_existing_password()? {
        return Ok(password);
    }

    let parent = path
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
        .ok_or_else(|| "Invalid IDE Agent password file path".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|err| format!("Failed to create IDE Agent password directory: {err}"))?;

    let password = generate_ide_agent_password()
        .map_err(|err| format!("Failed to generate IDE Agent password: {err}"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(PASSWORD_FILE_NAME);
    let tmp_path = parent.join(format!(".{file_name}.tmp-{}", std::process::id()));

    let write_result = (|| -> io::Result<()> {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            options.mode(0o600);
        }
        let mut file = options.open(&tmp_path)?;
        file.write_all(format!("{password}\n").as_bytes())?;
        file.sync_all()?;
        ensure_owner_only_permissions(&tmp_path)?;
        std::fs::rename(&tmp_path, path)?;
        Ok(())
    })();

    if let Err(err) = write_result {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to write IDE Agent password file: {err}"));
    }

    Ok(password)
}

/**
 * Loads or generates the per-container IDE agent authentication password stored in
 * `${FASTGPT_RUNTIME_DIR:-/var/lib/fastgpt-runtime}/.fastgpt-ide-agent-password`.
 */
pub fn load_or_create_ide_agent_password() -> Result<String, String> {
    let password_path = resolve_password_path();
    load_or_create_ide_agent_password_at(&password_path)
}

/**
 * Verifies a caller-supplied agent token against the expected instance password using constant-time SHA-256 digest comparison.
 */
pub fn verify_ide_agent_token(provided: &str, expected: &str) -> bool {
    let trimmed_provided = provided.trim();
    if trimmed_provided.is_empty() || expected.is_empty() {
        return false;
    }

    let provided_digest = Sha256::digest(trimmed_provided.as_bytes());
    let expected_digest = Sha256::digest(expected.as_bytes());

    let mut diff = 0_u8;
    for (a, b) in provided_digest.iter().zip(expected_digest.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_reuses_owner_only_password_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PASSWORD_FILE_NAME);

        let first = load_or_create_ide_agent_password_at(&path).unwrap();
        assert!(!first.is_empty());

        #[cfg(unix)]
        {
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }

        let second = load_or_create_ide_agent_password_at(&path).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn regenerates_password_when_existing_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PASSWORD_FILE_NAME);
        std::fs::write(&path, "   \n").unwrap();

        let generated = load_or_create_ide_agent_password_at(&path).unwrap();
        assert!(!generated.is_empty());
        assert_eq!(std::fs::read_to_string(&path).unwrap().trim(), generated);
    }

    #[test]
    fn verifies_tokens_with_constant_time_digest_equality() {
        assert!(verify_ide_agent_token("secret-token", "secret-token"));
        assert!(verify_ide_agent_token("  secret-token\n", "secret-token"));
        assert!(!verify_ide_agent_token("wrong-token", "secret-token"));
        assert!(!verify_ide_agent_token("secret-toke", "secret-token"));
        assert!(!verify_ide_agent_token("", "secret-token"));
        assert!(!verify_ide_agent_token("secret-token", ""));
    }
}
