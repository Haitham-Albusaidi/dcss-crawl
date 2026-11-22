"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "game_data/static/player.js"), "utf8");

function setup()
{
    const nodes = new Map();
    const handlers = {};
    const dockUpdates = [];
    const document = {};
    const settings = {stat_colour: []};

    class Element
    {
        constructor()
        {
            this.attrs = {};
            this.styles = {};
            this.classes = new Set();
            this.contents = [];
            this.events = {};
            this.values = {};
            this[0] = {getBoundingClientRect: () => ({left: 40, top: 40, bottom: 60})};
        }

        text(value)
        {
            if (value === undefined)
                return String(this.content ?? "").replace(/<[^>]*>/g, "");
            this.content = String(value);
            return this;
        }

        html(value) { this.content = value; return this; }
        attr(key, value) { this.attrs[key] = value; return this; }
        prop(key, value) { return this.attr(key, value); }
        css(key, value)
        {
            Object.assign(this.styles, typeof key === "object" ? key : {[key]: value});
            return this;
        }

        empty() { this.contents = []; return this; }
        children() { return this.contents; }
        append(value) { this.contents.push(value); return this; }
        addClass(value) { this.classes.add(value); return this; }
        removeClass() { this.classes.clear(); return this; }
        toggleClass(value, on)
        {
            if (on)
                this.classes.add(value);
            else
                this.classes.delete(value);
            return this;
        }

        show() { return this.prop("hidden", false); }
        hide() { return this.prop("hidden", true); }
        off() { return this; }
        on(events, fn)
        {
            for (const event of events.split(" "))
                this.events[event] = fn;
            return this;
        }

        trigger() {}
        triggerHandler(event, args) {
            if (event === "arcane_dock_update")
                dockUpdates.push([...args]);
        }
        find(selector) { return $(this.selector + " " + selector); }
        data(key, value) { this.values[key] = value; return this; }
        outerWidth() { return 80; }
        outerHeight() { return 30; }
    }

    function $(selector)
    {
        if (typeof selector === "string" && selector.startsWith("<"))
            return new Element();
        if (!nodes.has(selector))
        {
            const node = new Element();
            node.selector = selector;
            nodes.set(selector, node);
        }
        return nodes.get(selector);
    }

    $.extend = Object.assign;
    vm.runInNewContext(source, {
        document,
        window: {innerWidth: 400, innerHeight: 300},
        define: (_, initialize) => initialize($,
            {register_handlers: value => Object.assign(handlers, value)},
            {is_watching: () => false}, {},
            {touch() {}}, {new_command() {}},
            {get: name => settings[name], add_listener() {}},
            {formatted_string_to_html: value => value},
            {badge: value => value})
    });

    $(document).events["game_init.player"]();
    return {$, dockUpdates, update: data => handlers.player(data)};
}

test("player deltas retain dock entries and forward the current MP", () => {
    const {dockUpdates, update} = setup();
    const quick_cast = {spells: [], abilities: []};
    update({quick_cast, mp: 4});
    update({mp: 2});
    update({hp: 6});
    assert.deepEqual(dockUpdates, [[quick_cast, 4], [quick_cast, 2]]);
});

test("crest displays lineage, piety, penance and Gozag gold through deltas", () => {
    const {$, update} = setup();
    update({
        name: "Asha", species_display_name: "Minotaur", background: "Berserker",
        god: "Trog", piety_rank: 5
    });
    assert.equal($("#stats_titleline").text(), "Asha");
    assert.equal($("#stats_species_god").text(), "Minotaur Berserker");
    assert.equal($("#stats_god").text(), "Trog");
    assert.equal($("#stats_piety").text(), "★★★★★☆");
    update({penance: true, piety_rank: 2, ostracism_pips: 1});
    assert.equal($("#stats_piety").text(), "★★☆☆☆×");
    assert.equal($("#stats_piety").attrs["aria-label"], "Piety 2 of 6, 1 lost to ostracism (under penance)");
    update({god: "Gozag", gold: 125});
    assert.equal($("#stats_gozag_gold").text(), "125 gold");
    assert.equal($("#stats_piety").text(), "");
    update({god: "", piety_rank: 0});
    assert.equal($("#stats_god").text(), "Atheist");
});

test("vital meters handle thresholds, projected poison HP and zero MP", () => {
    const {$, update} = setup();
    update({hp: 61, hp_max: 100, mp: 3, mp_max: 4});
    assert.equal($("#stats_hpline").attrs["data-health"], "healthy");
    assert.equal($("#stats_hp_bar_full").styles.width, "61%");
    assert.equal($("#stats_mp_bar_full").styles.width, "75%");
    assert.equal($("#hero_poison_preview").attrs.hidden, true);
    update({hp: 60, poison_survival: 40});
    assert.equal($("#stats_hpline").attrs["data-health"], "injured");
    assert.equal($("#stats_hp_bar_full").styles.width, "40%");
    assert.equal($("#stats_hp_bar_poison").styles.width, "20%");
    assert.equal($("#hero_poison_preview").text(), "40 HP after poison");
    update({hp: 30, poison_survival: 0});
    assert.equal($("#stats_hpline").attrs["data-health"], "injured");
    assert.equal($("#hero_poison_preview").text(), "0 HP after poison");
    update({hp: 29, poison_survival: 29, mp: 0, mp_max: 0});
    assert.equal($("#stats_hpline").attrs["data-health"], "critical");
    assert.equal($("#stats_hp_bar_poison").styles.width, "0%");
    assert.equal($("#stats_mp_bar_full").styles.width, "0%");
    update({species: "Djinni"});
    assert.equal($("#stats_mpline").attrs.hidden, true);
});

