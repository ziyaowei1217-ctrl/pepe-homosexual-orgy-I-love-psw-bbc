# Roommate Matching Admin Guide

This is the beginner-friendly path for adding or editing people in the Tinder-style roommate deck.

## Local setup

Start the full stack:

```bash
docker compose up
```

The matching deck reads from:

```text
GET http://localhost:4000/api/v1/roommates/deck
```

The web app uses that endpoint from:

```text
http://localhost:3000/roommates
```

Developer/admin UI:

```text
http://localhost:3000/admin/roommates
```

## Add a roommate profile

Use an admin JWT and call:

```text
POST /api/v1/admin/roommates
```

Example JSON:

```json
{
  "name": "Taylor Kim",
  "age": 23,
  "role": "UCLA · Grad student · Fall 2026",
  "image": "https://example.com/taylor.jpg",
  "match": 91,
  "budget": "$1,680/月",
  "commute": "Westwood / Sawtelle",
  "tags": ["早睡", "安静", "爱干净"]
}
```

## Edit a roommate profile

Use:

```text
PATCH /api/v1/admin/roommates/:id
```

Example JSON:

```json
{
  "match": 96,
  "tags": ["早睡", "安静", "猫友好"]
}
```

## Archive a roommate profile

Use:

```text
POST /api/v1/admin/roommates/:id/archive
```

Archive sets `status` to `hidden` and stamps `archivedAt`. The profile is removed from active discovery, but historical actions and deal-room records stay intact.

If `:id` is one of the built-in seed profiles, the API materializes that seed into the database first, then applies the edit. That keeps the demo convenient while making future edits persistent.

## Read managed profiles

Use:

```text
GET /api/v1/admin/roommates
```

If the database is empty, this returns the built-in seed profiles so developers always have something visible to work with.

## What fields matter for matching?

- `match`: baseline profile-quality signal; keep this honest and broad rather than using it for every preference.
- `budget`: parsed into a number for budget compatibility.
- `role`: used for school/work-lane matching.
- `commute`: used for city/area signals.
- `tags`: used for lifestyle/hobby overlap plus inferred home-rhythm and reliability signals such as quiet, clean, stable, no smoking, pet-aware, or clear cost-splitting.

The deck enriches each profile with `compatibilityScore`, six visible `dimensions` (`budget`, `lifestyle`, `school`, `area`, `reliability`, `profile`), `matchType`, `recommendation`, `ranking`, `decisionHint`, `rank`, `spark`, `reasons`, `tradeoffs`, `icebreaker`, and `badges`.

`recommendation.action` can be `like`, `later`, or `pass`. `ranking.finalScore` is the final swipe-deck score after compatibility, confidence, profile quality, diversity, and exploration are combined.

For future tuning, edit `api/src/roommates/matching.ts`. Keep the ranking weights there instead of putting scoring rules in React components.

## Current limitation

Do not hard-delete roommate profiles. The model is connected to actions, deal rooms, and deal-room members. Use archive/status behavior instead.
