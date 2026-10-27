# Catppuccin Theme Documentation

The Venue Manager uses the **Catppuccin** color palette - a soothing, muted pastel theme with warm, cozy colors perfect for long sessions managing your FFXIV venue.

---

## Overview

**Theme Applied**: Catppuccin Mocha (Dark) with Catppuccin Latte (Light) variant

**Design Philosophy**:

- Muted, easy-on-the-eyes colors
- Warm undertones for comfortable long-term use
- Consistent pastel palette across all components
- Clean, modern aesthetic

---

## Color Palette

### Catppuccin Mocha (Dark Mode - Default)

**Base Colors**:

- `--ctp-base`: `#1e1e2e` - Main background
- `--ctp-mantle`: `#181825` - Slightly darker for cards
- `--ctp-crust`: `#11111b` - Darkest shade for contrast
- `--ctp-text`: `#cdd6f4` - Primary text (soft blue-white)
- `--ctp-subtext1`: `#bac2de` - Secondary text
- `--ctp-subtext0`: `#a6adc8` - Tertiary text

**Surface Colors** (Overlays & Backgrounds):

- `--ctp-surface0`: `#313244` - Input fields, borders
- `--ctp-surface1`: `#45475a` - Hover states
- `--ctp-surface2`: `#585b70` - Active states
- `--ctp-overlay0`: `#6c7086` - Muted elements
- `--ctp-overlay1`: `#7f849c` - Muted foreground
- `--ctp-overlay2`: `#9399b2` - Subtle text

**Accent Colors**:

- `--ctp-mauve`: `#cba6f7` - Primary accent (soft purple)
- `--ctp-blue`: `#89b4fa` - Links, info
- `--ctp-lavender`: `#b4befe` - Focus rings
- `--ctp-green`: `#a6e3a1` - Success states
- `--ctp-yellow`: `#f9e2af` - Warnings
- `--ctp-red`: `#f38ba8` - Errors, destructive actions
- `--ctp-peach`: `#fab387` - Highlights
- `--ctp-teal`: `#94e2d5` - Accents
- `--ctp-sky`: `#89dceb` - Info
- `--ctp-sapphire`: `#74c7ec` - Links
- `--ctp-pink`: `#f5c2e7` - Decorative
- `--ctp-maroon`: `#eba0ac` - Alerts
- `--ctp-flamingo`: `#f2cdcd` - Subtle accents
- `--ctp-rosewater`: `#f5e0dc` - Subtle highlights

### Catppuccin Latte (Light Mode)

**Base Colors**:

- `--ctp-base`: `#eff1f5` - Main background (soft white)
- `--ctp-mantle`: `#e6e9ef` - Slightly darker
- `--ctp-crust`: `#dce0e8` - Card borders
- `--ctp-text`: `#4c4f69` - Primary text (dark blue-gray)

**Accent Colors**: Darker, more saturated versions of Mocha accents for better contrast on light backgrounds.

---

## Theme Mappings

The Catppuccin colors are mapped to semantic design tokens for easy component theming:

```css
/* Backgrounds */
--background: var(--ctp-base) /* Page background */ --card: var(--ctp-mantle) /* Card backgrounds */
  --popover: var(--ctp-surface0) /* Dropdown/modal backgrounds */ /* Text */ --foreground: var(--ctp-text)
  /* Primary text */ --card-foreground: var(--ctp-text) /* Text on cards */ --muted-foreground: var(--ctp-overlay1)
  /* Subtle/disabled text */ /* Interactive Elements */ --primary: var(--ctp-mauve) /* Primary buttons */
  --primary-foreground: var(--ctp-crust) /* Text on primary buttons */ --secondary: var(--ctp-surface0)
  /* Secondary buttons */ --secondary-foreground: var(--ctp-text) /* Text on secondary buttons */
  --accent: var(--ctp-surface1) /* Hover states */ --accent-foreground: var(--ctp-text) /* Text on accents */
  /* Form Elements */ --input: var(--ctp-surface0) /* Input backgrounds */ --border: var(--ctp-surface0)
  /* Border color */ --ring: var(--ctp-lavender) /* Focus ring color */ /* Destructive Actions */
  --destructive: var(--ctp-red) /* Delete buttons */ --destructive-foreground: var(--ctp-crust)
  /* Text on destructive */ /* Charts & Data Visualization */ --chart-1: var(--ctp-mauve) /* Primary chart color */
  --chart-2: var(--ctp-blue) /* Secondary chart color */ --chart-3: var(--ctp-green) /* Tertiary chart color */
  --chart-4: var(--ctp-yellow) /* Quaternary chart color */ --chart-5: var(--ctp-red) /* Quinary chart color */
  /* Sidebar */ --sidebar: var(--ctp-mantle) /* Sidebar background */ --sidebar-foreground: var(--ctp-text)
  /* Sidebar text */ --sidebar-primary: var(--ctp-mauve) /* Active sidebar item */
  --sidebar-primary-foreground: var(--ctp-crust) /* Active item text */ --sidebar-accent: var(--ctp-surface0)
  /* Hover state */ --sidebar-border: var(--ctp-surface0) /* Sidebar borders */ --sidebar-ring: var(--ctp-lavender)
  /* Focus rings */;
```

---

## Where Theme is Applied

### Automatically Themed Components

All shadcn/ui components automatically inherit the theme:

- Buttons (primary, secondary, destructive, outline, ghost)
- Cards
- Input fields
- Textareas
- Select dropdowns
- Checkboxes
- Radio buttons
- Switches
- Dialogs/Modals
- Dropdowns
- Tooltips
- Tables
- Sidebar navigation
- Charts

