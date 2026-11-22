"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "game_data/static/arcane_dock.js"), "utf8");
const spell = {
    id: 14, letter: "B", tile: 31, mp: 2, failure: 17,
    available: true, name: "Blink", cost: "2 MP"
};
const ability = {
    id: 6, letter: "f", tile: 43, mp: 0, failure: 3,
    available: true, name: "Spit Poison", cost: "Breath"
};
const keys = {spell_key: "z", ability_key: "a", memorise_key: "M"};

function setup() {
    const sent = [], drawn = [], layout = [];
    const document = {};
    const nodes = new Map();
    let watching = false;

    class Element {
        constructor(markup) {
            this.markup = markup;
            this.children = [];
            this.props = {};
            this.handlers = {};
            this[0] = {isConnected: true, naturalWidth: 32};
        }
        text(value) { this.value = value; return this; }
        attr(attrs) { Object.assign(this.props, attrs); return this; }
        prop(key, value) {
            if (value === undefined)
                return this.props[key];
            this.props[key] = value;
            return this;
        }
        append(...values) { this.children.push(...values); return this; }
        empty() { this.children = []; return this; }
        on(events, handler) { this.handlers[events] = handler; return this; }
        triggerHandler(event) { layout.push(event); }
        blur() {}
        scrollLeft(value) {
            if (value === undefined)
                return this.left || 0;
            this.left = value;
        }
        click() {
            if (!this.props.disabled)
                this.handlers.click.call(this);
        }
    }

    function $(selector) {
        if (typeof selector === "string" && selector.startsWith("<"))
            return new Element(selector);
        if (selector === ".arcane-memorise") {
            return $("#arcane_dock .arcane-slots").children.find(node =>
                node.markup.includes("arcane-memorise")) || new Element("");
        }
        if (!nodes.has(selector))
            nodes.set(selector, new Element(selector));
        return nodes.get(selector);
    }

    $("#arcane_hotbar").prop("hidden", true);
    let dock;
    vm.runInNewContext(source, {
        document,
        define: (_, init) => {
            dock = init($, {send_message: (msg, data) => sent.push([msg, {...data}])},
                {is_watching: () => watching},
                {badge: key => $("<kbd class='keybind-badge'>").text(key)},
                {DungeonCellRenderer: class {
                    init() {}
                    draw_gui(tile) { drawn.push(tile); }
                }},
                {init_canvas() {}}, {get_img: () => "gui"});
        }
    });
    dock.can_use = () => true;
    return {
        dock, sent, drawn, layout, $,
        spells: () => $("#arcane_dock .arcane-slots").children,
        talents: () => $("#talent_bar .arcane-slots").children,
        watch: () => { watching = true; },
        cleanup: () => $(document).handlers["game_preinit game_cleanup"]()
    };
}

test("renders server spell and talent titles, sprites, costs, rates and native shortcuts", () => {
    const {dock, spells, talents, drawn, layout, $} = setup();
    dock.update({...keys, spells: [spell], abilities: [ability]}, 3);
    assert.equal($("#arcane_hotbar").prop("hidden"), false);
    assert.equal($("#talent_bar").prop("hidden"), false);
    assert.match(spells()[0].props["aria-label"], /Blink, 2 MP, 17% failure, z then B/);
    assert.equal(talents()[0].children[2].value, "Breath");
    assert.deepEqual(spells()[0].children[4].children.map(badge => badge.value), ["z", "B"]);
    assert.deepEqual(drawn, [31, 43]);
    assert.deepEqual(layout, ["arcane_dock_layout"]);
});

test("dispatches each native selection atomically and respects command mode", () => {
    const {dock, spells, talents, sent} = setup();
    dock.update({...keys, spells: [spell], abilities: [ability]}, 2);
    spells()[0].click();
    talents()[0].click();
    dock.can_use = () => false;
    spells()[0].click();
    assert.deepEqual(sent, [
        ["quick_cast", {kind: "spell", letter: "B", id: 14}],
        ["quick_cast", {kind: "ability", letter: "f", id: 6}]
    ]);
});

test("MP-only deltas disable and reenable a slot without rebuilding it", () => {
    const {dock, spells, talents, sent} = setup();
    const state = {...keys, spells: [spell], abilities: [ability]};
    dock.update(state, 1);
    const slot = spells()[0];
    assert.equal(slot.prop("disabled"), true);
    assert.equal(talents()[0].prop("disabled"), false);
    slot.click();
    assert.equal(sent.length, 0);
    dock.update(state, 2);
    assert.equal(spells()[0], slot);
    assert.equal(slot.prop("disabled"), false);
    slot.click();
    assert.equal(sent.length, 1);
});

test("server restrictions disable actions even when MP is sufficient", () => {
    const {dock, spells, talents, sent} = setup();
    dock.update({...keys, spells: [{...spell, available: false}],
        abilities: [{...ability, available: false}]}, 20);
    assert.equal(spells()[0].prop("disabled"), true);
    assert.equal(talents()[0].prop("disabled"), true);
    spells()[0].click();
    talents()[0].click();
    assert.deepEqual(sent, []);
});

test("empty dock opens native memorisation, then clears on game cleanup", () => {
    const {dock, spells, sent, $, cleanup} = setup();
    dock.update({...keys, spells: [], abilities: []}, 0);
    assert.equal($("#talent_bar").prop("hidden"), true);
    assert.equal(spells()[0].value, "Memorise");
    assert.equal(spells()[0].children[0].value, "M");
    spells()[0].click();
    assert.deepEqual(sent, [["quick_cast", {kind: "memorise", letter: "", id: -1}]]);
    cleanup();
    assert.equal($("#arcane_hotbar").prop("hidden"), true);
    assert.deepEqual(spells(), []);
});

test("spectators can read the slots and cannot dispatch commands", () => {
    const {dock, spells, talents, sent, watch} = setup();
    watch();
    dock.update({...keys, spells: [], abilities: [ability]}, 0);
    assert.equal(spells()[0].prop("disabled"), true);
    assert.equal(talents()[0].prop("disabled"), true);
    spells()[0].click();
    talents()[0].click();
    assert.deepEqual(sent, []);
});
