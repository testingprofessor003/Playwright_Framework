# GitHub activities summary

Internal notes for Git remote setup and authorship (16 Aug 2026). **Do not publish repository URLs or account identifiers in stakeholder materials.**

## What was done (high level)

1. Initialized Git in the project workspace and configured local author as **Admin Professor**.
2. Created a remote GitHub repository and published the initial framework commit.
3. Excluded secrets from version control (for example `.env` was not committed).
4. Removed Cursor co-author trailers from commit history so authorship shows **Admin Professor** only.
5. Linked commits to the intended GitHub account via that account’s noreply email (not a public URL in docs).

## Force pushes

History was rewritten twice on the default branch (with `--force-with-lease`) to:

1. Drop Cursor `Co-authored-by` attribution.
2. Re-attribute the commit email to the project owner’s GitHub noreply address.

Anyone who cloned earlier SHAs should reset or re-clone.

## CI secrets (confirmed against `.github/workflows/ci.yml`)

The workflow **fails before tests** if credentials are missing. Configure these as repository **Secrets** (not in source):

| Secret | Required | Purpose |
| --- | --- | --- |
| `APP_USERNAME` | Yes | Core banking login user |
| `APP_PASSWORD` | Yes | Plain password or `enc.v1...` ciphertext |
| `APP_ENCRYPTION_KEY` | Only if password is encrypted | Decrypts `APP_PASSWORD` |
| `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` | Optional | BrowserStack job |
| `LLM_API_KEY` | Optional | Not used when `LLM_ENABLED=false` (CI default) |

Optional repository **variable**: `BASE_URL` (defaults to the core banking AUT).

CI defaults include `LLM_ENABLED=false`, headed pauses off, and tags such as `@smoke and not @example`.

## Stakeholder docs

HLD / Word / PPT must **not** include remote repository URLs. Point stakeholders to local design packs under `docs/` only.
