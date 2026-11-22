# Task Assignment: Phase 3 — Quick-Cast Arcane Dock & Talent Bar

**Assigned Agent:** OpenAI Codex CLI  
**Assigned Worktree:** `C:\Users\Tempc\Desktop\dcss\arcane-dock-dev`  
**Active Branch:** `feature/webtiles-arcane-dock`  
**Base Commit:** `f1934b6c28` (`main`)  
**Lead Supervisor & Publisher:** Google Antigravity (Sole GitHub Publishing Manager)  

---

## 1. Project Context & Licensing Authorization

- **Repository**: Dungeon Crawl Stone Soup (DCSS 0.35-a0), open-source software licensed under the GNU General Public License v2.0+ (GPL-2.0+).
- **Authorization**: You are working directly on an authorized development fork (`Haitham-Albusaidi/dcss-crawl`). You have full permission and authorization to modify, refactor, and enhance the WebTiles interface, C++ engine, and client assets.
- **Original Dark-Fantasy Visual Design**: Continue the established, bespoke dark-fantasy RPG visual theme (obsidian & charcoal translucent backdrops `rgba(16, 20, 26, 0.94)`, antique gold borders `#c49a45`, Cinzel headers, and authentic DCSS sprites).

---

## 2. Goal & Scope

Transform the WebTiles spell and ability interaction into a modern, persistent RPG **Quick-Cast Arcane Dock & Talent Bar**:
1. **Persistent Arcane Dock & Talent Bar**: A dedicated or integrated quick-cast bar displaying memorised spells and active abilities as tactical hotbar slots.
2. **Authentic DCSS Icons & Sprites**: Use authentic spell school tiles or DCSS spell/ability icons.
3. **Real-Time Costs & Success Rates**: Display MP costs and failure rates (%). Dim/disable slots when the player lacks sufficient MP or is under silence/confusion/paralysis.
4. **Keybind Integration**: Standardized `.keybind-badge` chips indicating the exact shortcut sequence (e.g. `z` + letter for spells, `a` + letter for abilities).
5. **Mouse-Click Quick-Casting**: Clicking a quick-slot dispatches the native command sequence into Crawl's normal targeting flow (no hacky bypasses of server rules).
6. **Clean Empty State**: If no spells are memorised, show a clean, compact prompt (`Memorise [M]` button) that triggers spell memorisation.
7. **Responsive & Collision-Free**: Must cleanly dock alongside or within `#action_dock_row`, respecting `#message_pane`, `#chat`, and `#right_column`.
8. **Automated Unit Tests**: Deliver `arcane_dock_test.js` validating data extraction, shortcut dispatch, MP checks, and UI rendering.

---

## 3. Implementation Guidelines

### Files to Target:
- `crawl-ref/source/webserver/game_data/templates/game.html`: Structure for `#arcane_dock` / `#talent_bar` inside or above `#action_dock_row`.
- `crawl-ref/source/webserver/game_data/static/style.css`: Bespoke dark-fantasy styling for spell & talent slots, cost badges, failure rate text, disabled states, and hover glow.
- `crawl-ref/source/webserver/game_data/static/game.js` & `player.js`: Dynamic state management, listening to spell/ability updates, MP updates, and click-to-cast handlers.
- `crawl-ref/source/webserver/arcane_dock_test.js`: Comprehensive test suite.
- (Optional C++ integration in `tileweb.cc` if additional metadata serialization is required for quick-slots).

### Zero Regression Mandate:
- Do NOT alter core DCSS game mechanics, spell formulas, failure rolls, or RNG.
- Preserve all existing keyboard shortcuts, Hero HUD functionality, Tactical Chronicle channels, and Cartographer Minimap.
- Preserve all existing development worktrees.
