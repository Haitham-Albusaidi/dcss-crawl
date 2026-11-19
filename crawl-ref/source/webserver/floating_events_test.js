const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {test} = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "game_data/static/floating_events.js"), "utf8");

function fixture()
{
    function element()
    {
        return {
            children: [],
            style: {setProperty(name, value) { this[name] = value; }},
            offsetWidth: 50,
            classList: {add(name) { this[name] = true; }},
            appendChild(node) {
                node.parentElement = this;
                node.isConnected = true;
                this.children.push(node);
            },
            setAttribute() {},
            remove() {
                this.isConnected = false;
                const children = this.parentElement.children;
                children.splice(children.indexOf(this), 1);
            }
        };
    }
    const root = element();
    const canvas = element();
    canvas.width = 1200;
    canvas.height = 900;
    const rect = {left: 12, top: 8, width: 600, height: 450};
    canvas.getBoundingClientRect = () => rect;
    root.appendChild(canvas);
    const view = {x: -4, y: -3};
    const unseen = new Set();
    let tileSize = 60;
    const renderer = {
        element: canvas,
        ui_state: 0,
        in_view: (x, y) => x >= view.x && y >= view.y && x < view.x + 20 && y < view.y + 15,
        canvas_coords: (x, y) => ({x: (x - view.x) * tileSize, y: (y - view.y) * tileSize,
                                  width: tileSize, height: tileSize})
    };
    let now = 0, animation, callback, cleanup, overlay;
    vm.runInNewContext(source, {
        document: {createElement: element},
        window: {
            performance: {now: () => now},
            requestAnimationFrame(fn) { animation = fn; return 1; },
            cancelAnimationFrame() { animation = undefined; }
        },
        define(_, factory) {
            overlay = factory(() => ({on(_, fn) { cleanup = fn; }}),
                {register_handlers: handlers => { callback = handlers.gameplay_event; }},
                renderer, {ui: {NORMAL: 0}},
                {get: (x, y) => x + "," + y, visible: cell => !unseen.has(cell)});
        }
    });
    return {
        root, rect, view, renderer, unseen, cleanup, clear: overlay.clear,
        zoom(size) { tileSize = size; },
        frame(time) { now = time; if (animation) animation(now); },
        receive: event => callback({x: 2, y: 2, target: "player", ...event}),
        layer: () => root.children[1],
        nodes: () => root.children[1]?.children || []
    };
}

test("Foxfire anchors to the current map cell through camera movement and resize", () => {
    const f = fixture();
    f.receive({kind: "spell", text: "Foxfire!"});
    f.frame(16);
    const [event] = f.nodes();
    assert.equal(event.children[0].textContent, "Foxfire!");
    assert.equal(event.style.transform, "translate(195px,150px)");
    f.view.x++;
    f.rect.width = 480;
    f.frame(32);
    assert.equal(f.layer().style.width, "480px");
    assert.equal(event.style.transform, "translate(132px,150px)");
    f.zoom(80);
    f.frame(40);
    assert.equal(event.style.transform, "translate(176px,200px)");
    f.view.x += 50;
    f.frame(48);
    assert.equal(event.hidden, true);
});

test("accepts authoritative amounts, bounds bursts and expires old effects", () => {
    const f = fixture();
    f.receive({kind: "damage", text: "999"});
    f.receive({kind: "healing", amount: "12"});
    f.receive({kind: "damage", amount: 7});
    f.receive({kind: "damage", amount: 7});
    f.receive({kind: "healing", amount: 12});
    f.receive({kind: "status", text: "Hasted!"});
    f.receive({kind: "warning", text: "Spell Failed!"});
    f.frame(16);
    assert.deepEqual(f.nodes().map(node => node.children[0].textContent),
        ["−7", "+12", "Hasted!"]);
    assert.equal(f.nodes()[0].children[0].classList.player, true);
    assert.equal(new Set(f.nodes().map(node => node.style.transform)).size, 3);
    f.frame(1250);
    assert.equal(f.nodes().length, 0);
    f.receive({kind: "damage", target: "monster", amount: 5});
    assert.equal(f.nodes()[0].children[0].classList.player, undefined);
    f.clear();
    assert.equal(f.nodes().length, 0);
    f.receive({kind: "action", text: "Level Up!"});
    f.cleanup();
    assert.equal(f.root.children.length, 1);
});

