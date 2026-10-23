# Daftar — design brief

> دفتر (*daftar*) = notebook, logbook. The app is the coach's training logbook made digital:
> the clipboard card a coach hands a client, the whiteboard timetable on the gym wall,
> the plates on the bar. Every visual decision below comes from that room, not from a SaaS template.

This file is the source of truth for look, feel and copy. `design-system/` holds the raw
UI UX Pro Max output we started from; where they disagree, **this file wins**.

## Why we overrode the generated design system

Second correction (monitor review): the first draft used warm cream paper + full-width hairlines +
numbered "01 —" labels, which is itself a recognisable AI-default look. Light theme is now cool
chalk-on-steel, numbering is reserved for real sequences, and the identity is carried by the gym
objects (plates, bar, tally, timetable, stamp), not by "editorial" styling.


`ui-ux-pro-max --design-system` returned "Vibrant & Block-based, orange #F97316 + green on slate-800,
Inter + Playfair, Feature-Rich Showcase landing (hero + 4–6 feature cards + logos)". That is the
default look of every AI-generated fitness site. We kept its hard rules (contrast ≥ 4.5:1, 44px
targets, no emoji icons, reduced-motion, responsive 375/768/1024/1440, visible focus) and threw
away its aesthetic.

## Concept: "Chalk & Ledger"

| Real object | Becomes in the UI |
|---|---|
| Chalk-dusted steel and the paper card on the clipboard | Cool chalk-grey surface, ink text, ruled table rows inside cards only |
| Gym rubber floor at night | Dark mode: near-black warm floor, chalk-white text |
| Olympic calibrated plates (IWF colours) | The **only** colour system. Red 25 kg, blue 20, yellow 15, green 10, white 5 |
| Whiteboard timetable | Booking grid; open slots are marker-hatched outlines |
| Tally marks on the card | Completed sets drawn as tally strokes |
| A coach's rubber stamp | Status badges ("CONFIRMED", "تأیید شد") as bordered stamp labels |

## Colour tokens

Semantic tokens only in components. Never raw hex in a component file.

### Light — "chalk on steel" (cool neutrals, deliberately not cream)
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#EBECE8` | page background (chalk-dusted steel) |
| `--paper-2` | `#DFE1DC` | alternate rows, inset panels, hover |
| `--card` | `#F8F8F6` | the "training card" surface |
| `--ink` | `#141614` | primary text, strong rules, primary button in neutral contexts |
| `--ink-2` | `#444843` | secondary text (≈ 8:1 on paper) |
| `--ink-3` | `#5F655E` | captions, meta (≈ 5:1 on paper) — never for body copy |
| `--rule` | `rgb(20 22 20 / 0.16)` | hairlines |
| `--rule-strong` | `#141614` | table headers, card edges |
| `--plate-red` | `#C0211A` | primary action, PRs, destructive is NOT red (see below) |
| `--plate-blue` | `#1D4C9F` | confirmed booking, info, links |
| `--plate-yellow` | `#E3AE12` | pending (always with ink text on it) |
| `--plate-green` | `#2B7A42` | completed, success |
| `--plate-white` | `#FBFBF8` | 5 kg plate, with 1px ink border |
| `--danger` | `#8E1B12` | destructive actions (darker oxblood, distinct from plate-red) |

### Dark — "rubber floor"
| Token | Hex |
|---|---|
| `--paper` | `#111311` |
| `--paper-2` | `#191C19` |
| `--card` | `#1D201D` |
| `--ink` | `#E8EAE5` |
| `--ink-2` | `#AEB3AB` |
| `--ink-3` | `#8C9289` |
| `--rule` | `rgb(232 234 229 / 0.15)` |
| `--rule-strong` | `#E8EAE5` |
| `--plate-red` | `#E2463B` |
| `--plate-blue` | `#6A95E6` |
| `--plate-yellow` | `#F0C232` |
| `--plate-green` | `#4FAE6A` |
| `--plate-white` | `#E8EAE5` |
| `--danger` | `#F07466` |

Text on `--plate-red`/`--plate-blue`/`--plate-green` (light mode) is `#FFFFFF`; text on
`--plate-yellow` is `--ink` (light) / `#111311` (dark). In dark mode, text on plate fills is `#111311`.
Theme follows `prefers-color-scheme`, overridable by a toggle stored in a cookie (`theme=light|dark`).

