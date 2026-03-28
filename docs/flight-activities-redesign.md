# Flight Activities Redesign

## Direction

VoltApp should ship exactly two first-class flight activities:

- `builtin:sky-raid`: combat-focused aerial dogfighting
- `builtin:sky-derby-3d`: race-focused checkpoint flying

All other existing flight-themed ids should become legacy aliases that normalize into one of those two activities instead of remaining separate products.

## Goals

- Make the combat and race experiences feel intentionally different instead of being preset swaps in one crowded registry.
- Raise quality through better handling, stronger visual readability, clearer objectives, and cleaner onboarding.
- Keep the shared multiplayer/event protocol stable while refactoring internals.
- Reduce maintenance by consolidating tuning, UI, and world-generation logic around two supported modes.

## Product Split

### Sky Raid

Primary fantasy:
- fast arcade dogfighting
- readable targets and pickups
- satisfying projectile travel and impact feedback

Quality targets:
- distinct craft roles with meaningful tradeoffs
- stronger combat arena silhouettes and cover landmarks
- clearer damage, elimination, respawn, and win-state feedback
- better combat HUD for hull, target pressure, and score race

### Sky Derby 3D

Primary fantasy:
- high-speed checkpoint racing
- smooth route flow
- strong sense of momentum and altitude

Quality targets:
- more readable checkpoint sequencing
- camera tuning that supports speed without disorientation
- better lap progression, split feedback, and finish clarity
- stronger pre-race briefing and post-race standings

## Shared Design Rules

- Shared flight engine, separate mode tuning.
- Shared craft roster, but tuning can be mode-sensitive if needed.
- Shared netcode/event schema where possible.
- Shared HUD primitives and lobby UI, with objective-specific content.
- Shared world-generation helpers, but separate race/combat presets.

## Migration Notes

Keep as first-class definitions:

- `builtin:sky-raid`
- `builtin:sky-derby-3d`

Convert legacy ids into aliases:

Race aliases:
- `builtin:asteroid-run-3d`
- `builtin:canyon-wing`
- `builtin:cloud-circuit`
- `builtin:volcano-rush`
- `builtin:storm-chasers-3d`

Combat aliases:
- `builtin:orbital-strike`
- `builtin:glacier-gunners`
- `builtin:island-patrol`
- `builtin:desert-ace`
- `builtin:neon-drone-arena`

Compatibility requirements:

- existing saved sessions and old activity ids should still resolve
- alias normalization should happen before component resolution
- the internal `skyarena:*` event namespace should remain valid during the refactor

## Implementation Priorities

1. Collapse the registry to two first-class flight activities.
2. Extract shared mode config, craft config, and audio into dedicated modules.
3. Split HUD/lobby/countdown UI from gameplay logic.
4. Tune race and combat separately instead of carrying many preset branches.
5. Improve finish-state polish, replay loop, and readability.

## Exit Criteria

The redesign is complete when:

- users only see two flight activities in the product
- legacy flight ids still join the correct modern activity
- race mode feels materially better as a race game
- combat mode feels materially better as a dogfight game
- the shared code is easier to tune than the current monolithic activity file
