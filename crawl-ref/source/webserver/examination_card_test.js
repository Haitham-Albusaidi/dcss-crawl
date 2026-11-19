"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "game_data/static/examination_card.js"), "utf8");
const loc = {x: 2, y: -1};

function setup()
{
    const nodes = new Map();
    const cells = new Map();
    const handlers = {};
    const events = {};
    const messages = [];
    const draws = [];
    const timers = new Map();
    let timerId = 0;
    let viewport = true;
    let onLevel = true;
    let manager;

    class Element
    {
        constructor()
        {
            this[0] = {};
            this.classes = new Set();
            this.attributes = {};
            this.children = [];
        }

        find(selector) { return $(selector); }
        prependTo() { return this; }
        text(value) { this.content = value; return this; }
        attr(key, value) { this.attributes[key] = value; return this; }
        prop(key, value) { return this.attr(key, value); }
        css(value) { this.style = value; return this; }
        empty() { this.children = []; return this; }
        append(...elements) { this.children.push(...elements); return this; }
        appendTo(parent) { parent.append(this); return this; }
        addClass(name) { this.classes.add(name); return this; }
        removeClass(names)
        {
            names.split(" ").forEach(name => this.classes.delete(name));
            return this;
        }
        toggleClass(name, on) { return on ? this.addClass(name) : this.removeClass(name); }
        on(name, fn) { events[name] = fn; }
    }

    const card = new Element();
    function $(selector)
    {
        if (typeof selector === "string" && selector.startsWith("<section"))
            return card;
        if (typeof selector === "string" && selector.startsWith("<"))
            return new Element();
        if (!nodes.has(selector))
            nodes.set(selector, new Element());
        return nodes.get(selector);
    }

    const knowledge = {
        get: (x, y) => cells.get(x + "," + y) || {},
        visible: cell => !!cell.visible,
        player_on_level: () => onLevel
    };
    class Renderer
    {
        set_cell_size() {}
        init() {}
        render_cell(x, y) { draws.push(["monster", x, y]); }
        draw_main(tile) { draws.push(["main", tile]); }
        draw_dngn(tile) { draws.push(["dungeon", tile]); }
    }

    vm.runInNewContext(source, {
        document: {},
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id),
        define: (_, factory) => {
            manager = factory($, {
                register_handlers: registered => Object.assign(handlers, registered),
                send_message: (type, data) => messages.push({type, data})
            }, knowledge, {DungeonCellRenderer: Renderer}, {init_canvas() {}});
        }
    });
    manager.setViewport(() => viewport);
    const setCell = (point, value) => cells.set(point.x + "," + point.y, value);
    setCell(loc, {visible: true});
    return {
        manager, card, $, messages, draws, setCell,
        receive: data => handlers.examine_card(data),
        flushTimers: () => {
            for (const [id, fn] of timers)
            {
                timers.delete(id);
                fn();
            }
        },
        setViewport: value => { viewport = value; },
        setOnLevel: value => { onLevel = value; },
        cleanup: () => events["game_cleanup.examination_card"](),
        active: () => card.classes.has("is-active")
    };
}

const samples = [
    {type: "monster", name: "Grinder", category: "Monster", badge: "Unique",
        hp: 70, desc: "Paralysed", props: {Distance: "🏹 Range 3"}},
    {type: "item", name: "+2 flaming war axe", category: "Weapon",
        props: {"Base damage": "11", Accuracy: "-2", "Base delay": "1.5 turns", Brand: "flaming"}},
    {type: "item", name: "Plate armour", category: "Armour", badge: "Cursed",
        props: {"Base AC": "10", Encumbrance: "18"}},
    {type: "item", name: "Glowing potion", category: "Potion",
        props: {Quantity: "2"}, desc: "Unidentified."},
    {type: "altar", name: "Altar of Vehumet", category: "Deity / Altar",
        desc: "Vehumet is a god of destructive magic."},
    {type: "stair", name: "Stone staircase leading down", category: "Stairs",
        props: {Direction: "Down", Destination: "Dungeon:2"}},
    ...["Open", "Closed", "Runed", "Locked"].map(badge => ({
        type: "door", name: badge + " translucent door", category: "Door",
        badge, props: {Material: "Clear glass"}
    })),
    {type: "trap", name: "Shaft", category: "Shaft", badge: "Hazard",
        desc: "Drops creatures to a lower level."},
    {type: "shop", name: "Egia's Weapon Emporium", category: "Shop",
        props: {"Store type": "Weapon"}, desc: "Sells weapons."},
    {type: "portal", name: "Flickering gateway to a bazaar", category: "Portal",
        props: {Destination: "Bazaar", Stability: "Temporary entrance"}},
    ...["Lava", "Deep water", "Floor", "Stone wall"].map(name => ({
        type: "terrain", name, category: "Terrain"
    })),
    {type: "cloud", name: "Cloud of poison gas", category: "Cloud",
        badge: "Hazard", desc: "Poisons creatures that breathe it."}
];

