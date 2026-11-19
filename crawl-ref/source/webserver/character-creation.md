# WebTiles character creation

## Engine and client contract

`newgame.cc` builds species, background, and weapon menus from the same
selection and compatibility rules used by the terminal. It sends a
`ui-push` of type `newgame-choice`. The same type serves tutorial and
Sprint map selection. Only the three character screens carry `creation`.

| Field | Meaning |
| --- | --- |
| `creation.step` | `species`, `background`, or `weapon` |
| `creation.species`, `creation.background` | Resolved names, omitted while unspecified |
| `creation.unavailable_backgrounds` | Optional list of `{name, group}` for backgrounds banned for the resolved species. These entries have no menu slot, action, or hotkey. |
| `main-items.buttons[].choice.name` | Engine name without the shortcut or aptitude suffix |
| `choice.recommendation` | `unknown` before the other choice is known, `recommended` for unrestricted choices, `allowed` for legal but non-recommended choices |
| `choice.skill`, `choice.aptitude` | Weapon-only skill name and signed integer aptitude, from the same values used in the terminal label |

Keep the original `tile`, `description`, `hotkey`, `labels` and grid
coordinates. The original game-start descriptions come from the database via
`getGameStartDescription`. Render them as text. The closest preceding
`main-items.labels` entry in the same column supplies the species difficulty
or background group. The weapon screen already sends the player doll.

Draw only steps known from the current menu and resolved context. Space can
switch the species and background order. Some builds skip the weapon screen
entirely because the species cannot wield a weapon, the background specifies
one, or only one legal weapon remains.

Keep the existing `menu_id` and `hotkey` together for focus. A mouse
preview sends the existing `outer_menu_focus` message, while activation sends
the existing `key` message. Route engine focus updates by both identifiers
and avoid echoing server updates back to the engine. Preserve the existing
sub-menu choices and trust the engine for what actions are available,
including previous-character presets and random confirmation.

## Antigravity handoff

The UI task is `webtiles-character-creation` in the shared task folder. The
assigned UI worktree is `character-creation-ui-dev` on
`feature/webtiles-character-creation-ui`. Both feature branches started at
`ec424e97b70192b9fa21146edc7b576fc6d1cc0b`. Review and integrate the Codex
contract branch before final live game checks. The adapter authentication
timed out during this attempt. Antigravity can continue the task from its
authenticated session using the existing handoff.

- Implement the three card layouts in `ui-layouts.js`, `game.html`, and
  `style.css`. Scope styling to `creation.step` and retain the legacy layout
  when `creation` is absent. Keep unavailable entries informational.
- Test 1920×1080, 1366×768, 1280×720, and narrow desktop. Exercise hover, arrow
  focus, mouse and key activation, random and recommended shortcuts, help,
  aptitudes, Backspace, and Tab with a saved preset. Test background-first
  ordering, a skipped weapon step, and Sprint or tutorial map selection.
- Capture all three screens from the running game and report the branch,
  commit, review findings, and test results. The pasted brief referred to
  screenshots, which were unavailable during this handoff.

## Validate the data on a live build

Build WebTiles. In a fresh game, open the species screen, then choose Felid
to check that Hunter has no hotkey. Start a second character as a Minotaur
Fighter and open the weapon menu. Save the relevant decoded WebSocket
messages or frames from both sessions into one JSON array, without login
traffic. From the repository root run:

```sh
node crawl-ref/source/webserver/character_creation_payload_test.js creation-capture.json
```

The check verifies all three steps, menu identifiers, recommendation data,
the original aptitude labels, and the absence of banned backgrounds from
the actionable grid. A Sprint or tutorial map message in the capture also
checks the legacy map contract. Verify keyboard and mouse behavior in the
running game separately.