test("deck shows drained attributes, combat modifiers, progression and noise", () => {
    const {$, update} = setup();
    update({
        str: 12, str_max: 15, int: 7, int_max: 7, dex: 9, dex_max: 9,
        ac: 12, ac_mod: 1, ev: 11, ev_mod: -2, sh: 5,
        xl: 4, progress: 38, adjusted_noise: 333, place: "Dungeon", depth: 2, turn: 51
    });
    assert.equal($("#stats_str").content.text(), "12 (15)");
    assert.ok($("#stats_str").content.classes.has("degenerated_stat"));
    assert.equal($("#stats_int").content.text(), "7");
    assert.equal($("#stats_dex").content.text(), "9");
    assert.equal($("#stats_ac").text(), "12");
    assert.ok($("#stats_ac").classes.has("boosted_defense"));
    assert.equal($("#stats_ev").text(), "11");
    assert.ok($("#stats_ev").classes.has("degenerated_defense"));
    assert.equal($("#stats_sh").text(), "5");
    assert.equal($("#stats_place").text(), "Dungeon:2");
    assert.equal($("#stats_time").text(), "51");
    assert.equal($("#stats_xl").text(), "4");
    assert.equal($("#stats_progress").text(), "Next 38%");
    assert.equal($("#hero_xl_fill").styles.width, "38%");
    assert.equal($("#stats_noise_status").text(), "Quiet");
    update({adjusted_noise: 334});
    assert.equal($("#stats_noise_status").text(), "Loud");
    update({adjusted_noise: 1000, xl: 27});
    assert.equal($("#stats_noise_status").text(), "Very loud");
    assert.equal($("#stats_progress").text(), "Max");
    update({status: [{text: "silence"}]});
    assert.equal($("#stats_noise_status").text(), "Silenced");
    assert.equal($("#stats_noise_bar_full").styles.width, "0%");
    assert.equal($("#stats_status_lights").contents[0].text(), "Silenced");
});

test("equipment uses visible names and sprites, clearing slots and safe ego chips", () => {
    const {$, update} = setup();
    update({
        weapon_index: 0, shield_index: 1, quiver_item: 2,
        inv: {
            0: {name: "a dagger", quantity: 1, plus: 8, special: 33, flags: 123, tile: [15]},
            1: {name: "a +0 buckler", quantity: 1, tile: [22]},
            2: {name: "6 darts", quantity: 6, tile: [40, 41]}
        }
    });
    assert.equal($("#stats_weapon").text(), "a dagger");
    assert.equal($("#stats_weapon_container").values.slot, 0);
    assert.deepEqual($("#stats_weapon_container .hero_equipment_details").contents, ["a"]);
    assert.equal($("#stats_offhand_weapon").text(), "a +0 buckler");
    assert.equal($("#stats_quiver").text(), "6 darts");
    assert.equal($("#stats_quiver_container .hero_equipment_details").contents[0].text(), "×6");
    assert.equal($("#stats_quiver_container canvas").values.tiles.join(","), "40,41");
    update({inv: {0: {name: "a +2 dagger of flaming", known_ego: "flaming"}}});
    assert.equal($("#stats_weapon").text(), "a +2 dagger of flaming");
    assert.equal($("#stats_weapon_container .hero_equipment_details").contents[0].text(), "flaming");
    update({inv: {0: {quantity: 0}}, shield_index: -1, quiver_item: -1, quiver_desc: "Magic Dart"});
    assert.equal($("#stats_weapon").text(), "Unarmed");
    assert.equal($("#stats_weapon_container").attrs.disabled, true);
    assert.equal($("#stats_offhand_weapon").text(), "Empty offhand");
    assert.equal($("#stats_quiver").text(), "Magic Dart");
    assert.equal($("#stats_quiver_container").attrs.disabled, true);
});

test("status pills show severity and use supplied game descriptions", () => {
    const {$, update} = setup();
    update({status: [
        {light: "Berserk", text: "berserking", col: 4, desc: "You are berserk.", duration: 10},
        {light: "Slow", text: "slowed", col: 4, desc: "You are moving slowly."},
        {light: "Pois", text: "mildly poisoned (20 -> 18)", col: 2, desc: "You are poisoned."},
        {light: "Touch", text: "confusing by touch", col: 9},
        {text: "no light"}
    ]});
    const pills = $("#stats_status_lights").contents;
    assert.deepEqual(pills.map(pill => pill.attrs["data-severity"]),
        ["beneficial", "warning", "danger", "beneficial"]);
    assert.equal(pills[0].text(), "Berserk");
    assert.equal(pills[2].text(), "Poisoned");
    pills[2].events.focus();
    const tooltip = $("#stats_status_lights_tooltip");
    assert.equal(tooltip.attrs.hidden, false);
    assert.equal(tooltip.text(), "You are poisoned.");
    update({status: []});
    assert.equal(tooltip.attrs.hidden, true);
    assert.equal($("#hero_status_effects").attrs.hidden, true);
});
