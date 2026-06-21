# Enterprise Identity Baseline

This fork adds the first internal identity guardrails for an enterprise FastGPT deployment.

## Runtime Switches

Configure these values in the enterprise environment file:

| Variable | Purpose |
| --- | --- |
| `ENTERPRISE_PASSWORD_LOGIN_ENABLED` | Allows non-root password login when `true`. Set to `false` after SSO is ready. The `root` account remains available as a break-glass account. |
| `ENTERPRISE_AUTH_ALLOWED_EMAIL_DOMAINS` | Comma-separated email domains accepted by the enterprise identity provider. |
| `ENTERPRISE_OIDC_ISSUER` | OIDC issuer URL. |
| `ENTERPRISE_OIDC_CLIENT_ID` | OIDC client ID. |
| `ENTERPRISE_OIDC_CLIENT_SECRET` | OIDC client secret. |
| `ENTERPRISE_OIDC_SCOPES` | OIDC scopes. Default: `openid profile email`. |
| `ENTERPRISE_OIDC_EMAIL_CLAIM` | Claim used as the enterprise email identity. Default: `email`. |
| `ENTERPRISE_OIDC_GROUPS_CLAIM` | Claim used for group mapping. Default: `groups`. |

## Current Behavior

When `ENTERPRISE_PASSWORD_LOGIN_ENABLED=false`, password login is rejected for all non-root users and an enterprise audit event is written with reason `password_login_disabled`.

The root account is intentionally exempt so an operator can recover access during SSO outages. Keep its password in a sealed break-glass procedure and rotate it after use.

## SSO Rollout Checklist

1. Create the FastGPT client in the corporate IdP.
2. Restrict callback URLs to the internal FastGPT domain.
3. Set `ENTERPRISE_AUTH_ALLOWED_EMAIL_DOMAINS`.
4. Map IdP groups to FastGPT teams and owners.
5. Validate first login with a pilot group.
6. Set `ENTERPRISE_PASSWORD_LOGIN_ENABLED=false`.
7. Confirm failed password attempts and successful SSO logins appear in enterprise audit logs.

## Remaining Implementation Gap

The runtime now has SSO-ready configuration and password-login gating. The actual OIDC callback flow still needs to be wired into FastGPT account/session creation once the target IdP, callback URL, and group mapping rules are confirmed.
