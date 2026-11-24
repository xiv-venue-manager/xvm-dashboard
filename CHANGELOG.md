# Changelog

All notable changes to the XIV Venue Manager dashboard are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Entries are dated, because the dashboard has no version numbers. Every user-visible change adds one plain-language line under `[Unreleased]`. Refactors, CI and docs-only changes are left out.

## [Unreleased]

## [2026-11-24]

### Added
- Staff and managers can leave a venue themselves from the venue overview, after a confirmation. The last owner cannot leave. (#411)
- An Auto-approve shift claims switch in Settings > Operations. It is off by default, and turning it on also approves the claims already waiting. (#382)
- A "Require the position to claim a shift" switch beside it, so a venue can limit claims to staff who hold the position. (#410)

### Changed
- Past open and unclocked shifts no longer show on the week and calendar views. Completed and active shifts stay as history. (#381)

### Security
- Next.js updated from 16.4.2 to 16.4.5, which fixes seven moderate advisories. (#409)

## [2026-11-17]

### Added
- The landing page describes three parts, the web dashboard, the Dalamud plugin and the XVM Bot, and shows the community Discord server widget. (#399)
- A Verification card in venue settings: the verified role, Captcha, the Lodestone check and Change Nickname, with plain-language warnings when something is half set up. (#372)
- The Rooms board has a status filter and icon actions. (#391)
- Log Sale shows the remaining stock, and managers can pick which event a sale is logged to. (#387, #396)
- Managers can reopen a completed task. (#393)
- Venue gallery images open in a slider. (#388)
- An /admin landing page with a card for each admin tool. Platform admins see a link to it in the user menu. (#397)
- A rebuilt maintenance page in the site's look. It shows whether the website, the plugin and the bot are working, and has an unplanned-maintenance mode with a reason and an expected return time. It reloads itself when the site is back. (#401)

### Changed
- Every new venue goes through the get-started wizard, and `/venues/new` redirects there. The wizard tells you when a venue's location and tags did not save. The sign-in page wording is clearer. (#400)
- Every back link is the same component with the same wording, "Back to ...". (#398)
- The empty week on the Shifts page points you at the event roster. (#383)
- The services catalogue is sorted alphabetically. (#394)
- The Rooms board uses the API's reserved room status. (#390)
- Required fields are marked on the payroll dialogs, and the ban form has its own padded card. (#395, #392)

### Removed
- Internal: the old Discord bots (Aetherlink and a role bot that was never deployed), which xvm-bot replaces. (#385)
- Internal: Prisma, now that every read and write goes through xvm-api. (#327)

[Unreleased]: https://github.com/xiv-venue-manager/xvm-dashboard/compare/main...dev
[2026-11-24]: https://github.com/xiv-venue-manager/xvm-dashboard/compare/933caf0...e0e1332
[2026-11-17]: https://github.com/xiv-venue-manager/xvm-dashboard/compare/6d4a7a5...933caf0
