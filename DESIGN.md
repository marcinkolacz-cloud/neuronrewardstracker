# Design Brief

## Direction

Ledger Aurora — dark editorial ICP staking tracker lit by aurora-cyan and warm amber reward light.

## Tone

Refined dark editorial: deep ink-charcoal canvas, restrained chroma, mono numerics for ledger precision — finance that feels calm, not corporate.

## Differentiation

Aurora-cyan primary against ink-charcoal with amber reserved exclusively for reward/growth deltas — every positive number glows warm, every figure is monospaced.

## Color Palette

| Token      | OKLCH (dark)       | Role                                  |
| ---------- | ------------------ | ------------------------------------- |
| background | 0.145 0.014 260    | deep ink-charcoal canvas              |
| foreground | 0.95 0.005 260     | primary text                          |
| card       | 0.19 0.016 260     | elevated surfaces, neuron cards       |
| primary    | 0.78 0.16 195      | aurora-cyan — CTAs, active, links     |
| accent     | 0.78 0.15 75       | amber — reward/growth deltas only     |
| muted      | 0.24 0.018 260     | secondary surfaces, code blocks       |
| destructive| 0.65 0.21 25       | errors, negative deltas               |
| border     | 0.3 0.02 260       | hairline dividers                      |
| success    | 0.72 0.15 150      | APY/growth indicators, live price      |
| warning    | 0.78 0.13 75       | price staleness, muted amber alerts    |
| pill-bg    | 0.24 0.018 260     | USD/PLN value-pill background (dark)   |
| pill-fg    | 0.88 0.008 260     | USD/PLN value-pill foreground (dark)   |
| chart-1    | 0.78 0.16 195      | aurora-cyan — primary series, bars     |
| chart-2    | 0.78 0.15 75       | amber — reward series                 |
| chart-3    | 0.66 0.1 220       | muted blue — secondary series         |
| chart-4    | 0.72 0.12 150      | muted green — stake series             |
| chart-5    | 0.58 0.08 260      | muted slate — baseline                 |

## Typography

- Display: Space Grotesk — headings, portfolio totals, brand
- Body: DM Sans — UI text, descriptions, labels
- Mono: Geist Mono — ICP figures, neuron IDs, timestamps, all numeric data
- Scale: hero `text-4xl font-display`, h2 `text-2xl font-display`, label `text-xs font-mono uppercase tracking-wider`, body `text-sm font-body`

## Elevation & Depth

Two-tier shadow hierarchy: `shadow-subtle` for resting cards, `shadow-elevated` for popovers/modals. Surfaces step from ink (0.145) → card (0.19) → popover (0.22).

## Structural Zones

| Zone    | Background          | Border         | Notes                                  |
| ------- | ------------------- | -------------- | -------------------------------------- |
| Header  | bg-card             | border-b       | sticky, brand left, actions right      |
| Sidebar | bg-sidebar          | border-r       | nav items, active = primary tint        |
| Content | bg-background       | —              | alternating bg-muted/30 sections       |
| Cards   | bg-card             | border         | neuron cards, summary panel            |
| Stat    | bg-card + gradient  | border         | APY/maturity/earned stat-card, shadow-elevated |
| Pills   | bg-pill-background  | —              | value-pill — USD/PLN fiat, mono numerics |
| Badges  | success/warning tint| —              | price-badge live, price-stale muted    |
| Footer  | bg-muted/40         | border-t       | minimal, mono captions                 |

## Spacing & Rhythm

Section gaps `gap-8 py-10`, card padding `p-6`, micro-spacing `gap-2`. Tight mono numerics, generous editorial breathing room around display headings.

## Component Patterns

- Buttons: primary `bg-primary text-primary-foreground rounded-md`, hover brightens L+0.04; ghost for secondary
- Cards: `rounded-xl bg-card border border-border shadow-subtle`, hover lifts to `shadow-elevated`
- Badges: `rounded-full` — cyan for synced, amber for rewards, slate for pending
- Figures: always `font-mono`, tabular-nums, amber for positive deltas
- APY stat card: `.stat-card` — large mono % in success green, muted trailing-period label below
- Monthly bar chart: recharts BarChart, bars filled chart-1 (cyan), mono axis labels, 12-month range
- Live price display: `.price-badge` (success tint) next to withdrawable maturity; `.price-stale` (warning tint) when cache stale
- USD/PLN pills: `.value-pill` — muted bg, mono tabular-nums, appended to reward entries and portfolio totals

## Motion

- Entrance: fade-up 0.3s staggered, `--transition-smooth` easing
- Hover: card lift via shadow swap, 200ms
- Chart: line draw animation on mount, 800ms ease-out
- Decorative: none — restraint over animation

## Constraints

- Amber (accent) reserved exclusively for reward/growth deltas — never decorative
- All numeric data in Geist Mono with tabular-nums
- No purple gradients, no default blue, no neon glow shadows
- Dark mode primary; light mode is a tuned fallback, not the focus

## Signature Detail

Every ICP reward figure renders in amber Geist Mono against the ink canvas — the ledger glows where it grows, making positive deltas the visual heartbeat of the interface.
