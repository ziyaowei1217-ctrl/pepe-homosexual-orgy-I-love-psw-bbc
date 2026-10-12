---
version: alpha
name: Sublet Pipeline
description: Existing rental marketplace identity, preserved for account security workflows
colors:
  primary: '#2453ff'
  navy: '#071b35'
  surface: '#ffffff'
  bodyText: '#0f172a'
  secondaryText: '#475569'
  danger: '#b91c1c'
typography:
  sans:
    fontFamily: 'Inter, Geist, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, Noto Sans CJK SC, sans-serif'
  mono:
    fontFamily: 'ui-monospace, monospace'
rounded:
  control: '16px'
  panel: '28px'
  action: '9999px'
spacing:
  account-max: '1280px'
  phone-gutter: '16px'
  desktop-gutter: '32px'
components:
  action:
    minHeight: '44px'
  panel:
    padding: '24px'
  field:
    borderRadius: '16px'
---

# Sublet Pipeline Design System

## Overview

### Creative North Star

Preserve the current marketplace's rental itinerary feel: spacious listing photography, navy account summaries, blue actions and rounded white task panels. Account security remains a familiar utility within that product.

### Product context and register

The existing routes support renters finding listings, submitting applications and coordinating stays, and hosts managing listings. Seeded listings cover US cities; the interface is primarily Simplified Chinese with a small number of existing English navigation captions. Do not infer a different target market from language alone. Phone and desktop workflows are supported.

Account, payment and administration screens use a product register. Security instructions use direct Chinese and describe the next action. Avoid decorative security scores, badges that imply certification, marketing claims, or a new visual identity.

Runtime owners are `app/globals.css`, `tailwind.config.ts`, shared UI components and `components/marketplace`. This document mirrors their established patterns; it does not generate tokens. Existing older editorial admin surfaces keep their shared Button styles. The 2026-10 audit introduced darker secondary text where axe measured insufficient contrast; future audit evidence should decide further changes.

## Colors

White task surfaces use slate body text and #475569 secondary text. Blue #2453ff identifies primary actions; navy #071b35 supports account summaries. Red #b91c1c errors and amber notices always include words. No new dark theme is introduced. Focus styles come from the existing application stylesheet and field components.

## Typography

Use the existing Inter/Geist system fallback stack, including Noto Sans CJK SC. Headings are bold; instructions are normal text with generous line height. Recovery codes use monospace and wrap instead of overflowing. Retain actual visible button text in accessible names.

## Layout

Account pages cap at 1280px with 16px phone gutters and 32px desktop gutters. Account navigation becomes a four-column row on small screens. MFA forms stack vertically and action rows wrap. Do not let secrets, email addresses or recovery codes create horizontal overflow.

## Elevation & Depth

White panels have subtle existing shadows and borders. Inline enrollment and disable confirmation stay in the account panel. Avoid adding nested floating cards or new overlay layers for this flow.

## Shapes

Use 28px account panel corners, 16px field corners and pill actions. Keep input labels outside the field and visible. Existing admin components retain their own established shared component geometry.

## Components

### Foundational visual states

Loading and busy states show text, keep controls stable and prevent duplicate submissions. Errors are announced with role alert; status updates use role status. Read-only enrollment secrets are masked by default. Disabled controls retain their reason in adjacent explanatory content.

### Buttons and actions

Primary actions advance the current form. Secondary actions cancel or change verification method. Destructive MFA disable requires a separate confirmation form and an independent factor; do not present it as the default action.

### Navigation and data display

The account verification route owns MFA enrollment and status. High-risk action errors link back to it. Recovery-code acknowledgement precedes dismissal; there is no recovery-code history page.

### Forms and overlays

Use visible field labels, password-style proof fields, paste support and one-time-code autocomplete for TOTP. Errors retain entered proof for retry. Show setup instructions before requesting the code. Recovery codes are one-time memory-only disclosure, never form autosave.

### Iconography

Use the existing Lucide family. Decorative icons are hidden from assistive technology when adjacent text conveys meaning. No new icons are needed for MFA proof fields.

### Motion

No decorative motion is added. Existing focus, reduced-motion and modal behavior remain. Focus moves to the recovery-code heading when the disclosure appears.

### Content and data visualization

Name TOTP as 验证器验证码 and distinguish it from the ordinary 邮箱验证码. Explain recovery codes are single-use. State the server's ten-minute recent-verification window without promising security certification. No charts are required.

## Do's and Don'ts

- Do preserve the current marketplace and account geometry.
- Do test visible labels, keyboard operation and contrast at phone and desktop widths.
- Do keep secret material in transient component state only.
- Don't replace independent second-factor verification with email verification copy.
- Don't interpret an automated axe pass as full WCAG certification.
