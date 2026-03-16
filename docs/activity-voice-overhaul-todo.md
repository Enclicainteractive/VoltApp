# Activity + Voice Overhaul TODO

1. Replace remaining emoji-driven activity controls with SVG/icon components.
2. Unify activity icon resolution across picker, strip, and activities panel.
3. Add proper category icons for `Games`, `Social`, and fallback states.
4. Remove the `EXPERIMENTAL` activity strip badge and use stable status copy.
5. Restyle the activity strip around the current preview tile markup.
6. Surface better metadata in the activity picker: category, capacity, live/join state.
7. Fix poker launcher surfaces that still fall back to generic puzzle icons.
8. Replace poker card corner suit glyphs with rendered SVG suit marks.
9. Add richer poker lobby affordances: table settings, observers, buy-in/rebuy.
10. Tighten poker turn logic so betting rounds resolve correctly.
11. Add poker side-pot and split-pot handling.
12. Preserve the poker table layout on mobile instead of collapsing the illusion.
13. Redesign Soundboard Cues into a proper control deck instead of an emoji grid.
14. Redesign Whiteboard Strokes from demo-level canvas to real tool surface.
15. Redesign Shared Counter from utility buttons to product UI.
16. Revisit Video Sync and either fold it into OurVids or give it a real transport UI.
17. Revisit P2P Lobby, Host Controls, and Latency Meter if they remain user-facing.
18. Replace VoltVerse loading feature emoji with icon-driven feature cards.
19. Replace VoltVerse Creator world-element glyphs with proper icons.
20. Replace MiniGolf HUD star/lock glyphs with icon components.
21. Replace Collaborative Drawing toolbar and cursor glyphs with proper icons.
22. Stop `VoiceContext` from removing socket listeners with bare `socket.off('event')`.
23. Add a grace window for `voice:user-left` before hard peer teardown.
24. Clear queued reconnect/negotiation state on channel switch and explicit leave.
25. Guard pending ICE candidates and reconnect timers by connection generation.
26. Make voice reconnect state reflect actual participant/signaling recovery.
27. Reduce glare and negotiation churn during mass joins.
28. Make connection queue accounting depend on real negotiation completion.
29. Audit duplicate voice stacks and converge on one authoritative signaling path.
30. Add regression coverage for activity-session state and voice reconnect cleanup.
