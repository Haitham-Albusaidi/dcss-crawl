// Check decoded WebTiles socket frames saved as a JSON array.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const frames = JSON.parse(fs.readFileSync(process.argv[2] || 0, "utf8"));
const items = frames.flatMap(frame => frame.msgs || [frame])
    .filter(message => message.msg === "ui-push" && message.type === "describe-item");

const examples = [
    [/war axe/i, "weapon", {base_damage: 11, accuracy: 0, base_delay_aut: 15}],
    [/robe/i, "armour", {base_armour: 2, encumbrance: 0}],
    [/large rock/i, "throwable", {base_damage: 20, base_delay_aut: 20, skill: "Throwing"}]
];

for (const [name, kind, expectedStats] of examples)
{
    const matches = items.filter(item => name.test(item.title));
    assert.ok(matches.length, "Capture " + name);
    for (const item of matches)
    {
        const {inspection} = item;
        assert.equal(inspection.kind, kind);
        assert.ok(item.body && Array.isArray(item.tiles) && item.tiles.length);
        for (const [field, value] of Object.entries(expectedStats))
            assert.equal(inspection.stats[field], value, field);
        for (const [field, value] of Object.entries(inspection.stats))
            assert.ok(field === "skill" ? typeof value === "string" : Number.isInteger(value), field);

        // The old footer and the structured buttons must advertise the same keys.
        const originalKeys = Array.from(item.actions.matchAll(/\((.)\)/g),
            match => match[1].charCodeAt(0));
        assert.deepEqual(inspection.actions.map(action => action.key), originalKeys);
        assert.ok(inspection.actions.every(action => action.label.length > 0));
        if (inspection.sections)
        {
            assert.equal(typeof inspection.sections.description, "string");
            assert.ok(inspection.sections.advanced.includes("Stash search prefixes:"));
            if (inspection.sections.lore)
                assert.ok(item.body.includes("_________________"));
        }
    }
}
assert.ok(items.some(item => item.inspection?.equipped === true), "Capture equipped gear");
assert.ok(items.some(item => item.inspection?.equipped === false), "Capture unequipped gear");
assert.ok(items.some(item => item.inspection && !item.inspection.actions.length),
    "Capture a read-only equipment description");

console.log("Validated War Axe, Robe, and Large Rock payloads, equipment states, and actions");
