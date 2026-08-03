export const OPEN_SANDBOX_DEFAULT_ROOT_PATH = '/workspace';

// Align E2B with OpenSandbox: separate the working directory (/workspace)
// from HOME (/home/user), so that persistent volumes (OSS mounts, NAS, etc.)
// can be attached to /workspace while dotfiles and credentials stay local.
export const E2B_DEFAULT_ROOT_PATH = '/workspace';
