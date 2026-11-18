define(["jquery", "comm", "./map_knowledge", "./cell_renderer", "./dungeon_renderer",
        "./options", "./util", "./player", "./tileinfo-main"],
function ($, comm, map_knowledge, cr, dungeon_renderer, options, util, player, main) {
    "use strict";

    var monsters, $list, monster_groups, max_rows;

    function init()
    {
        monsters = {};
        $list = $("#monster_list");
        monster_groups = [];
        max_rows = 5;
    }
    $(document).bind("game_init", init);

    function update_loc(loc)
    {
        var map_cell = map_knowledge.get(loc.x, loc.y);
        var mon = map_cell.mon;
        if (mon && map_knowledge.visible(map_cell))
            monsters[[loc.x,loc.y]] = { mon: mon, loc: loc };
        else
            delete monsters[[loc.x,loc.y]];
    }

    function can_combine(monster1, monster2)
    {
        return (monster_sort(monster1, monster2) == 0);
    }

    function is_excluded(monster)
    {
        return (monster.typedata.no_exp &&
                !(monster.name == "active ballistomycete"
                  || monster.name.match(/tentacle$/)));
    }

    function monster_sort(m1, m2)
    {
        // Compare monster_info::less_than
        if (m1.att < m2.att)
            return -1;
        else if (m1.att > m2.att)
            return 1;

        if (m1.typedata.avghp > m2.typedata.avghp)
            return -1;
        else if (m1.typedata.avghp < m2.typedata.avghp)
            return 1;

        if (m1.type < m2.type)
            return 1;
        else if (m1.type > m2.type)
            return -1;

        // don't sort two same-name monsters together
        var m1Named = m1.hasOwnProperty("clientid");
        var m2Named = m2.hasOwnProperty("clientid");
        if (m1Named || m2Named)
        {
            if (!m2Named)
                return -1;
            if (!m1Named)
                return 1;
            if (m1.clientid < m2.clientid)
                return -1;
            return 1;
        }

        if (m1.name < m2.name)
            return 1;
        else if (m1.name > m2.name)
            return -1;

        return 0;
    }

    function group_monsters()
    {
        var monster_list = [];

        for (var loc in monsters)
        {
            if (is_excluded(monsters[loc].mon)) continue;
            monster_list.push(monsters[loc]);
        }

        monster_list.sort(function (m1, m2) {
            return monster_sort(m1.mon, m2.mon);
        });

        var new_monster_groups = [];
        var last_monster_group;
        for (var i = 0; i < monster_list.length; ++i)
        {
            var entry = monster_list[i];
            if (last_monster_group
                && can_combine(last_monster_group[0].mon, entry.mon))
            {
                last_monster_group.push(entry);
            }
            else
            {
                last_monster_group = [monster_list[i]];
                new_monster_groups.push(last_monster_group);
            }
        }

        return new_monster_groups;
    }

    // These need to be updated when the respective enums change
    var attitude_classes = [
        "hostile",
        "neutral",
        "good_neutral", // was strict_neutral
        "good_neutral",
        "friendly"
    ];
    var mthreat_classes = [
        "trivial",
        "easy",
        "tough",
        "nasty",
        "invisible"
    ];

    function update(show_inv)
    {
        var grouped_monsters = group_monsters();

        var rows = Math.min(grouped_monsters.length, max_rows);
        if (show_inv)
            rows++;

        var i = 0;
        for (; i < rows; ++i)
        {
            var monsters;

            // If there are unknown invisible monsters nearby, insert the text
            // description of them as the first entry in the monster list
            // (meaning every other row is slightly desynced from grouped_monsters)
            if (show_inv && i > 0)
                monsters = grouped_monsters[i-1];
            else
                monsters = grouped_monsters[i];
            var group, canvas, renderer;

            if (i >= monster_groups.length)
            {
                // Create a new modern threat card row
                var node = $("<div class='mon-card group'>\
                                <div class='mon-avatar-box'><canvas class='picture'></canvas></div>\
                                <div class='mon-info-box'>\
                                    <div class='mon-header-row'>\
                                        <span class='name'></span>\
                                        <span class='threat-badge'></span>\
                                    </div>\
                                    <div class='mon-hp-track'><div class='mon-hp-bar'></div></div>\
                                </div>\
                              </div>");
                $list.append(node);
                canvas = node.find("canvas")[0];
                renderer = new cr.DungeonCellRenderer();
                group = {
                    node: node,
                    canvas: canvas,
                    renderer: renderer,
                    health_span: node.find(".mon-hp-bar"),
                    name_span: node.find(".name"),
                    badge_span: node.find(".threat-badge"),
                    monsters: monsters,
                };

                // Click on threat card to target or examine monster
                node.on("click", function (ev) {
                    if (group.monsters && group.monsters.length > 0) {
                        var m = group.monsters[0];
                        if (m && m.loc) {
                            comm.send_message("click_cell", {
                                x: m.loc.x,
                                y: m.loc.y,
                                button: 1
                            });
                        }
                    }
                });
                node.on("contextmenu", function (ev) {
                    ev.preventDefault();
                    if (group.monsters && group.monsters.length > 0) {
                        var m = group.monsters[0];
                        if (m && m.loc) {
                            comm.send_message("click_cell", {
                                x: m.loc.x,
                                y: m.loc.y,
                                button: 3
                            });
                        }
                    }
                    return false;
                });

                monster_groups.push(group);
            }
            else
            {
                // Reuse the existing row
                group = monster_groups[i];
                canvas = group.canvas;
                renderer = group.renderer;
                group.monsters = monsters;
            }

            // Print unknown invisible monsters as the first entry of the list.
            if (show_inv && i == 0)
            {
                util.init_canvas(canvas, renderer.cell_width, dungeon_renderer.cell_height);
                renderer.init(canvas);
                renderer.draw_main(main.UNSEEN_INVISIBLE, 0, 0, 1);
                var invis_desc = util.formatted_string_to_html("<magenta>" + show_inv + "</magenta>");
                group.name_span.html(invis_desc);
                group.badge_span.text("👁️ UNSEEN").removeClass("badge-unique badge-tough badge-friendly").addClass("badge-nasty").show();
                group.health_span.css("width", "100%").removeClass().addClass("mon-hp-bar hp-uninjured");
                continue;
            }

            renderer.set_cell_size(dungeon_renderer.cell_width,
                                   dungeon_renderer.cell_height);
            if (options.get("tile_display_mode") != "tiles")
            {
                for (var key in dungeon_renderer)
                {
                    // dungeon_renderer.ui_state is also required so the glyph
                    // size returned by the renderer.glyph_mode_font_name()
                    // correctly reflects the 'tile_map_scale'
                    if (key.match(/^glyph_mode/) || key == "ui_state")
                        renderer[key] = dungeon_renderer[key];
                }
            }
            var w = renderer.cell_width;
            var displayed_monsters = Math.min(monsters.length, 6);
            var needed_width = w * displayed_monsters;
            if ((canvas.style.width != needed_width)
                || (canvas.style.height != dungeon_renderer.cell_height))
            {
                util.init_canvas(canvas, needed_width,
                                         dungeon_renderer.cell_height);
                renderer.init(canvas);
            }

            for (var j = 0; j < displayed_monsters; ++j)
            {
                renderer.render_cell(monsters[j].loc.x, monsters[j].loc.y,
                                     j * w, 0);
            }

            // Damage and HP calculation for visual health bar
            var map_cell = map_knowledge.get(monsters[0].loc.x, monsters[0].loc.y);
            var fg = (map_cell && map_cell.t) ? map_cell.t.fg : {};
            var mdam = "uninjured";
            var hpPercent = 100;
            if (fg.MDAM_ADEAD) { mdam = "almost_dead"; hpPercent = 12; }
            else if (fg.MDAM_SEV) { mdam = "severely_damaged"; hpPercent = 28; }
            else if (fg.MDAM_HEAVY) { mdam = "heavily_damaged"; hpPercent = 50; }
            else if (fg.MDAM_MOD) { mdam = "moderately_damaged"; hpPercent = 70; }
            else if (fg.MDAM_LIGHT) { mdam = "lightly_damaged"; hpPercent = 88; }

            group.health_span
                .css("width", hpPercent + "%")
                .removeClass("hp-uninjured hp-lightly_damaged hp-moderately_damaged hp-heavily_damaged hp-severely_damaged hp-almost_dead")
                .addClass("hp-" + mdam);

            var threatLevel = monsters[0].mon.threat;
            var isUnique = monsters[0].mon.hasOwnProperty("clientid");
            var badgeText = "";
            var badgeCls = "";
            if (isUnique) {
                badgeText = "💀 UNIQUE";
                badgeCls = "badge-unique";
            } else if (threatLevel === 3) {
                badgeText = "⚠️ NASTY";
                badgeCls = "badge-nasty";
            } else if (threatLevel === 2) {
                badgeText = "⚡ TOUGH";
                badgeCls = "badge-tough";
            } else if (monsters[0].mon.att === 4) {
                badgeText = "🌿 ALLY";
                badgeCls = "badge-friendly";
            }

            if (badgeText) {
                group.badge_span
                    .text(badgeText)
                    .removeClass("badge-unique badge-nasty badge-tough badge-friendly")
                    .addClass(badgeCls)
                    .show();
            } else {
                group.badge_span.hide();
            }

            group.node.toggleClass("mon-unique", !!isUnique)
                      .toggleClass("mon-nasty", threatLevel === 3)
                      .toggleClass("mon-tough", threatLevel === 2)
                      .toggleClass("mon-friendly", monsters[0].mon.att === 4);

            if (monsters.length == 1)
            {
                group.name_span.text(monsters[0].mon.name);
            }
            else
            {
                group.name_span.text(monsters.length + " " + monsters[0].mon.plural);
            }

            $.each(attitude_classes, function (i, cls) {
                group.name_span.removeClass(cls);
            });
            $.each(mthreat_classes, function (i, cls) {
                group.name_span.removeClass(cls);
            });
            group.name_span.addClass(attitude_classes[monsters[0].mon.att]);
            group.name_span.addClass(mthreat_classes[monsters[0].mon.threat]);

            var ellipse = group.node.find(".ellipse");
            if ((i == rows - 1) && (rows < grouped_monsters.length))
            {
                if (ellipse.size() == 0)
                    group.node.append("<span class='ellipse'>...</span>");
            }
            else
                ellipse.remove();
        }

        for (; i < monster_groups.length; ++i)
        {
            monster_groups[i].node.remove();
        }
        monster_groups = monster_groups.slice(0, rows);
    }

    function set_max_rows(x)
    {
        max_rows = x;
    }

    function clear()
    {
        $list.empty();
        monster_groups = [];
        monsters = {};
    }

    options.add_listener(function ()
    {
        if (options.get("tile_font_lbl_size") === 0)
            $("#monster_list").css("font-size", "");
        else
        {
            $("#monster_list").css("font-size",
                options.get("tile_font_lbl_size") + "px");
        }

        var family = options.get("tile_font_lbl_family");
        if (family !== "" && family !== "monospace")
        {
            family += ", monospace";
            document.documentElement.style.setProperty("--lbl-font", family);
        }
    });

    return {
        update_loc: update_loc,
        update: update,
        set_max_rows: set_max_rows,
        clear: clear,
        get: function () { return monster_groups; }
    };
});
