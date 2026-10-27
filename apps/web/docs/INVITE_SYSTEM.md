# Staff Invite System

## Overview

The venue manager now uses a **Discord-only authentication** system with **unique invite links** for staff members. Email addresses are no longer required or displayed anywhere in the app.

---

## How It Works

### For Managers/Owners

1. **Go to Staff Page**: Navigate to `/dashboard/{slug}/staff`
2. **Click "Invite Staff"** button
3. **Fill in details** (all optional):
   - Name (for your reference)
   - Email (display only, not used for auth)
   - Role (STAFF or MANAGER)
4. **Generate Link**: System creates a unique invite link
5. **Share Link**: Copy and send to the person you want to invite

### For New Staff Members

1. **Click Invite Link**: Receive link from venue manager
2. **View Invite Details**: See venue name, role, who invited them
3. **Sign in with Discord**: Click "Sign in with Discord" button
4. **Auto-Accept**: After Discord auth, automatically joins the venue
5. **Redirect to Dashboard**: Taken to venue dashboard

---

## Technical Details

### Database Schema Changes

Added to `Membership` model:

- `userId`: Now nullable (until invite is accepted)
- `status`: `"pending"` | `"active"` | `"inactive"`
- `inviteToken`: Unique token for the invite link
- `inviteExpiresAt`: Expiration date (7 days from creation)
- `invitedBy`: User ID who created the invite
- `invitedName`: Optional name for display
- `invitedEmail`: Optional email for display (NOT used for auth)

### API Endpoints

**POST `/api/venues/[slug]/staff/invite`**

- Creates pending membership with unique token
- Returns invite URL
- Requires OWNER or MANAGER permission

**GET `/api/invites/[token]`**

- Fetches invite details for display
- Checks if valid and not expired
- Public endpoint (no auth required)

**POST `/api/invites/[token]/accept`**

- Links Discord account to pending membership
- Updates status to "active"
- Requires user to be signed in

### Pages

**`/dashboard/[slug]/staff`**

- Shows active staff members
- Shows pending invites
- Generate new invite links
- **No email displays**

**`/invite/[token]`**

- Public invite acceptance page
- Shows invite details
- Discord sign-in button
- Auto-accepts after auth

---

## Security Features

### Token Security

- Uses `nanoid(32)` for cryptographically strong tokens
- URL-safe characters only
- Unique constraint in database

### Expiration

- Invites expire after 7 days
- Cannot be accepted after expiration
- Expired invites shown as error

### Validation

- Token must be valid and not expired
- User cannot already be a member
- Invite can only be used once
- Token cleared after acceptance

---

## Email Removal

All email references removed from:

- `components/user-menu.tsx` - User dropdown menu
- `app/dashboard/page.tsx` - Welcome message
- `app/dashboard/[slug]/staff/page.tsx` - Staff list
- `app/dashboard/[slug]/staff/[membershipId]/page.tsx` - Staff details

Email field in User model is now:

- Optional (`email?`)
- Not displayed anywhere in UI
- Not used for authentication
- Only used by NextAuth internally (Discord provides it)

---

## User Flow Example

### Scenario: Adding a New Bartender

1. **Venue Owner** (Alice):

   ```
   - Goes to /dashboard/moonshadow-lounge/staff
   - Clicks "Invite Staff"
   - Enters: Name: "Bob", Role: "STAFF"
   - Gets link: https://yoursite.com/invite/abc123xyz...
   - Sends link to Bob via Discord DM
   ```

2. **New Staff Member** (Bob):

   ```
   - Clicks invite link
   - Sees: "Alice has invited you to join Moonshadow Lounge as staff"
   - Clicks "Sign in with Discord"
   - Authenticates with Discord
   - Automatically accepted
   - Redirected to /dashboard/moonshadow-lounge
   ```

3. **Result**:
   ```
   - Bob now appears in "Active Staff" list
   - Invite token removed (can't be reused)
   ```

---

## Pending Invites

Invites show as "pending" until accepted:

- **Display**: Yellow badge, clock icon
- **Info Shown**: Name, email (if provided), expiration date
- **Status**: "Pending" badge
- **Location**: Top of staff page in separate section

---

## Migration Steps

### 1. Push Database Schema

```bash
cd "F:\Claude\Project Ideas\venue-manager-web"
npx prisma db push --accept-data-loss
```

This will:

- Make `userId` nullable in memberships
- Add invite token fields
- Add unique constraint on inviteToken
- Change default status to "pending"

**Note**: Existing memberships will keep status="active" since they already have users.

### 2. Install Dependencies

Already installed:

- `nanoid` - For generating secure tokens

### 3. Test the Flow

1. Start dev server: `npm run dev`
2. Go to a venue's staff page
3. Click "Invite Staff"
4. Generate an invite link
5. Open invite link in incognito window
6. Sign in with Discord
7. Verify redirect to dashboard

---

## Configuration

### Discord OAuth

Ensure Discord OAuth callback URLs include:

```
http://localhost:3000/api/auth/callback/discord
https://your-domain.com/api/auth/callback/discord
```

### Environment Variables

Required:

```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
NEXTAUTH_SECRET=random_secret_here
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=your_database_url
```

---

## Features

### ✅ Implemented

- Discord-only authentication
- Unique invite link generation
- Invite expiration (7 days)
- Pending invite tracking
- Auto-accept on Discord auth
- Email completely removed from UI
- Secure token generation
- One-time use invites

### 🚫 Not Implemented

- Invite revocation (can add later)
- Custom expiration times (fixed at 7 days)
- Bulk invites
- Invite templates
- Email invitations (intentionally removed)

---

## Troubleshooting

### "Invalid or expired invite"

- Invite may have expired (>7 days old)
- Token may have been used already
- Double-check the full URL was copied

### "You are already a member"

- User's Discord account already linked to venue
- They need to leave first before accepting new invite

### "Database connection error"

- Run `npx prisma db push --accept-data-loss` first
- Check DATABASE_URL is correct
- Verify Supabase project is not paused

### Invite not showing in pending list

- Refresh the page
- Check invite was created successfully
- Look in database: `SELECT * FROM memberships WHERE status='pending'`

---

## Best Practices

1. **Always provide a name** when creating invites (helps track who's who)
2. **Send invites via Discord DM** for security
3. **Check pending invites regularly** to see who hasn't joined yet
4. **Don't reuse old invite links** (they're one-time use)
5. **Check the staff list** to see when staff join

---

## Future Enhancements

Potential improvements:

- Bulk invite generation
- Invite revocation
- Custom expiration times
- Invite analytics (who accepted, when)
- Re-send invite functionality
- Invite templates for different roles

---

Great work! Your venue manager now has a modern, secure, Discord-only authentication system! 🎉
