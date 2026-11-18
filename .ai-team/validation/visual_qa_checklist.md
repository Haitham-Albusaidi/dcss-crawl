# DCSS WebTiles Visual QA & Manual Verification Rubric

When visual changes cannot be fully validated by headless CI, the following checklist must be performed and recorded.

---

## 1. Top Screen Center Threat Card (`#top_target_card`)
- [ ] **Placement**: Card floats horizontally centered at `left: 50%`, `transform: translateX(-50%)`, top margin `14px`.
- [ ] **HP Bar**: Smooth animated health bar reflecting enemy wounds with appropriate danger color (green -> yellow -> red).
- [ ] **Threat Badge**: Correctly flags `BOSS / UNIQUE` with pulsing crimson outline or `ELITE / NASTY` with gold border.
- [ ] **Distance Chip**: Updates dynamically as player moves relative to target.
- [ ] **Modal Suppression**: Card immediately vanishes when any `.ui-popup` opens to prevent overlapping content.

---

## 2. Monster Description Codex (`.describe-monster`)
- [ ] **Pedestal Frame**: Monster sprite rendered in high resolution (64×64) inside an illuminated gold-framed box.
- [ ] **Typography**: Monster title in Cinzel uppercase with subtitle `TACTICAL CODEX & BEAST LORE`.
- [ ] **Stat Grid**: Clean 4-column responsive layout displaying all 8 core stats (Max HP, Will, AC, EV, Threat, Class, Size, Int).
- [ ] **Combat Odds**: High-contrast badges for player hit chance (green) and enemy hit chance (amber).
- [ ] **Attack Arsenal**: Displays weapon/attack form with max damage chip (`X MAX DMG`).
- [ ] **Interactive Tabs**: Clicking tabs or pressing <kbd>!</kbd> switches between Description and Status & Effects.
- [ ] **Dismissal**: Clicking `✕ Esc` button or pressing <kbd>Escape</kbd> closes the codex immediately.

---

## 3. Confirmation Prompt Dialogs (`.menu_prompt`)
- [ ] **Centering**: Window is centered on screen without clipping left/right margins.
- [ ] **Choices**: `[Y] Yes` displayed with emerald theme; `[N] No` displayed with crimson theme.
- [ ] **Keybindings**: Pressing <kbd>Y</kbd>, <kbd>N</kbd>, or <kbd>Enter</kbd> activates the highlighted choice.

---

## 4. Arcane Grimoire & Spellbook (`menu_spell`)
- [ ] **School Badges**: Elemental schools (Fire, Ice, Earth, Air, Conjurations, etc.) rendered as colored badges.
- [ ] **Failure Meter**: Circular failure gauge color-coded by risk level.
- [ ] **Hotkeys**: Direct casting via letters `a`–`z`.
