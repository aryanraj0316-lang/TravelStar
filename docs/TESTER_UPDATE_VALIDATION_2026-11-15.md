# Tester update validation — 15 November 2026

## Result

Automated checks pass for the current workspace. The update has **not** been published. A physical-device in-place update smoke test remains outstanding; automated tests and bundle compilation do not establish that every device layout and native playback path is correct.

## Installed build compatibility

Read-only EAS metadata confirmed the existing tester build:

- Build: `e142e320-5dda-4fc2-baad-9dfbdb92efa9`
- Android app version `1.0.0`, version code `2`
- Channel `production`, runtime version `1.0.0`, Expo SDK `57.0.0`
- Git revision `aa32da25a047ac65241ca4dab0e68aa140006390`

`app.json`, `eas.json`, `package.json`, the dependency lockfile, and tracked native directories are unchanged relative to that revision. These fixes use native modules already present in the app. They do not introduce native dependencies or change the runtime version. No database fields or migrations were added for these fixes.

The build was made from a dirty workspace, and this workspace also contains pre-existing changes. Matching the Git revision alone does not establish a byte-for-byte match with the JavaScript originally uploaded to EAS.

## Verification

- App TypeScript check: passed.
- Backend TypeScript check: passed.
- App tests: **162 passed across 17 suites**.
- Backend tests: **79 passed across 13 suites**, including **66 tests against an isolated local PostgreSQL database** and 13 mocked regression tests.
- Android production bundle export: passed, 1,910 modules.
- Scoped lint for the new story, startup, and identity helpers/tests: passed.
- Whitespace checks for the final changed production files: passed.

Each backend suite was validated in its own process and its JSON result checked. Combined runs exited before producing a complete summary; they are not counted as successful combined runs. Detailed per-suite results are retained locally in `.expo/backend-validation/summary.json`.

No production database or tester records were used for the database checks. The validation database was created locally for this task and removed afterward.

## Cases covered

- Existing stories, trip details, chat messages, chat members, story viewers, and guide reviews display renamed profiles while retaining their original user IDs and content.
- Profile edits preserve the account and existing authenticated session.
- Expired stories disappear from both listings and reject new views, likes, and interaction reads; recent stories remain available.
- Viewed-story order, account isolation, persistence, and delayed storage restoration work correctly.
- Text-only stories can become viewed without an image callback. Videos wait for their first rendered frame; a prefetched asset does not count as video playback.
- Image warming starts before an unrelated inbox request finishes and shares duplicate downloads.
- The splash waits for restored cache and releases after the bounded warmup timeout even if the network never finishes.
- Organizer badge counts exclude seen requests and completed/rejected requests.
- Empty trips can be removed only by their owner. Trips with requests, members, bookings, expenses, enquiry threads, or guide quotes are preserved.
- Deleted trip details, enquiries, and new joins are rejected. Concurrent deletion and joining cannot leave a cancelled trip with a newly created request.
- Existing booking, cancellation, refund, roster, chat, story, review, and seat-concurrency suites pass.

The review found and corrected two edge cases beyond the first implementation: video/text-only viewed-state readiness, and joins/enquiries against deleted trips from cached pages.

## Rollout requirements

1. Deploy the backend changes before publishing the app update. App-only publication does not deploy deletion, server-side name resolution, or story expiry.
2. Keep the existing app runtime/channel when preparing an OTA update for the confirmed tester binary.
3. Before broad delivery, smoke-test an existing installation without clearing its data: preserved login, profile Save visibility with the keyboard open/closed, name updates on another account, image/video/text stories and gray rings after reopening, organizer badge clearing, and accidental-trip deletion.
4. The physical-device check has not been performed in this environment because Android platform tools are unavailable at the configured SDK path.

Uncached content still depends on network speed. The native build's existing update-startup settings remain unchanged.