**Banned:** gradients, glassmorphism, blurred blobs, neon glows, purple, drop shadows on cards
(the only shadow allowed is the focus ring), `rounded-2xl` everything.

## Shape, space, lines

- Radius: `--r: 2px` on inputs/buttons/cards. `999px` only for avatars and the barbell plates.
- Borders do the work shadows usually do: 1px `--rule` hairlines, 1.5px `--rule-strong` for card edges and table heads.
- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 72. Density: comfortable on mobile, tighter tables on coach desktop.
- Grid: 4 cols mobile / 8 tablet / 12 desktop; 16px gutter mobile, 24px desktop; max content width 1200px.
- Section labels: a short hairline with a small uppercase (en) / bold (fa) label sitting on it: `THIS WEEK` / `این هفته`.
  **No decorative numbering** (no "01 / 02 / 03"): numbers appear only where order is real information —
  set 1/2/3, program day A/B/C, booking queue position.
- Rules live **inside** cards and tables (rows of a training card, the timetable grid). Page sections are
  separated by space, not by full-width hairlines: we are not a newspaper.

## Typography

| Role | Latin (en) | Persian (fa) |
|---|---|---|
| UI + body | **Archivo** variable, wdth 100, 400/500 | **Vazirmatn** variable, 400/500 |
| Headings | Archivo wdth **112** (expanded), 800, tracking −0.01em | Vazirmatn 800 |
| Numbers (weights, reps, times, dates) | Archivo wdth **75** (condensed), 600–800, `tabular-nums` | Vazirmatn 700, Persian digits |
| Stamp/labels | Archivo wdth 100, 700, uppercase, tracking 0.08em, 12px | Vazirmatn 700, 12–13px (no uppercase in Persian) |

- Self-hosted via `@fontsource-variable/archivo` and `@fontsource-variable/vazirmatn` (no Google CDN: it is unreliable from Iran).
- Font stack per locale: en → `Archivo, Vazirmatn, system-ui`; fa → `Vazirmatn, Archivo, system-ui` (so mixed names render).
- Body 16px / 1.55 (fa 1.75: Persian needs taller line-height). Never below 12px.
- The big numbers are the hero of the product: the weight in the set logger is 56–72px condensed.

## Persian / RTL rules (non-negotiable)

