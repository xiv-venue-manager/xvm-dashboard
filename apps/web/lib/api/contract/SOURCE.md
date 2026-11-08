# xvm-api contract copy

`openapi.json` is a copy of `contract/openapi.json` from xiv-venue-manager/xvm-api at commit `35afeb8a9dc08c5f07e79c30d5e29d2633ab08dd` (dev).

`lib/api/xvm-api.contract.test.ts` checks `lib/api/xvm-api.ts` against it. To refresh, copy the file from xvm-api's dev branch, update the commit above, run `pnpm --filter web test lib/api/xvm-api.contract`, and fix or record any drift it reports.