for (const sample of samples)
{
    test("renders " + sample.name, () => {
        const ui = setup();
        ui.manager.modeChanged(true);
        ui.receive({request: 0, active: true, loc, tile: 123, ...sample});
        assert.equal(ui.active(), true);
        assert.equal(ui.$(".er-examine-name").content, sample.name);
        assert.equal(ui.$(".er-examine-category").content, sample.category);
        assert.equal(ui.$(".er-examine-badge").content, sample.badge || "");
        assert.equal(ui.$(".er-examine-desc").content, sample.desc || "");
        const props = ui.$(".er-examine-props").children.map(({children: [label, value]}) =>
            [label.content, value.content]);
        assert.deepEqual(props, Object.entries(sample.props || {}));
        assert.equal(ui.$(".er-examine-health").attributes.hidden, sample.hp === undefined);
        if (sample.hp)
        {
            assert.equal(ui.$(".er-examine-health-fill").style.width, "70%");
            assert.equal(ui.$(".er-examine-health span").content, "≈70%");
        }
        const sprite = sample.type === "monster" ? ["monster", loc.x, loc.y]
            : [sample.type === "item" || sample.type === "cloud" ? "main" : "dungeon", 123];
        assert.deepEqual(ui.draws, [sprite]);
        assert.equal(ui.$("#monster_hud").classes.has("has-examination"), true);
    });
}

test("hover replaces the card only with the latest matching response", () => {
    const ui = setup();
    const second = {x: 3, y: 0};
    ui.setCell(second, {visible: true});
    ui.manager.moveHover(loc);
    ui.flushTimers();
    assert.equal(ui.messages[0].type, "examine_cell");
    const first = ui.messages[0].data;
    ui.manager.moveHover(second);
    ui.flushTimers();
    const latest = ui.messages[1].data;
    ui.receive({request: first.request, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
    ui.receive({request: latest.request, active: true, loc: second, ...samples[1]});
    assert.equal(ui.active(), true);
    ui.manager.clear();
    ui.receive({request: latest.request, active: true, loc: second, ...samples[1]});
    assert.equal(ui.active(), false);
});

test("a hidden trap or boring floor gets no hover card from an inactive response", () => {
    const ui = setup();
    ui.manager.moveHover(loc);
    ui.flushTimers();
    ui.receive({request: ui.messages[0].data.request, active: false});
    assert.equal(ui.active(), false);
    assert.deepEqual(ui.draws, []);
});

test("fog, offscreen cells and other levels mask payloads and cancel hover", () => {
    const ui = setup();
    ui.manager.modeChanged(true);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    ui.setCell(loc, {visible: false, dirty: true});
    ui.manager.onMapChange({cells: [{}]});
    assert.equal(ui.active(), false);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
    ui.setCell(loc, {visible: true});
    ui.setViewport(false);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
    ui.setViewport(true);
    ui.setOnLevel(false);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
    ui.manager.modeChanged(false);
    ui.manager.moveHover(loc);
    ui.flushTimers();
    assert.deepEqual(ui.messages, []);
});

test("target exit and cleanup restore the existing monster slot", () => {
    const ui = setup();
    ui.manager.modeChanged(true);
    ui.receive({request: 0, active: true, detailed: true, loc, ...samples[0]});
    assert.equal(ui.$("#monster_hud").classes.has("has-detailed-examination"), true);
    ui.receive({request: 0, active: false});
    assert.equal(ui.active(), false);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    ui.manager.modeChanged(false);
    assert.equal(ui.$("#monster_hud").classes.has("has-examination"), false);
    ui.receive({request: 0, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
    ui.manager.moveHover(loc);
    ui.flushTimers();
    ui.cleanup();
    ui.receive({request: ui.messages[0].data.request, active: true, loc, ...samples[0]});
    assert.equal(ui.active(), false);
});
