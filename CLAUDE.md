# Claude instructions

This repo is a Playwright + Cucumber BDD framework with page objects.

When the user provides a screen recording or asks to generate Playwright from a video, follow `.claude/skills/playwright-from-video/SKILL.md`:

1. Map each distinct screen in the recording.
2. Reuse `LoginPage` and existing customer pages when those screens appear.
3. Create a new `src/pages/<Name>Page.ts` for every new screen.
4. Add `features/<slug>.feature` and `features/steps/<slug>.steps.ts`.
5. Keep locators in page objects; steps only call page methods.
6. Dry-run Cucumber before finishing.
