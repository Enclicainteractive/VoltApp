# Retro Rift Activity

`Retro Rift '93` is an original multiplayer retro FPS activity built for a software-rendered early-90s feel without copying Doom assets, maps, enemies, names, or UI.

## Direction

- original raycast-rendered arena combat
- multiplayer deathmatch
- 12 original map layouts with host-side arena selection
- configurable frag target, time limit, pickup cycle, and spawn toggles
- original generated visuals and synth cues
- CC0/public-domain-safe texture pack manifest for later drops

## Pillars

- readable movement and strafing
- fast hitscan combat
- simple, clean lobby-to-match flow with full host setup
- original “boomer shooter” energy without copyrighted game content

## Asset Pipeline

- `src/activities/builtin/components/shared/retroShooterAssets.js` defines the texture pack manifest used by each arena theme.
- Current rendering uses palette-driven procedural wall treatment so the mode is fully usable without bundling third-party files.
- The manifest is organized around CC0-safe sources from Poly Haven and ambientCG, which keeps the path open for later local texture drops without introducing proprietary assets.
