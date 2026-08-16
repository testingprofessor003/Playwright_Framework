# Recordings

## Source screen recordings (codegen)

Put UI recordings in **`recordings/recorded executions/`**. The Playwright-from-video skill fetches videos from that folder.

```text
recordings/
  recorded executions/        # INPUT: drop .mp4 / .webm / .mov / .mkv here
    my-flow.mp4
    my-flow/                  # generated stills + screen inventory
      frames/
      frames-manifest.json
      screens.json
  test-runs/                  # Playwright scenario videos from test runs
    Create_a_single_customer-abcd1234.webm
```

## How to generate tests

1. Record the journey in the application (login, each screen, the outcome).
2. Save the file under `recordings/recorded executions/` (`.mp4`, `.webm`, `.mov`, or `.mkv`).
3. In Cursor or Claude Code, attach the video or say: **Generate Playwright from recordings/recorded executions/my-flow.mp4**.
4. If you do not pass a path, the agent lists and fetches every video in `recorded executions`.
5. The agent will:

   - list files (`npm run generate:frames:list`)
   - extract frames (`npm run generate:frames -- --video my-flow.mp4`)
   - create one page object per new screen
   - reuse `LoginPage` and existing customer pages when those screens appear
   - add `features/<slug>.feature` and `features/steps/<slug>.steps.ts`
   - dry-run Cucumber so steps bind

Optional: extract frames yourself first (filename is resolved from `recorded executions`):

```bash
npm run generate:frames:list
npm run generate:frames -- --video my-flow.mp4
```

`ffmpeg` must be on `PATH` (Windows, macOS, or Linux) or set `FFMPEG_PATH` for frame extraction. The agent can still read the video directly if ffmpeg is missing. Generated locators always include an XPath fallback.

## Scenario videos from test runs

Controlled by `.env`:

```bash
VIDEO=retain-on-failure   # or on | off
```

When kept, Playwright writes a `.webm` under `recordings/test-runs/` (named from the scenario). The Extent report (`reports/extent/latest.html`, plus a per-run file under `reports/extent/history/`) embeds a player and a download link for that file on the test detail page. Do not use `test-runs` as input for the generate-from-video skill.
