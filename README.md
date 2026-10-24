<div align="center">

# XIV Venue Manager

**A comprehensive venue management system for Final Fantasy XIV roleplaying venues.**

[![Live](https://img.shields.io/badge/live-xivvenuemanager.com-success)](https://xivvenuemanager.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org)
[![Plugin](https://img.shields.io/badge/Dalamud_Plugin-C%23-239120?logo=csharp)](https://github.com/goatcorp/Dalamud)

</div>

> **For engineers and hiring managers:** see [`CASE_STUDY.md`](./CASE_STUDY.md) for the engineering deep-dive: architecture diagram, tech-stack rationale, three engineering vignettes (cross-platform contract, security audit, real-time choices), and an honest "what I would do differently" section.

## Overview

XIV Venue Manager is a modern, full-featured platform designed specifically for FFXIV roleplaying venue owners and staff. Manage multiple venues, coordinate events, track staff, handle sales, assign tasks, and automate Discord notifications, all from one powerful dashboard.

The platform is two parts: a **web dashboard** (this repo) and a **Dalamud game-client plugin** that captures in-game patron events and shifts in real time, syncing them to the dashboard for analytics and payroll.

### Key Benefits

- **Multi-venue Management**: Unlimited venues from a single account
- **Role-Based Access**: Fine-grained permissions for owners, managers, and staff
- **Discord Integration**: Automated webhooks for events, tasks, sales, and updates
- **Mobile-First Design**: Fully responsive on all devices
- **Real-Time Collaboration**: Invite staff, assign tasks, coordinate in real-time
- **Financial Tracking**: Sales, transactions, and payroll management
- **Event Scheduling**: Recurring events with automatic Discord reminders

---

## Features

### Events Management

- Create and manage venue events with full scheduling
- Recurring events (daily, weekly, custom intervals)
- Automatic Discord announcements and reminders
- Draft mode for planning future events
- Visibility controls (published vs. all events)

### Staff Management

- Role-based access control (Owner, Manager, Staff)
- Staff invitations with custom roles
- Permission management and visibility settings
- Activity tracking and Discord notifications

### Task Management

- Create and assign tasks to staff members
- Task status tracking (Pending, In Progress, Completed)
- Priority levels and due dates
- Configurable visibility settings
- Discord notifications

### Services & Sales

- Define venue services and offerings
- Log sales transactions with customer info
- Track revenue and commission
- Sales analytics and reporting
- Daily sales summaries via Discord

### Payroll System

- Track hours worked by staff
- Calculate and log payroll payments
- Payment history and analytics
- Owner/manager-only access

### Discord Integration

- Separate webhooks for different notification types
- Selective notification toggles per webhook
- Task, event, sales, and staff notifications
- Customizable per venue

---

## Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Next.js API Routes (55 routes), TypeScript with `strict: true`
- **Database**: PostgreSQL 16 (self-hosted via Docker Compose), 19 tables
- **ORM**: Prisma (using `db push` workflow)
- **Authentication**: NextAuth.js (browser, Discord OAuth) + hashed API keys (game-client plugin)
- **Caching + Rate Limiting**: Redis 7 (single instance, ioredis client, namespaced `cache:` and `rl:` keys)
- **Real-time**: Server-Sent Events (SSE) for the live patron feed
- **Game-client integration**: C# Dalamud plugin (~5k LOC), separate repo
- **Hosting**: Self-hosted Linux server, Docker Compose, GitHub Actions for CI

For the why-this-and-not-that on each choice, see [`CASE_STUDY.md`](./CASE_STUDY.md#tech-stack--why).

---

## Quick Start

See [QUICK_START.md](./QUICK_START.md) for detailed setup instructions.

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7
- Discord application (for OAuth)

### Installation

```bash
npm install
cp .env.example .env  # fill in DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, DISCORD_CLIENT_ID/SECRET
npx prisma generate
npx prisma db push
npm run dev
```

For production, the entire stack runs as a Docker Compose project: `docker compose up -d` builds and starts the web app, Postgres, Redis, and Adminer (DB admin UI on port 8080).

---

## User Roles & Permissions

### Owner

- Full access to everything
- Can delete venue
- Can manage all settings and view all financial data

### Manager

- Full access except venue deletion and owner-level settings
- Can manage staff and assign roles
- Can configure visibility settings

### Staff

- Access controlled by venue settings:
  - **Tasks**: See all, assigned only, or assigned + unassigned
  - **Sales**: See all, own only, or no access
  - **Revenue**: See all, own only, or hidden
  - **Events**: See all or published only
- Cannot access Settings or Payroll

---

## Mobile Navigation

- **Dashboard Pages**: Top-right hamburger with user info, venues, feedback
- **Venue Pages**: Bottom-right floating button with comprehensive sidebar:
  - User information and venue switcher
  - All venue sections (Overview, Events, Staff, Tasks, Services, Sales, Payroll, Settings)
  - Feedback and Support buttons
  - Sign out option

---

## Support the Project

XIV Venue Manager is free and open-source. Support development:

- ☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/ehnocure)
- ⭐ Star the repository
- 📢 Share with your venue community
- 🐛 Report bugs and suggest features

Your support helps cover hosting, database costs, and continuous development.
