"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(name, dependencies)
{
    const source = fs.readFileSync(path.join(__dirname, "game_data/static", name + ".js"), "utf8");
    const document = {createDocumentFragment: () => ({})};
    const nodes = new Map();
    function jquery(selector)
    {
        if (!nodes.has(selector))
        {
            const node = {
                0: {scrollHeight: 100, scrollTop: 0, clientHeight: 100},
                events: [], attrs: {}, classes: {},
                off() { return this; },
                bind() { return this; },
                prepend() { return this; },
                each() { return this; },
                text() { return this; },
                attr(key, val) { this.attrs[key] = val; return this; },
                prop(key, val) { return this.attr(key, val); },
                toggleClass(key, val) { this.classes[key] = val; return this; },
                trigger(event) { this.events.push(event); return this; },
                on(event, selector, handler) {
                    this.events.push({event, selector, handler: handler || selector});
                    return this;
                }
            };
            nodes.set(selector, node);
        }
        return nodes.get(selector);
    }
    let exports;
    vm.runInNewContext(source, {
        document,
        define: (names, factory) => {
            exports = factory(...names.map(dep => dep === "jquery" ? jquery : dependencies[dep]));
        }
    }, {filename: name + ".js"});
    return {exports, jquery, document};
}

const chronicle = load("messages", {
    comm: {register_handlers() {}},
    "./options": {add_listener() {}}
});
const minimap = load("minimap", {}).exports;
const matches = (filter, channel, text, search = "") =>
    chronicle.exports.matches_message({channel, text}, filter, search);

test("All retains original channels and Combat includes plain attack narration", () => {
    for (let channel = 0; channel < 35; ++channel)
        assert.equal(matches("all", channel, "game message"), true);
    for (const channel of [1, 13, 15, 17, 18])
        assert.equal(matches("combat", channel, "Sigmund casts a spell."), true);
    for (const text of ["You hit Sigmund.", "The adder barely misses you.", "You kill the adder!"])
        assert.equal(matches("combat", 0, text), true);
    assert.equal(matches("combat", 3, "Trog is pleased."), false);
});

test("Alerts and Story distinguish warnings from discovery channels", () => {
    for (const channel of [5, 6, 12, 31])
        assert.equal(matches("alerts", channel, "Danger!"), true);
    assert.equal(matches("alerts", 4, "You are paralysed."), true);
    assert.equal(matches("alerts", 7, "You feel better."), false);
    for (const channel of [2, 3, 21, 23, 24, 29, 33])
        assert.equal(matches("story", channel, "A discovery!"), true);
    assert.equal(matches("story", 0, "You see here an altar."), true);
    assert.equal(matches("story", 0, "Found a stone staircase leading down."), true);
    assert.equal(matches("story", 13, "Sigmund casts a spell."), false);
});

test("Search is case-insensitive and intersects the selected channel", () => {
    assert.equal(matches("combat", 13, "Sigmund casts a spell.", "sigmund"), true);
    assert.equal(matches("story", 13, "Sigmund casts a spell.", "sigmund"), false);
    assert.equal(matches("all", 7, "You feel better.", "poison"), false);
});

test("Drawer button toggles state, search visibility, and layout", () => {
    const {jquery, document, exports: messages} = chronicle;
    const game = jquery(document);
    game.events.find(({event}) => event === "game_init.messages").handler();
    const toggle = jquery("#chronicle_controls").events
        .find(({selector}) => selector === "#chronicle_toggle").handler;
    assert.equal(messages.is_expanded(), false);
    toggle();
    assert.equal(messages.is_expanded(), true);
    assert.equal(jquery("#chronicle_search_row").attrs.hidden, false);
    assert.equal(jquery("#chronicle_toggle").attrs["aria-expanded"], true);
    assert.equal(game.events.at(-1), "chronicle_layout");
    toggle();
    assert.equal(messages.is_expanded(), false);
    assert.equal(jquery("#chronicle_search_row").attrs.hidden, true);
});

test("Radar reads the discovered landmark field in map knowledge", () => {
    const samples = {
        "<": "Stairs to Dungeon: 1", ">": "Stairs to Dungeon: 3",
        "_": "Altar of Trog", "$": "Weapon Emporium", "+": "Entrance to the Lair"
    };
    for (const [glyph, label] of Object.entries(samples))
    {
        const point = minimap.extract_landmark({poi: glyph + label, x: -4, y: 8});
        assert.deepEqual({...point}, {glyph, label, x: -4, y: 8});
    }
});

test("Unseen terrain, mapping-only data and cleared landmarks cannot spawn markers", () => {
    for (const cell of [undefined, {}, {f: 42, mf: 14, g: ">"}, {poi: null}, {poi: "^trap"}])
    {
        assert.equal(minimap.extract_landmark(cell), null);
        assert.equal(minimap.travel_request(cell), null);
    }
});

test("Travel uses remembered map coordinates independent of canvas scale and origin", () => {
    const request = minimap.travel_request({x: -10, y: 13, poi: "+Sewer portal"});
    assert.deepEqual({...request}, {x: -10, y: 13, button: 1, landmark: true});
});
