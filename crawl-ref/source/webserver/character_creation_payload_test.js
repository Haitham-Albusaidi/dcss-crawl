// Read a JSON array of real WebTiles messages or their enclosing socket frames.
const assert = require("node:assert/strict");
const fs = require("node:fs");

const frames = JSON.parse(fs.readFileSync(process.argv[2] || 0, "utf8"));
const messages = frames.flatMap(frame => frame.msgs || [frame]);
const steps = new Set();
let sawFelid = false;
for (const msg of messages)
{
    if (msg.msg !== "ui-push" || msg.type !== "newgame-choice")
        continue;
    if (msg["main-items"].menu_id === "map-main")
    {
        assert.equal(msg.creation, undefined, "Map selection keeps its existing layout contract");
        continue;
    }

    const {step, species, background, unavailable_backgrounds = []} = msg.creation;
    assert.ok(["species", "background", "weapon"].includes(step));
    assert.equal(msg["main-items"].menu_id, step + "-main");
    assert.equal(msg["sub-items"].menu_id, step + "-sub");
    steps.add(step);
    const buttons = msg["main-items"].buttons;
    assert.ok(buttons.length > 0);
    assert.equal(new Set(buttons.map(button => button.hotkey)).size, buttons.length);
    for (const button of buttons)
    {
        const {choice} = button;
        assert.ok(Number.isInteger(button.hotkey) && button.hotkey > 0);
        assert.ok(choice.name && typeof button.description === "string");
        assert.ok(["unknown", "recommended", "allowed"].includes(choice.recommendation));
        if (step === "weapon")
        {
            assert.ok(species && background && choice.skill);
            assert.ok(Number.isInteger(choice.aptitude));
            const signed = choice.aptitude < 0 ? choice.aptitude : "+" + choice.aptitude;
            assert.ok(button.labels.join("").includes("(" + signed + " apt)"));
        }
        else
        {
            const partner = step === "background" ? species : background;
            assert.equal(choice.recommendation === "unknown", !partner);
        }
    }
    for (const unavailable of unavailable_backgrounds)
    {
        assert.equal(step, "background");
        assert.ok(unavailable.name && unavailable.group);
        assert.equal(unavailable.hotkey, undefined);
        assert.ok(buttons.every(button => button.choice.name !== unavailable.name));
    }
    if (step === "background" && species === "Felid")
    {
        sawFelid = true;
        assert.ok(unavailable_backgrounds.some(choice => choice.name === "Hunter"));
    }
}
assert.deepEqual([...steps].sort(), ["background", "species", "weapon"]);
assert.ok(sawFelid, "Capture a Felid background screen to check banned choices");
console.log("Validated species, background, and weapon messages and Felid restrictions");