test("accepts weapon-specific attacks and anchors each to its target tile", () => {
    const f = fixture();
    const attacks = ["SLASH!", "SMASH!", "PIERCE!", "SHOT!", "HIT!"];
    attacks.forEach((text, i) =>
        f.receive({kind: "attack", text, target: "monster", x: i * 3 - 1, y: 4}));
    f.frame(16);
    assert.deepEqual(f.nodes().map(node => node.children[0].textContent), attacks);
    assert.deepEqual(f.nodes().map(node => node.style.transform),
        [105, 195, 285, 375, 465].map(x => "translate(" + x + "px,210px)"));
});

test("deduplicates discoveries by tile, category and visible text until the map clears", () => {
    const f = fixture();
    const item = {kind: "discovery", target: "item", text: "Item Found!"};
    f.receive(item);
    f.receive({...item, target: "feature", text: "Altar of Vehumet"});
    f.receive({...item, x: 3});
    assert.equal(f.nodes()[0].children[0].classList.item, true);
    assert.equal(f.nodes()[1].children[0].classList.item, undefined);
    assert.equal(f.nodes().length, 3);
    f.frame(1250);
    f.receive(item);
    assert.equal(f.nodes().length, 0);
    f.clear();
    f.receive(item);
    assert.equal(f.nodes().length, 1);
});

test("uses 20px lanes and gives slain a lane during a burst", () => {
    const f = fixture();
    f.receive({kind: "miss", text: "MISS!"});
    f.receive({kind: "block", text: "BLOCK!"});
    f.receive({kind: "dodge", text: "DODGE!"});
    f.receive({kind: "slain", text: "SLAIN!"});
    f.frame(16);
    assert.deepEqual(f.nodes().map(node => node.children[0].textContent),
        ["BLOCK!", "DODGE!", "SLAIN!"]);
    assert.deepEqual(f.nodes().map(node => node.style.transform),
        [130, 110, 150].map(y => "translate(195px," + y + "px)"));
});

test("accepts repeat combat effects at 200ms and uses the server's heavy flag", () => {
    const f = fixture();
    const damage = {kind: "damage", amount: 36, heavy: true};
    f.receive(damage);
    f.frame(199);
    f.receive(damage);
    assert.equal(f.nodes().length, 1);
    f.frame(200);
    f.receive(damage);
    assert.equal(f.nodes().length, 2);
    assert.equal(f.nodes()[0].children[0].classList.heavy, true);
});

test("clips map edges and ignores events outside the normal dungeon view", () => {
    const f = fixture();
    f.receive({kind: "discovery", text: "Stairs Up", x: -5, y: -3});
    assert.equal(f.nodes().length, 0);
    f.unseen.add("-4,-3");
    f.receive({kind: "discovery", text: "Stairs Up", x: -4, y: -3});
    assert.equal(f.nodes().length, 0);
    f.unseen.clear();
    f.receive({kind: "discovery", text: "Stairs Up", x: -4, y: -3});
    f.frame(16);
    assert.equal(f.nodes()[0].style.transform, "translate(29px,74px)");
    f.unseen.add("-4,-3");
    f.frame(32);
    assert.equal(f.nodes()[0].hidden, true);
    f.renderer.ui_state = 1;
    f.frame(48);
    f.receive({kind: "dodge", text: "DODGE!"});
    assert.equal(f.nodes().length, 0);
});

test("a killing blow preserves the weapon label and actual damage over a generic hit", () => {
    const f = fixture();
    f.receive({kind: "attack", text: "SLASH!"});
    f.receive({kind: "attack", text: "HIT!"});
    f.receive({kind: "damage", amount: 2});
    f.receive({kind: "slain", text: "SLAIN!"});
    assert.deepEqual(f.nodes().map(node => node.children[0].textContent),
        ["SLASH!", "\u22122", "SLAIN!"]);
});

test("enforces the total effect cap across distant tiles", () => {
    const f = fixture();
    for (let x = -4; x < 16; x += 3)
        for (let y = -3; y < 12; y += 2)
            f.receive({kind: "attack", text: "HIT!", x, y});
    assert.equal(f.nodes().length, 12);
    f.receive({kind: "slain", text: "SLAIN!", x: 15, y: 11});
    assert.equal(f.nodes().length, 12);
    assert.equal(f.nodes().at(-1).children[0].textContent, "SLAIN!");
});
