define(["jquery", "comm", "./map_knowledge", "./cell_renderer", "./util"],
function ($, comm, map_knowledge, cr, util) {
    "use strict";

    let targeting = false;
    let hover = null;
    let pending = 0;
    let sequence = 0;
    let timer;
    let current = null;
    let viewContains = () => false;
    let card;
    let renderer;

    function sameCell(a, b)
    {
        return a && b && a.x === b.x && a.y === b.y;
    }

    function visible(loc)
    {
        return loc && viewContains(loc) && map_knowledge.player_on_level()
            && map_knowledge.visible(map_knowledge.get(loc.x, loc.y));
    }

    function makeCard()
    {
        return $('<section class="er-examine-card" aria-hidden="true">' +
            '<div class="er-examine-avatar-box"><canvas aria-hidden="true"></canvas></div>' +
            '<div class="er-examine-body">' +
              '<div class="er-examine-labels"><span class="er-examine-category"></span>' +
                  '<span class="er-examine-badge"></span></div>' +
              '<div class="er-examine-name"></div>' +
              '<div class="er-examine-health"><div class="er-examine-health-track">' +
                  '<div class="er-examine-health-fill"></div></div><span></span></div>' +
              '<dl class="er-examine-props"></dl><p class="er-examine-desc"></p>' +
            '</div></section>').prependTo("#monster_hud");
    }

    function hide()
    {
        current = null;
        if (card)
            card.removeClass("is-active").attr("aria-hidden", "true");
        $("#monster_hud").removeClass("has-examination has-detailed-examination");
    }

    function cancelHover()
    {
        clearTimeout(timer);
        pending = 0;
        hover = null;
    }

    function clear()
    {
        cancelHover();
        hide();
    }

    function render(data)
    {
        current = data;
        if (!card)
            card = makeCard();
        card.find(".er-examine-name").text(data.name);
        card.find(".er-examine-category").text(data.category);
        card.find(".er-examine-badge").text(data.badge || "")
            .attr("data-tone", (data.badge || "").toLowerCase());
        const props = card.find(".er-examine-props").empty();
        Object.entries(data.props || {}).forEach(([key, value]) => {
            $("<div>").append($("<dt>").text(key), $("<dd>").text(value)).appendTo(props);
        });
        card.find(".er-examine-desc").text((data.desc || "").replace(/<\/?[a-z_]+>/gi, ""));

        const hasHP = data.type === "monster" && Number.isFinite(data.hp);
        const hp = hasHP ? Math.max(0, Math.min(100, data.hp)) : 0;
        card.find(".er-examine-health").prop("hidden", !hasHP);
        card.find(".er-examine-health-fill").css({
            width: hp + "%",
            backgroundColor: hp > 60 ? "#80bc7c" : hp > 30 ? "#d8b462" : "#e47178"
        });
        card.find(".er-examine-health span").text((hp === 100 ? "" : "≈") + hp + "%");

        const canvas = card.find("canvas")[0];
        util.init_canvas(canvas, 32, 32);
        if (!renderer)
            renderer = new cr.DungeonCellRenderer();
        renderer.set_cell_size(32, 32);
        renderer.init(canvas);
        if (data.type === "monster")
            renderer.render_cell(data.loc.x, data.loc.y, 0, 0);
        else if (data.type === "item" || data.type === "cloud")
            renderer.draw_main(data.tile, 0, 0);
        else
            renderer.draw_dngn(data.tile, 0, 0);

        $("#monster_hud").addClass("has-examination")
            .toggleClass("has-detailed-examination", !!data.detailed);
        card.addClass("is-active").attr("aria-hidden", "false");
    }

    function handleExamination(data)
    {
        if (data.request > 0)
        {
            if (targeting || data.request !== pending)
                return;
            pending = 0;
            if (data.active && !sameCell(data.loc, hover))
                return;
        }
        else if (data.active && !targeting)
            return;

        if (data.active && visible(data.loc))
            render(data);
        else
            hide();
    }

    function scheduleHover()
    {
        clearTimeout(timer);
        pending = ++sequence;
        const request = pending;
        timer = setTimeout(() => {
            if (request === pending && visible(hover))
                comm.send_message("examine_cell", {x: hover.x, y: hover.y, request});
        }, 70);
    }

    function moveHover(loc)
    {
        if (targeting || sameCell(hover, loc))
            return;
        clear();
        if (visible(loc))
        {
            hover = loc;
            scheduleHover();
        }
    }

    function onMapChange(data)
    {
        if (current && (!visible(current.loc)
            || !targeting && data.cells
                && map_knowledge.get(current.loc.x, current.loc.y).dirty))
        {
            hide();
        }
        if (hover && !visible(hover))
            clear();
        else if (hover && data.cells && map_knowledge.get(hover.x, hover.y).dirty)
            scheduleHover();
    }

    $(document).on("game_cleanup.examination_card", () => {
        targeting = false;
        clear();
        card = null;
    });
    comm.register_handlers({examine_card: handleExamination});

    return {
        clear,
        moveHover,
        moveTarget: loc => {
            if (!visible(loc))
                hide();
        },
        onMapChange,
        setViewport: contains => { viewContains = contains; },
        modeChanged: active => {
            targeting = active;
            clear();
        }
    };
});
