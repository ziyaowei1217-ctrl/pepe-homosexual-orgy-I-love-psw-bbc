# psw design system in this codebase

The site follows the **psw 设计系统** (the psw Design System artifact). This folder is the bridge.

- `tokens.json` is copied verbatim from the design system's `project/tokens.json`. Don't edit it here; when the design
  system changes, copy the new file over and rebuild.
- `theme.ts` turns those tokens into Tailwind colours, radii and shadows. `tailwind.config.ts` imports it.

## Rules the code follows (from the design system)

- **Semantic colours only** on screens, named as in the design system: `bg-background` (bg 薰衣草白), `bg-surface`,
  `text-ink`, `text-ink-secondary`, `text-ink-placeholder`, `text-primary-text` (prices and links), `bg-primary`,
  `bg-primary-soft` (secondary buttons), `border-outline` (unselected chips), `border-control-border` (inputs),
  `bg-tag-neutral` (status and amenity tags), `bg-ink-block` + `text-accent` (the decision block), `bg-badge`
  (unread counts). The raw scales (`purple-500`, `lime-200` …) are only for illustrations and covers.
- **青柠 `accent` only on `ink-block` or `primary`.** In the product it marks the money you will pay and the
  「申请租住」 button in the decision block (desktop booking box bottom, phone bottom bar). Promotional heroes may use it.
- **Shapes:** `rounded-full` means tappable (buttons, chips, search), `rounded-psw-sm` means a label, cards
  `rounded-psw-xl`, inputs `rounded-psw-md`. Outlines only on things you can tap.
- **Type:** titles and buttons use 资源圆体 Bold (`font-rounded`, set on h1–h4 globally); Heavy (`font-slogan`) only for
  the home slogan; prices and dates use Nunito (`font-display` / `font-num`); body text and trust details stay on the
  system sans. Sizes come from the design system's scale as Tailwind classes: `text-m-*` on phones, `text-d-*` on
  desktop (`text-m-subhead sm:text-d-subhead`). Nothing below 13px except the tab bar (11). Inputs are 16px on phones so
  iPhone does not zoom.
- **Page frame:** `page-container` (content 1200 wide, 16 / 32 margins) and `PageHeader` for every page title
  (`page-title`, 34 / 40). No English eyebrows.
- **Cards:** one `ListingCard` for home, search and saved. Cards lie flat; desktop hover lifts 4px with
  `shadow-card-hover`. Booking box and map pins use `shadow-menu`.
- **窝窝:** `Wowo` / `EmptyState` for empty lists (`sleepy`), no results (`curious`) and errors (`sorry`, with a retry).
  One per screen.
- **夜墨:** the home hero and the booking decision block (desktop box, phone bar). Other panels stay light.
- **Dates:** `lib/date-format.ts`. Long「11月1日 – 1月15日」where people choose or confirm, short「11/1 – 1/15」on
  cards; the year only when it is not this year.
- **States:** hover one shade darker, press scales to 97%, focus is the design system's `shadow-focus`: a 2px white
  gap inside a 3px 夜墨 ring, visible on light pages and on 夜墨 blocks. Small controls use `tap-target` to reach 44px.

## Price display

With dates chosen, the headline is the rent for exactly those dates (`lib/stay-price.ts`): whole months from the
move-in date at the monthly rent, remaining days prorated by the actual length of that month. Without dates the monthly
rent is the headline. Cards, map pins, the booking box and the phone bottom bar show the same number.
The page never picks dates for the renter: a listing opened without dates shows the monthly rent and asks for dates.
The 青柠 number in the decision block is only ever a total. The application page shows the same total and dates, and
dates the listing cannot be rented for send the renter back to the listing.

## Who is who

- **转租人:** the person posting the room (usually a student subletting). Buttons say「联系转租人」; their area is
  「我发布的房间」.
- **房东:** only the actual landlord, as in「房东知情」.

## Trust

Show only what the platform knows (`lib/listing-trust.ts`, `TrustBadge`):

- 「平台已审核」/「待平台审核」: the platform reviewed the listing's details. Public catalog listings are reviewed, so
  cards do not carry the badge; the listing page does.
- 「房东知情：转租人声明」: a declaration made when publishing. The platform does not check leases, so no copy may say
  a lease or consent letter was verified; the listing page tells renters to ask for the lease before signing.

## Dead ends

Missing pages, removed listings and load errors use `DeadEnd` inside the site shell: 窝窝 sorry, one sentence on what
happened, one way forward and「回首页」. A removed listing also shows listings that can still be rented.
