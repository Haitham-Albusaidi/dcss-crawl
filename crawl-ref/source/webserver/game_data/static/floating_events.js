define(["jquery", "comm", "./dungeon_renderer", "./enums", "./map_knowledge"],
function ($, comm, renderer, enums, map) {
    "use strict";

    const lifetime = 1250;
    const limit = 12;
    const lanes = 3;
    const laneOffset = 20;
    const duplicateInterval = 200;
    const labels = new Set(["attack", "miss", "block", "dodge", "slain",
        "discovery", "spell", "status", "warning", "action"]);
    const seen_discoveries = new Set();
    const active = [];
    let layer, frame;

    function clear()
    {
        if (frame !== undefined)
            window.cancelAnimationFrame(frame);
        frame = undefined;
        for (const event of active)
            event.node.remove();
        active.length = 0;
        seen_discoveries.clear();
    }

    function update(now)
    {
        frame = undefined;
        const canvas = renderer.element;
        if (!canvas || !canvas.isConnected || renderer.ui_state !== enums.ui.NORMAL)
        {
            clear();
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;
        layer.style.left = rect.left + "px";
        layer.style.top = rect.top + "px";
        layer.style.width = rect.width + "px";
        layer.style.height = rect.height + "px";
        layer.style.setProperty("--floating-label-width", Math.max(0, rect.width - 8) + "px");

        for (let i = active.length - 1; i >= 0; i--)
        {
            const event = active[i];
            if (now - event.started >= lifetime)
            {
                event.node.remove();
                active.splice(i, 1);
                continue;
            }

            event.node.hidden = !renderer.in_view(event.x, event.y)
                || !rect.width || !rect.height
                || (event.kind === "discovery" && !map.visible(map.get(event.x, event.y)));
            if (!event.node.hidden)
            {
                const cell = renderer.canvas_coords(event.x, event.y);
                const inset = Math.min(event.label.offsetWidth / 2 + 4, rect.width / 2);
                const x = Math.max(inset,
                    Math.min(rect.width - inset, (cell.x + cell.width / 2) * scaleX));
                const top = cell.y * scaleY;
                const y = top >= 88 ? top - event.lane * laneOffset
                    : Math.min(rect.height - 2,
                        top + cell.height * scaleY + 44 + event.lane * laneOffset);
                const position = "translate(" + x + "px," + y + "px)";
                if (event.node.style.transform !== position)
                    event.node.style.transform = position;
            }
        }

        if (active.length)
            frame = window.requestAnimationFrame(update);
    }

    function receive(data)
    {
        const canvas = renderer.element;
        if (!canvas || !canvas.isConnected || renderer.ui_state !== enums.ui.NORMAL
            || !Number.isInteger(data.x) || !Number.isInteger(data.y)
            || !renderer.in_view(data.x, data.y))
            return;

        let text;
        if (data.kind === "damage" || data.kind === "healing")
        {
            if (!Number.isSafeInteger(data.amount) || data.amount <= 0)
                return;
            text = (data.kind === "damage" ? "\u2212" : "+") + data.amount;
        }
        else if (labels.has(data.kind) && typeof data.text === "string" && data.text.trim())
            text = data.text.slice(0, 100);
        else
            return;

        if (data.kind === "discovery" && !map.visible(map.get(data.x, data.y)))
            return;

        const discovery = data.kind === "discovery"
            ? JSON.stringify([data.x, data.y, data.target, text])
            : null;
        if (discovery && seen_discoveries.has(discovery))
            return;

        const now = window.performance.now();
        const neighbours = active.filter(event =>
            Math.abs(data.x - event.x) <= 2 && Math.abs(data.y - event.y) <= 1);
        if (neighbours.some(event => event.x === data.x && event.y === data.y
            && event.kind === data.kind && event.text === text
            && now - event.started < duplicateInterval))
            return;
        let lane = 0;
        while (neighbours.some(event => event.lane === lane))
            lane++;
        if (active.length >= limit || lane >= lanes)
        {
            // A kill takes the place of a nearby non-kill effect when all
            // lanes are occupied, or the oldest non-kill at the global cap.
            const victim = data.kind === "slain"
                && (lane >= lanes ? neighbours : active)
                    .find(event => event.kind !== "slain"
                        && (lane < lanes || neighbours.every(other =>
                            other === event || other.lane !== event.lane)));
            if (!victim)
                return;
            if (lane >= lanes)
                lane = victim.lane;
            victim.node.remove();
            active.splice(active.indexOf(victim), 1);
        }

        if (!layer || !layer.isConnected)
        {
            layer = document.createElement("div");
            layer.className = "floating-events";
            layer.setAttribute("aria-hidden", "true");
            canvas.parentElement.appendChild(layer);
        }

        const node = document.createElement("div");
        node.className = "floating-event";
        const label = document.createElement("span");
        label.className = "floating-event-label " + data.kind;
        if (data.target === "player")
            label.classList.add("player");
        if (data.kind === "discovery" && data.target === "item")
            label.classList.add("item");
        if (data.kind === "damage" && data.heavy === true)
            label.classList.add("heavy");
        if (data.kind === "status" && text === "Hasted!")
            label.classList.add("beneficial");
        label.textContent = text;
        node.appendChild(label);
        layer.appendChild(node);
        if (discovery)
            seen_discoveries.add(discovery);
        active.push({node, label, x: data.x, y: data.y, lane, text, kind: data.kind,
                     started: now});
        if (frame === undefined)
            frame = window.requestAnimationFrame(update);
    }

    comm.register_handlers({"gameplay_event": receive});
    $(document).on("game_cleanup.floating_events", function () {
        clear();
        if (layer)
            layer.remove();
        layer = undefined;
    });

    return {clear};
});
