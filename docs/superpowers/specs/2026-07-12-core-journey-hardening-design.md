# Core Journey Hardening Design

## Goal

Make the local website demo behave like one coherent product across navigation and reloads. Every visible primary action must either complete a meaningful workflow or clearly explain why it is unavailable. The work covers saved homes, notifications, listing and roommate messages, tours, applications, Trips, Like Queue, group tours, navigation, and offline API presentation.

## Current Problems Confirmed in the Browser

- `Saved homes`, `Notifications`, and the mobile menu have no meaningful action.
- Desktop navigation hides `Trips`, so users cannot find their tour or application history.
- The listing-detail tour button silently creates the first available slot instead of letting the user choose.
- Listing DMs, tour requests, applications, favorites, and escrow progress live only in component memory and disappear after route changes or reloads.
- Starting an application only navigates to Trips; it does not create an application record.
- Like Queue repeats mutual matches and selected roommates in multiple columns.
- Group Tour silently uses the currently selected listing and first slot.
- Quick-reply chips send immediately, which makes accidental sends too easy.
- When the API is unavailable, raw `Failed to fetch` text leaks into the interface even though most of the product is running as a local demo.

## Chosen Approach

Use a versioned, browser-local workflow store as the source of truth for demo actions while preserving the existing API synchronization path for authenticated users. This is narrower and safer than building a new backend, but it makes the complete local experience durable and testable.

The store will contain only product workflow data:

- favorite listing IDs;
- listing DM threads and contacted listing IDs;
- viewing requests and selected listing context;
- application records;
- escrow progress by application;
- notification events and read state.

Existing roommate match and roommate DM storage will remain in place. New helpers will normalize, validate, hydrate, and serialize the listing workflow data so malformed or older browser state cannot break rendering.

## Navigation and Information Architecture

Desktop navigation will expose `Stay`, `Roommates`, `Messages`, and `Trips`. `Host` remains a separate action. Mobile navigation will contain the same destinations and the menu button will actually expand and collapse the navigation.

`Saved homes` will switch the Stay page into a saved-only view with a clear empty state and a button to return to all stays. It will not silently alter destination or price filters.

`Notifications` will open a compact panel showing recent local workflow events: roommate matches, new DMs, tour requests, application creation, and escrow progress. Opening the panel marks visible events read. If there are no events, it shows an intentional empty state.

## Listing, DM, Tour, and Application Flow

The listing detail page will use the following sequence:

1. `联系房东` opens the listing conversation.
2. `预约看房` opens that same conversation and focuses the tour scheduler; it never books a default time.
3. The user selects a visible slot and presses a confirmation button.
4. The request appears immediately in Messages and Trips, survives navigation and reload, and can be adjusted from Messages.
5. `开始申请` creates an application record for the selected listing and then opens Trips.

Trips will show applications and viewing requests grouped by listing. Escrow controls are tied to an application record rather than a global page counter. A user without an application sees a clear call to action instead of an apparently active escrow simulation.

Quick-reply chips in both landlord and roommate conversations will populate the composer. Sending always requires the explicit send button.

## Roommate Queue and Group Tour Flow

Like Queue columns will be mutually exclusive:

- `Waiting for a like back`: liked by the user but not mutual;
- `Mutual matches`: mutual and not yet selected as a roommate;
- `Roommate group`: explicitly selected roommates.

Counts and empty states will use these exclusive collections. A roommate must never appear in more than one column.

Group Tour will no longer book the hidden current listing and first time slot. It will open the Stay flow in a group-tour selection mode. After the user chooses a listing, the product opens Messages with the group attached and requires an explicit slot selection and confirmation.

## Offline and Authenticated Behavior

The local demo remains usable when the API is unavailable. The auth strip will display `本地 Demo 模式` with a concise explanation instead of raw network errors. Authenticated API requests keep their current behavior: update the local workflow immediately, attempt server synchronization, and show a non-blocking synchronization warning if the server call fails.

Publishing still requires authentication because creating a host listing is an account-owned external action. In offline mode, the Publish page clearly explains that sign-in and the API are required; it does not pretend a listing was published.

## Error Handling and Data Safety

- Every stored payload has a schema version.
- Hydration ignores malformed records and supplies safe defaults for missing fields.
- Empty messages, duplicate requests, and duplicate applications are rejected by pure workflow helpers.
- Route query parameters select existing authorized context; they never create contacts, matches, tours, or applications.
- Buttons that cannot act are disabled with nearby explanatory copy.
- Local actions complete before optional API synchronization, preventing a network failure from erasing demo progress.

## Testing Strategy

Pure workflow helpers will be developed test-first for:

- storage normalization and backward-compatible hydration;
- saved-only listing selection;
- notification ordering and read state;
- tour creation, adjustment, and persistence;
- application creation and per-application escrow progress;
- exclusive Like Queue classification;
- group-tour navigation context;
- quick replies populating rather than sending.

After unit and integration checks pass, browser verification will cover desktop and mobile widths. The browser pass will exercise each primary navigation item, filters, saved homes, notifications, listing detail, landlord DM, roommate DM, Like/Later, Like Queue, tour scheduling, application creation, Trips, refresh persistence, offline API messaging, mobile navigation, and console errors.

## Scope Boundaries

This work does not add payments, real email delivery, real-time messaging, a production notification service, or a replacement backend. It does not make unauthenticated publishing succeed. Trust/Admin preview actions remain demo actions with explicit feedback because they are outside the renter journey being hardened.

## Success Criteria

- No primary renter-facing button is inert.
- Tours, applications, favorites, and listing conversations remain consistent across routes and reloads.
- Booking always requires an explicit listing, slot, and confirmation.
- Like Queue contains no duplicate people across columns.
- Trips is discoverable and accurately reflects local workflow state.
- Offline API state is presented as an intentional demo mode.
- The full automated check passes and the browser checklist passes at desktop and mobile widths without new console errors.
