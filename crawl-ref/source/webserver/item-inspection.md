# WebTiles item inspection

The engine sends a `describe-item` UI push from `describe_item_popup` in
`describe.cc`. Existing clients receive the same `title`, `body`, `tiles`,
`spellset`, and `actions`. They can keep rendering the original popup.

## Inspection object

| Field | Meaning |
| --- | --- |
| `kind` | `weapon`, `armour`, or `throwable`. Missiles qualify when the inspected character can throw them. Other item classes keep the existing layout. |
| `equipped`, `melded` | Equipped is present for weapons or armour in inventory. A melded item is still equipped, with `melded: true` for the visual distinction. |
| `enchantment` | Signed integer for identified weapons and armour. |
| `stats` | Optional fields within an object. Weapons and projectiles use `base_damage`, `accuracy`, `base_delay_aut`, `current_delay_aut`, `minimum_delay_aut`, `minimum_delay_skill`, `skill`, `damage_rating`, and `hands` as applicable. Armour uses `base_armour`, `base_shield`, `encumbrance`, `evasion`, and `max_enchantment` as applicable. Ten aut correspond to one displayed turn. |
| `stats.destroy_denominator` | Projectile destruction chance. Zero means never, one always, and any larger number represents a one-in-that-number chance. |
| `sections` | `description` and `advanced`, plus `lore` and `notes` when available. Strings use existing Crawl colour markup. For caller-customized text, use the legacy body as the full description. |
| `actions` | Ordered `{key, label}` pairs. The numeric key uses the existing WebTiles key transport. An empty list means no command buttons are available. |

Render a card only when its field is present. The original equipment
comparison text still contains the engine's projected AC, EV, SH,
spell failure, and attack delay where applicable. The comparison can include
replacing another item, so a standalone AC contribution is unavailable.
Damage formulas, skill projections, and stash and menu prefixes remain
available in the advanced section. Use the title and sprite layers
provided by the engine. The title already contains identifying text.

## Antigravity assignment

Use `feature/webtiles-item-inspection-ui` in `item-inspection-ui-dev`.
The shared task record is `webtiles-item-inspection`. The base is
`3c78cc22196a437b306d3eda4d425e2ea338768c`. The adapter returned
`AUTH_REQUIRED` in this session. The same task can continue in an
authenticated session using the existing workflow.

- Own the WebTiles template, stylesheet and `ui-layouts.js`. Scope the
  redesign to messages with `inspection`. Follow the dark-fantasy design of
  the recently merged character creation screens.
- Preserve sprite layering, glyph display mode, the existing popup stack,
  spell rendering, and Escape. The `describe-spell-success` update replaces
  the description with a spell failure comparison on `!`. Retain both
  directions of that toggle, including restoration of the main layout.
- Keep actions reachable when the text scrolls. Send the server key exactly
  once per click. Keep the legacy shortcut path for keyboard input and
  provide visible focus and reduced motion.
- Run the correct WSL feature build on port 8088. Test War Axe, Robe, and
  Large Rock. For Large Rock, use a species capable of throwing it, such as
  Troll. Check equipped and unequipped gear, a read-only inspection,
  keyboard and mouse actions, long descriptions, Escape and reopening.
  Test 1920×1080, 1366×768, 1280×720 and narrow desktop and capture screenshots.

## Live payload regression check

Save the relevant decoded WebSocket messages or frames from the three
inspections into one JSON array, without login traffic. Include equipped,
unequipped and read-only inspections. From the repository root run:

```sh
node crawl-ref/source/webserver/item_inspection_payload_test.js capture.json
```

The check compares base values to the current engine item tables and
checks that the new action keys match the legacy footer. Browser tests
still need to exercise input handling and panel layout.
