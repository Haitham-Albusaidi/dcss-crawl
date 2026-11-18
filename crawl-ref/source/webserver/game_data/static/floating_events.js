define(["jquery", "comm", "./dungeon_renderer", "./enums"],
function ($, comm, renderer, enums) {
    "use strict";

    const lifetime = 1250;
    const limit = 12;
    const lanes = 3;
    const labels = new Set(["spell", "status", "warning", "action"]);
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
                || !rect.width || !rect.height;
            if (!event.node.hidden)
            {
                const cell = renderer.canvas_coords(event.x, event.y);
                const inset = Math.min(event.inset, rect.width / 2);
                const x = Math.max(inset,
                    Math.min(rect.width - inset, (cell.x + cell.width / 2) * scaleX));
                const top = cell.y * scaleY;
                const y = top >= 88 ? top - event.lane * 20
                    : top + cell.height * scaleY + 44 + event.lane * 20;
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

        const now = window.performance.now();
        const neighbours = active.filter(event =>
            Math.abs(data.x - event.x) <= 2 && Math.abs(data.y - event.y) <= 1);
        if (neighbours.some(event => event.x === data.x && event.y === data.y
            && event.kind === data.kind && event.text === text && now - event.started < 150))
            return;
        let lane = 0;
        while (neighbours.some(event => event.lane === lane))
            lane++;
        if (active.length >= limit || lane >= lanes)
            return;

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
        label.textContent = text;
        node.appendChild(label);
        layer.appendChild(node);
        active.push({node, x: data.x, y: data.y, lane, text, kind: data.kind,
                     inset: label.offsetWidth / 2 + 4, started: now});
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
