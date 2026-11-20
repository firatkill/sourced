# TC-145: intermittent React #418 on `/eval` (T-96)

- Date: 2026-11-20, branch `v2.4/project-scope` at 13adb4d, production build, mock mode, local Playwright fixtures.
- Symptom: `Minified React error #418; ... args[]=HTML&args[]=`. The server HTML and the first client render differ in structure. React recovers by rendering the tree again on the client, so the page still works. The only visible sign is the console error that TC-145 catches.

## Evidence

| Run                                                                                       | Result                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme.spec.ts` and `eval-page.spec.ts`, `--repeat-each=20`, 4 workers                    | 2 of 600 failed, both TC-145 and both on `/eval` (system light/stored null, system dark/stored dark)                                                                         |
| Trace of one failure                                                                      | The page error comes 374 ms after `page.goto('/eval')` and before the test's first action on that page, so it happens during the load and is not caused by the test's clicks |
| 40 requests to `/eval` on one server, HTML hashed after removing nonces                   | Only the nonces differ; the server HTML is deterministic                                                                                                                     |
| 375 plain `/eval` loads (alone, and after `/`), one browser                               | 0 errors                                                                                                                                                                     |
| 120 replays of the exact TC-145 flow (load, Appearance, Linen, Midnight, next page)       | 0 errors                                                                                                                                                                     |
| 160 loads of `/`, `/eval` and `/how-it-works` in 4 parallel pages at 6× CPU throttling    | 0 errors                                                                                                                                                                     |
| TC-145 instrumented to save server and client HTML on #418, `--repeat-each=30` (720 runs) | No #418 captured                                                                                                                                                             |

None of the client components on `/eval` (`PageShell`, `ContentShell`, `ChatRail`, `ResultsTable`) reads time, locale, storage or media queries during render. The only browser value (`matchMedia` in `ChatRail`) is read in an effect.

## Status

Cause not found; the rate is about 1 in 300 runs, and only under the full parallel suite. TC-145 stays as it is: it must not tolerate the error. If it fails in CI, rerun it. Next step when it shows up again: build with `experimental.allowDevelopmentBuild` (non-minified React) and run TC-145 with `--repeat-each=30` to get the diff React prints.
