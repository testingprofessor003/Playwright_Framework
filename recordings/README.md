# Recordings

Drop a screen recording here and ask the agent to generate Playwright tests from it.

```text
recordings/
  my-flow.mp4
  my-flow/
    frames/              # stills extracted from the video
    frames-manifest.json
    screens.json         # screen → page-object inventory
```

## How to generate tests

1. Record the journey in the application (login, each screen, the outcome).
2. Save the file under `recordings/` (`.mp4`, `.webm`, `.mov`, or `.mkv`).
3. In Cursor, attach the video or say: **Generate Playwright from recordings/my-flow.mp4**.
4. The agent will:

   - extract frames (`npm run generate:frames -- --video recordings/my-flow.mp4`)
   - create one page object per new screen
   - reuse `LoginPage` and existing customer pages when those screens appear
   - add `features/<slug>.feature` and `features/steps/<slug>.steps.ts`
   - dry-run Cucumber so steps bind

Optional: extract frames yourself first:

```bash
npm run generate:frames -- --video recordings/my-flow.mp4
```

`ffmpeg` must be on `PATH` (or set `FFMPEG_PATH`) for frame extraction. The agent can still read the video directly if ffmpeg is missing.