### Application Sections

**Dashboard**:

- Venue cards with Mantle background
- Stat cards with Surface colors
- Sidebar with Mauve accents

**Events Page**:

- Event cards with themed borders
- Status badges (Green for published, Yellow for draft, Red for cancelled)
- Calendar components with Catppuccin accents

**Tasks Page**:

- Task lists with muted backgrounds
- Status chips using accent colors
- Priority indicators (Red for high, Yellow for medium, Green for low)

**Sales Tracker**:

- Transaction table with Surface backgrounds
- Chart visualizations using chart color palette
- Revenue stats with Mauve highlights

**Settings Page**:

- Form inputs with Surface0 backgrounds
- Toggle switches with Lavender focus rings

---

## Customization

### Changing the Primary Accent

To change the primary accent from Mauve to another color:

```css
/* In app/globals.css */
:root {
  --primary: var(--ctp-blue); /* Change to any Catppuccin color */
}
```

Options:

- `--ctp-mauve` - Purple (current default)
- `--ctp-blue` - Blue
- `--ctp-lavender` - Light purple
- `--ctp-pink` - Pink
- `--ctp-teal` - Teal
- `--ctp-green` - Green
- `--ctp-peach` - Orange/peach

### Adjusting Border Radius

The theme uses rounded corners throughout:

```css
:root {
  --radius: 0.75rem; /* Default: 12px */
}
```

Options:

- `0rem` - Square corners
- `0.5rem` - Subtle rounded
- `0.75rem` - Current (balanced)
- `1rem` - More rounded
- `1.5rem` - Very rounded

### Light/Dark Mode Toggle

The theme supports both modes via the `.light` class:

**Dark Mode (Default)**:

- Applied automatically
- Catppuccin Mocha palette

**Light Mode**:

- Add `.light` class to `<html>` element
- Catppuccin Latte palette

To implement a theme toggle:

```tsx
// Example theme toggle component
const [isDark, setIsDark] = useState(true)

useEffect(() => {
  if (isDark) {
    document.documentElement.classList.remove("light")
  } else {
    document.documentElement.classList.add("light")
  }
}, [isDark])

return <button onClick={() => setIsDark(!isDark)}>Toggle Theme</button>
```

---

## Design Tokens Reference

### Typography

The app uses Geist Sans and Geist Mono fonts:

```css
--font-sans: var(--font-geist-sans);
--font-mono: var(--font-geist-mono);
```

### Spacing & Layout

Consistent spacing using Tailwind scale:

- Small gaps: `gap-2` (8px), `gap-4` (16px)
- Card padding: `p-6` (24px)
- Section spacing: `space-y-6` (24px vertical)

### Component Sizes

- Input height: `h-10` (40px)
- Button height: `h-10` (40px)
- Icon size: `h-5 w-5` (20px)
- Avatar size: `h-8 w-8` (32px)

---

## Best Practices

### Using Semantic Colors

Always use semantic tokens instead of raw Catppuccin colors:

**Good**:

```tsx
<div className="bg-background text-foreground border border-border">
  <button className="bg-primary text-primary-foreground">Click</button>
</div>
```

**Avoid**:

```tsx
<div style={{ background: '#1e1e2e', color: '#cdd6f4' }}>
  <!-- Hard-coded colors won't adapt to light mode -->
</div>
```

### Status Colors

Use consistent status indicators:

- **Success**: `text-green-400` (--ctp-green)
- **Warning**: `text-yellow-400` (--ctp-yellow)
- **Error**: `text-red-400` (--ctp-red)
- **Info**: `text-blue-400` (--ctp-blue)
- **Neutral**: `text-muted-foreground`

### Interactive States

- **Hover**: `hover:bg-accent hover:text-accent-foreground`
- **Active**: `active:scale-95`
- **Focus**: `focus-visible:ring-2 focus-visible:ring-ring`
- **Disabled**: `disabled:opacity-50 disabled:pointer-events-none`

---

## Accessibility

The Catppuccin theme is designed with accessibility in mind:

**Contrast Ratios**:

- Text on background: 7.5:1 (AAA)
- Buttons: 4.5:1 (AA)
- Borders: 3:1 (minimum)

**Focus Indicators**:

- Lavender focus rings (`--ring`) are clearly visible
- 2px thick for easy visibility
- Applied to all interactive elements

**Color Blindness**:

- Status colors use both color AND icons/text
- Don't rely on color alone to convey meaning

---

## Technical Details

**File Location**: `app/globals.css`

**CSS Custom Properties**: All colors are defined as CSS variables, making them:

- Easy to customize
- Compatible with Tailwind
- Automatically inherited by all components
- Switchable for dark/light modes

**Tailwind Integration**: The `@theme inline` block at the top of `globals.css` exposes Catppuccin colors to Tailwind's utility classes.

**Bundle Size**: No additional CSS libraries - theme uses only CSS custom properties (minimal impact).

---

## Resources

- **Catppuccin Official**: https://catppuccin.com
- **Color Palette**: https://github.com/catppuccin/catppuccin
- **Mocha Palette**: https://github.com/catppuccin/palette/blob/main/mocha.json
- **Latte Palette**: https://github.com/catppuccin/palette/blob/main/latte.json

---

## Preview

Visit http://localhost:3000 to see the theme in action across:

- Dashboard overview
- Event calendar
- Task manager
- Sales tracker
- Settings page
- Sidebar navigation

The muted pastels and warm tones create a comfortable, cohesive experience perfect for managing your FFXIV venue!