1. `<html lang="fa" dir="rtl">` for fa, `lang="en" dir="ltr"` for en. Layout uses **logical** utilities only:
   `ms-/me-/ps-/pe-/start-/end-/text-start/border-s`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left`.
2. Directional icons (chevrons, arrows, "back") flip in RTL (`rtl:-scale-x-100`). Non-directional icons (plus, check, clock) do not.
3. Digits: all numbers rendered through the `formatNumber`/`formatDate` helpers. fa shows Persian digits `۰۱۲۳۴۵۶۷۸۹` and Persian decimal separator `٫`.
4. **Input**: every numeric/phone input accepts Persian `۰-۹`, Arabic-Indic `٠-٩` and Latin digits, and `٫`, `,`, `.` as decimal separator. Normalise before validation. A Persian keyboard user typing `۳۰` must get 30 kg.
5. Calendar: fa uses the **Jalali** calendar, weeks start **Saturday**, Friday is visually marked as the weekend. en uses Gregorian, weeks start Monday.
6. Week grids and charts mirror in RTL: Saturday is the rightmost column; time on chart x-axes flows right → left.
7. Persian copy uses the zero-width non-joiner correctly: `می‌توانید`, `رزروها`, `تمرین‌ها`, `برنامه‌ی`. No Arabic `ي`/`ك` — always Persian `ی`/`ک`.
8. Mixed-direction strings (an English exercise name inside Persian text, a phone number) are wrapped in `<bdi>`; phone numbers are always `dir="ltr"`.
9. Set notation: en `3 × 8 @ 30 kg`; fa `۳ × ۸ — ۳۰ کیلو` (the `×` keeps sets first in both).

## Signature components

These five are what make it not look generated. Build them with care.

1. **Training card** (`TrainingCard`) — `--card` surface, 1.5px ink edge, header strip:
   client name · program day · Jalali/Gregorian date. Body is a ruled table: exercise, target
   (`3 × 8 @ 30`), then one cell per set. Done sets show the logged reps/weight and a tally stroke.
2. **Set logger** (`SetLogger`) — the screen a client uses between sets with sweaty hands.
   Two giant steppers (weight, reps), 56px+ hit targets, `inputMode="decimal"`, ± buttons
   (weight step 2.5 kg, reps step 1), "same as last set" one-tap, "Log set" full-width plate-red button.
   For barbell exercises a **barbell diagram** (SVG) shows plates per side for the entered weight
   (20 kg bar, plates 25/20/15/10/5/2.5/1.25 in IWF colours, proportional heights).
3. **Timetable** (`Timetable`) — whiteboard grid. Columns = days (RTL-aware), rows = hours. Open
   slot = outlined block with 45° marker hatching (`repeating-linear-gradient` on `--rule`), booked by
   someone else = solid `--paper-2` (no name — privacy), yours = plate-blue fill (confirmed) or
   plate-yellow (pending). On mobile it collapses to a horizontal day strip + vertical slot list.
4. **Stamp** (`Stamp`) — status label with 1.5px border in the status colour, uppercase (en) /
   bold (fa), 2px radius. On the booking-confirmation screen only, it "lands": scale 1.12 → 1 and
   rotate −3°, 180ms. Everywhere else it is static and unrotated.
5. **Tally** (`Tally`) — completed sets as hand-drawn-feeling strokes; the 5th crosses the four.
   New stroke draws via `stroke-dashoffset`, 220ms.

## Motion

- Default transition 150ms `cubic-bezier(.2,.8,.2,1)` on colour/opacity/transform only.
- Meaningful motion only: tally stroke drawing, stamp landing, slot selection, sheet sliding up.
- No scroll-triggered reveals, no parallax, no staggered card entrances. No GSAP.
- `prefers-reduced-motion: reduce` → all of the above become instant.

## Layout of key screens

- **Landing (public)**: no hero image, no feature-card grid, no logo wall. Top: coach name set huge
  (expanded/800), one sentence in the coach's voice, and the **live** mini-timetable for this week
  with real open-slot count + "Book a session". Then a ruled, numbered list "How it works" (3 lines,
  not cards). Then a real `TrainingCard` rendered with sample data. Then location + hours as a
  ledger table. Footer with language switch.
- **Client app**: mobile-first, bottom tab bar (≤ 5: Today, Book, Program, Progress, Me). Desktop: same
  routes, left/start-side rail.
- **Coach / admin**: desktop-first, start-side rail navigation, dense tables, a "Today" agenda in
  the dashboard. Still fully usable at 375px.

## Copy voice

Direct, warm, coach-to-client, short. Imperatives. Concrete numbers.
- Yes: "Pick a slot. I'll confirm within a few hours." / «یک ساعت را انتخاب کن؛ تا چند ساعت دیگر تأیید می‌کنم.»
- Yes: "3 sets left." / «۳ ست مانده.»
- Banned words/phrases: unlock, unleash, elevate, journey, transform your, seamless, empower,
  revolutionize, "your fitness, reimagined", "take it to the next level", any emoji.
- Persian register: informal-respectful «تو» is fine for the client app (the coach's voice); the coach panel uses neutral labels.
- Persian gym vocabulary: client = **شاگرد**, coach = **مربی**, session = **جلسه**, set = **ست**,
  rep = **تکرار**, weight = **وزنه**, program = **برنامه‌ی تمرینی**, warm-up = **گرم‌کردن**, rest = **استراحت**,
  personal record = **رکورد**.

## Accessibility checklist (pre-delivery)

- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI boundaries, in **both** themes.
- Every interactive target ≥ 44×44px (set-logger steppers ≥ 56px).
- Visible focus: 2px `--ink` outline + 2px offset in `--paper`.
- Labels on every input (no placeholder-only), errors next to the field and announced (`aria-live`).
- Status never by colour alone: stamps carry words, timetable cells carry text/`aria-label`.
- Keyboard: timetable navigable by arrow keys (mirrored in RTL) or at least tab order + Enter.
- Icons from `lucide-react`; decorative icons `aria-hidden`.
