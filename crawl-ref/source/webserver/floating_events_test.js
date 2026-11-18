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
            style: {},
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
    const renderer = {
        element: canvas,
        ui_state: 0,
        in_view: (x, y) => x >= view.x && y >= view.y && x < view.x + 20 && y < view.y + 15,
        canvas_coords: (x, y) => ({x: (x - view.x) * 60, y: (y - view.y) * 60,
                                  width: 60, height: 60})
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
                renderer, {ui: {NORMAL: 0}});
        }
    });
    return {
        root, rect, view, renderer, cleanup, clear: overlay.clear,
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
