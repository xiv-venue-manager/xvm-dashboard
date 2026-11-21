# xvm-api contract copy

`openapi.json` is a copy of `contract/openapi.json` from xiv-venue-manager/xvm-api at commit `300eeaf` (the head of xvm-api PR #275, `feat/event-archive`). Re-point this at the dev commit that merges it.

`lib/api/xvm-api.contract.test.ts` checks `lib/api/xvm-api.ts` against it. To refresh, copy the file from xvm-api's dev branch, update the commit above, run `pnpm --filter web test lib/api/xvm-api.contract`, and fix or record any drift it reports.
