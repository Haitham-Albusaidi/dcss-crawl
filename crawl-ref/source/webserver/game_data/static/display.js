define(["jquery", "comm", "./map_knowledge", "./view_data", "./monster_list",
        "./minimap", "./dungeon_renderer", "./floating_events", "./examination_card",
        "./player", "./cell_renderer"],
function ($, comm, map_knowledge, view_data, monster_list, minimap,
          dungeon_renderer, floating_events, examination_card, player, cr) {
    "use strict";

    // Message indicating any invisible monsters nearby whose location was
    // never known to the player.
    var inv_mons_msg;

    var hero_renderer = new cr.DungeonCellRenderer();

    function draw_hero_sprite(canvas, draw, padding)
    {
        var ratio = window.devicePixelRatio || 1;
        var offset = Math.round(padding * ratio);
        var size = Math.round((32 + 2 * padding) * ratio);
        if (canvas.width !== size || canvas.height !== size)
            canvas.width = canvas.height = size;
        hero_renderer.set_cell_size(32, 32);
        hero_renderer.init(canvas);
        hero_renderer.ctx.clearRect(0, 0, size, size);
        draw(offset);
    }

    function update_hero_portrait()
    {
        var canvas = $("#hero_portrait")[0];
        if (!canvas || !map_knowledge.player_on_level())
            return;

        var cell = map_knowledge.get(player.pos.x, player.pos.y);
        if (!cell.t || !cell.t.doll || !cell.t.doll.length)
            return;

        draw_hero_sprite(canvas, function (offset) {
            for (var part of cell.t.doll)
                hero_renderer.draw_player(part[0], offset, offset, 0, 0, part[1]);
        }, 4);
    }

    $(document).on("hero_position_update", update_hero_portrait)
        .on("hero_equipment_update", function () {
            $("#hero_armament canvas:not([hidden])").each(function () {
                var tiles = $(this).data("tiles");
                draw_hero_sprite(this, function () {
                    for (var tile of tiles)
                        hero_renderer.draw_main(tile, 0, 0);
                }, 0);
            });
        });

    function invalidate(minimap_too)
    {
        var b = map_knowledge.bounds();
        if (!b) return;

        var view = dungeon_renderer.view;

        var xs = minimap_too ? b.left : view.x;
        var ys = minimap_too ? b.top : view.y;
        var xe = minimap_too ? b.right : view.x + dungeon_renderer.cols - 1;
        var ye = minimap_too ? b.bottom : view.y + dungeon_renderer.rows - 1;
        for (var x = xs; x <= xe; x++)
            for (var y = ys; y <= ye; y++)
        {
            map_knowledge.touch(x, y);
        }
    }

    function display()
    {
        // Update the display.
        if (!map_knowledge.bounds())
            return;

        var t1 = new Date();

        if (map_knowledge.reset_bounds_changed())
            minimap.center();

        var dirty_locs = map_knowledge.dirty();
        for (var i = 0; i < dirty_locs.length; i++)
        {
            var loc = dirty_locs[i];
            var cell = map_knowledge.get(loc.x, loc.y);
            cell.dirty = false;
            monster_list.update_loc(loc);
            dungeon_renderer.render_loc(loc.x, loc.y, cell);
            minimap.update(loc.x, loc.y, cell);
        }
        map_knowledge.reset_dirty();

        dungeon_renderer.animate();

        monster_list.update(inv_mons_msg);

        var render_time = (new Date() - t1);
        if (!window.render_times)
            window.render_times = [];
        if (window.render_times.length >= 20)
            window.render_times.shift();
        window.render_times.push(render_time);
    }

    function clear_map()
    {
        floating_events.clear();
        examination_card.clear();
        map_knowledge.clear();

        dungeon_renderer.clear();

        minimap.clear();

        monster_list.clear();

        inv_mons_msg = "";
    }

    // Message handlers
    function handle_map_message(data)
    {
        if (data.clear)
            clear_map();

        if (data.player_on_level != null)
            map_knowledge.set_player_on_level(data.player_on_level);

        if (data.vgrdc)
            minimap.do_view_center_update(data.vgrdc.x, data.vgrdc.y);

        if (data.cells)
            map_knowledge.merge(data.cells);

        update_hero_portrait();
        examination_card.onMapChange(data);

        if ("invis_mon_desc" in data)
            inv_mons_msg = data.invis_mon_desc;

        // Mark cells overlapped by dirty cells as dirty
        $.each(map_knowledge.dirty().slice(), function (i, loc) {
            var cell = map_knowledge.get(loc.x, loc.y);
            // high cell
            if (cell.t && cell.t.sy && cell.t.sy < 0)
                map_knowledge.touch(loc.x, loc.y - 1);
            // left overlap
            if (cell.t && cell.t.left_overlap && cell.t.left_overlap < 0)
            {
                map_knowledge.touch(loc.x - 1, loc.y);
                // If we overlap at both top *and* left, we may additionally
                // overlap diagonally.
                if (cell.t.sy && cell.t.sy < 0)
                    map_knowledge.touch(loc.x - 1, loc.y - 1);
            }
        });

        display();
    }

    function handle_vgrdc(data)
    {
    }

    comm.register_handlers({
        "map": handle_map_message,
    });

    return {
        invalidate: invalidate,
        display: display,
    };
});
