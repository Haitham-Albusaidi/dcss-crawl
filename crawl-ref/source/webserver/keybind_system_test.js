"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function jquery(markup) {
    const node = { outerHTML: "" };
    const element = {
        0: node,
        length: 0,
        on() { return this; },
        append(...children) {
            node.outerHTML += children.map(child => child[0]?.outerHTML || child).join("");
            return this;
        },
        text(text) {
            const escaped = String(text).replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
            node.outerHTML = markup.startsWith("<kbd")
                ? '<kbd class="keybind-badge">' + escaped + "</kbd>"
                : escaped;
            return this;
        }
    };
    return element;
}

function load(file, dependencies) {
    let result;
    const source = fs.readFileSync(path.join(__dirname, "game_data/static", file), "utf8");
    vm.runInNewContext(source, {
        document: { createTextNode: text => text },
        define(names, factory) { result = factory(...names.map(name => dependencies[name])); }
    }, { filename: file });
    return result;
}

const keybinds = load("keybinds.js", { jquery });
const frames = [];
const dependencies = {
    jquery,
    comm: { send_message: (msg, payload) => frames.push({ msg, ...payload }) },
    client: { is_watching: () => false },
    "./keybinds": keybinds,
    "./player": { index_to_letter: slot => String.fromCharCode(97 + slot) },
    "./tileinfo-gui": new Proxy({}, { get: (_, name) => name })
};
const dock = load("modern_ui.js", dependencies);
const panel = load("tiles_tab_panel.js", dependencies);

for (const [key, expected] of [
    ["o", 111], ["Tab", 9], [",", 44], ["5", 53], ["z", 122], ["a", 97],
    ["f", 102], ["i", 105], ["e", 101], ["X", 88], ["x", 120],
    ["<", 60], [">", 62], [".", 46], ["m", 109], ["M", 77], ["q", 113], ["Q", 81]
]) {
    dock.send_key({ key });
    assert.deepEqual(frames.pop(), { msg: "key", keycode: expected });
}

const ctrl = { key: "f", ctrlKey: true };
assert.equal(keybinds.commandLabel(ctrl), "Ctrl+F");
assert.equal(keybinds.matches({ key: "f", ctrlKey: true }, ctrl), true);
assert.equal(keybinds.matches({ key: "F", ctrlKey: true, shiftKey: true }, ctrl), false);
assert.equal(keybinds.matches({ key: "f", ctrlKey: true, altKey: true }, ctrl), false);
assert.equal(keybinds.matches({ key: "f", ctrlKey: true, metaKey: true }, ctrl), false);
dock.send_key(ctrl);
assert.deepEqual(frames.pop(), { msg: "key", keycode: 6 });
assert.equal(keybinds.matches({ key: "M", shiftKey: true }, { key: "M" }), true);
assert.equal(keybinds.matches({ key: "M", shiftKey: true }, { key: "m" }), false);
assert.equal(keybinds.matches({ key: "m", altKey: true }, { key: "m" }), false);
dock.send_key({ key: "m", disabled: true });
assert.deepEqual(frames, []);
assert.equal(keybinds.html("<"), '<kbd class="keybind-badge">&lt;</kbd>');

for (const step of ["species", "background", "weapon"]) {
    const subkeys = [42, 43, 63, 37, 9];
    if (step === "weapon")
        subkeys.push(8);
    const frame = {
        msg: "ui-push",
        creation: { step, unavailable_backgrounds: [{ name: "Hunter" }] },
        "main-items": { buttons: [{ hotkey: 97 }, { hotkey: 98 }] },
        "sub-items": { buttons: subkeys.map(hotkey => ({ hotkey })) }
    };
    const controls = keybinds.creationControls(frame);
    assert.deepEqual(Array.from(controls, entry => entry.hotkey),
        Array.from(new Set([...subkeys, 8, 27])));
    for (const entry of [...frame["main-items"].buttons, ...controls]) {
        const key = keybinds.keyValue(entry.hotkey);
        assert.equal(keybinds.commandCode({ key }), entry.hotkey);
    }
    assert.equal(frame.creation.unavailable_backgrounds[0].hotkey, undefined);
}

for (const [label, key] of [
    ["Wield", 119], ["Wear", 119], ["Take off", 116], ["Quiver", 113],
    ["Quaff", 113], ["Read", 114], ["Evoke", 118], ["Inscribe", 105],
    ["Adjust", 61], ["Drop", 100], ["Skill target", 115]
]) {
    const frame = { msg: "ui-push", type: "describe-item", action_keys: [{ label, key }] };
    const [action] = keybinds.inspectionActions(frame);
    assert.equal(action.label, label);
    assert.equal(keybinds.commandCode({ keycode: action.key }), key);
}
assert.equal(keybinds.inspectionActions({ action_keys: [], actions: "(d)rop" }).length, 0);
assert.equal(keybinds.inspectionActions({ action_keys: [{ key: 119, disabled: true }] }).length, 0);
assert.equal(keybinds.inspectionActions({ actions: "e(v)oke, or (d)rop." })[0].key, 118);
assert.equal(keybinds.inspectionActions({ inspection: { actions: [{ key: 87 }] } })[0].key, 87);

const tooltip = panel.formatItemTooltip({ slot: 0, letter: "A", name: "wand", useless: true });
assert.equal(tooltip.length, 3);
assert.match(tooltip[0][0].outerHTML, />A<\/kbd>/);
assert.match(tooltip[1][0].outerHTML, /R-Click/);
assert.match(tooltip[2][0].outerHTML, /Shift \+ L-Click/);

const armour = panel.formatItemTooltip({ slot: 0, name: "ring mail", base_type: 2 });
assert.match(armour[1][0].outerHTML, /Wear/);
assert.equal(panel.formatItemTooltip({ slot: 0, name: "wand", base_type: 3 }).length, 4);
assert.equal(panel.formatItemTooltip({ slot: 0, name: "book", base_type: 8 }).length, 3);
assert.equal(panel.formatItemTooltip({ slot: 0, name: "wand", base_type: 3, quantity: 0 }).length, 0);


console.log("Verified WebTiles key frames, modifier matching, creation controls, item actions and disabled hints");
