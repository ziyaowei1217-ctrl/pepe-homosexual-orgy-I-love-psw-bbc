# Mutual Roommate Match DM Design

## Summary

Change the roommate flow so a one-way like does not immediately unlock the deal room. Liking a roommate should record interest and advance to the next recommended roommate. Only a mutual like should create the match moment, add the roommate to the active group context, and move the user into the DM/deal-room experience.

## Confirmed Direction

- Implement the user-facing flow in the frontend first.
- Keep the backend schema unchanged for this pass.
- Shape the frontend state around the future backend contract `{ matched: boolean, dealRoom?: ... }`.
- Treat the existing Deal Room rail and `Groups` section as the current DM surface.
- Keep the existing demo recommendation deck and home recommendation panels.

## Recommended Approach

Add a small pure helper for roommate-like results, then wire the page state through it. The helper should accept the current roommate key, the known incoming-like set, and the current liked/matched sets. It should return whether the action is a one-way like or a mutual match, plus updated sets.

The page can then use one action path for both demo state and future API state:

- If `matched` is false, save the like, show a toast, reset tour state, and advance to the next roommate.
- If `matched` is true, save the like and match, add the roommate to `groupMembers`, reset tour state, show a match toast, and navigate to the Deal Room/DM section.

## Goals

- Like advances to the next roommate when there is no mutual like.
- One-way likes increase the liked count but do not unlock group tour or deal-room actions.
- Mutual likes increase the matched count, add the roommate to the group context, and open the DM/deal-room surface.
- `canRequestTour` is based on mutual matches, not one-way likes.
- Pass and later continue to advance through recommendations unchanged.
- The helper is deterministic and easy to replace with an API response later.

## UX Details

- The roommate workspace summary should show verified profiles, liked count, matched count, and passed count.
- A one-way like toast should communicate that the user liked the roommate and is seeing the next recommendation.
- A mutual like toast should communicate that it is a match and that the DM/deal-room is ready.
- The Deal Room badge should remain pending until a mutual match exists.
- The existing message preview can serve as the DM preview for this pass.

## Future Backend Contract

The frontend should be organized so the eventual authenticated action endpoint can return:

```ts
type RoommateActionResult = {
  action: unknown;
  matched: boolean;
  dealRoom?: unknown;
};
```

This pass does not require Prisma schema changes or a real reverse-like table. The demo can simulate incoming likes with a stable local set of roommate ids.

## Tests

Add focused tests for the pure helper:

- A like from the viewer is recorded and marked as not matched when the roommate has not liked the viewer.
- A like from the viewer becomes matched when the roommate is in the incoming-like set.
- Re-liking an already matched roommate remains idempotent.
- Existing match-demo tests still pass.

## Out Of Scope

- Real reverse-like persistence.
- New Prisma models or migrations.
- WebSocket or realtime match notifications.
- A separate full-screen chat product.
- Backend transaction changes.
- Re-ranking the roommate deck after likes.

## Acceptance Criteria

- Clicking Like on a non-mutual profile moves to the next roommate and does not add that profile to the Deal Room.
- Clicking Like on a mutual profile shows a match state and opens the DM/deal-room surface.
- Group tour remains locked for one-way likes and unlocks for mutual matches.
- The roommate workspace displays both liked and matched counts.
- Relevant unit tests pass.
