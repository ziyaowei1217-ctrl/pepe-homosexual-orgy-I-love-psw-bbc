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

The deck scores people from their own `RoommateMatchingProfile` (city, stay dates, budget, neighborhoods, school, room type, lifestyle, gender preference and dealbreakers), linked to the card through `matchingProfileId`. Users fill it in at `/roommates/me`.

Admin-managed cards have no linked matching profile, so only `age` is scored and every other feature counts as unknown. `budget`, `role`, `commute` and `tags` are not used for matching, and `match` (排序权重 in the admin screen) only orders the plain `GET /roommates` list and the admin list. Cards without an owner are hidden from the deck in production.

There are no strategies, padding or random wildcards: the deck shows only cards that pass the hard filters for both people. Tune weights and copy in `api/src/roommates/matching.ts`, not in React components.

## Current limitation

Do not hard-delete roommate profiles. The model is connected to actions, deal rooms, and deal-room members. Use archive/status behavior instead.
