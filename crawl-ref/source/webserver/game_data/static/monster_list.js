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

    var topRenderer = null;

    function getTopTargetCard()
    {
        var $card = $("#top_target_card");
        if ($card.length === 0)
        {
            $card = $(
                '<div id="top_target_card" class="er-top-mon-card" hidden>' +
                '  <div class="er-target-avatar-box"><canvas class="er-target-canvas"></canvas></div>' +
                '  <div class="er-target-main">' +
                '    <div class="er-target-header">' +
                '      <span class="er-target-name">Monster Name</span>' +
                '      <div class="er-target-tags">' +
                '        <span class="er-target-dist">⚔️ Melee</span>' +
                '        <span class="er-target-badge">💀 UNIQUE</span>' +
                '      </div>' +
                '    </div>' +
                '    <div class="er-target-hp-track">' +
                '      <div class="er-target-hp-fill"></div>' +
                '    </div>' +
                '    <div class="er-target-footer">' +
                '      <span class="er-target-hp-text">100% • Uninjured</span>' +
                '      <span class="er-target-avg-hp"></span>' +
                '      <span class="er-target-status" style="display:none;"></span>' +
                '      <span class="er-target-nearby-count" style="display:none;"></span>' +
                '    </div>' +
                '  </div>' +
                '</div>'
            );
            $("#monster_hud").prepend($card);
        }
        return $card;
    }

    function update_top_target_card(grouped_monsters, show_inv)
    {
        var $card = getTopTargetCard();
        if (show_inv)
        {
            $card.removeClass("mon-unique mon-nasty mon-tough mon-friendly").addClass("mon-nasty mon-unseen");
            $card.off("click contextmenu");
            $card.find(".er-target-name").text(show_inv);
            $card.find(".er-target-badge").text("👁️ UNSEEN").removeClass("badge-unique badge-tough badge-friendly").addClass("badge-nasty").show();
            $card.find(".er-target-dist").text("⚠️ Proximity").removeClass("dist-melee").addClass("dist-ranged");
            $card.find(".er-target-hp-fill").css("width", "100%").removeClass().addClass("er-target-hp-fill hp-uninjured");
            $card.find(".er-target-hp-text").text("Location Unknown");
            $card.find(".er-target-avg-hp").text("");
            $card.find(".er-target-status, .er-target-nearby-count").hide();
            $card.prop("hidden", false);
            return;
        }

        if (!grouped_monsters || grouped_monsters.length === 0)
        {
            $card.prop("hidden", true);
            return;
        }

        // Rank monsters to pick the primary threat for the top card:
        // Priority: Uniques > Highest threat level (3 -> 2 -> 1) > Proximity to player
        var px = (player && player.pos && player.pos.x !== undefined) ? player.pos.x : 0;
        var py = (player && player.pos && player.pos.y !== undefined) ? player.pos.y : 0;

        var bestGroup = null;
        var bestScore = -999999;
        var totalOtherMonsters = 0;

        for (var g = 0; g < grouped_monsters.length; g++)
        {
            var grp = grouped_monsters[g];
            if (!grp || grp.length === 0) continue;
            var m = grp[0].mon;
            var loc = grp[0].loc;
            var isUnique = m.hasOwnProperty("clientid");
            var dx = Math.abs(loc.x - px);
            var dy = Math.abs(loc.y - py);
            var dist = Math.max(dx, dy);

            // Hostile priority: hostile (0) > neutral (1) > friendly (4)
            var attPriority = (m.att === 0 ? 1000 : (m.att === 1 ? 200 : 0));
            var threatPriority = (m.threat || 0) * 100;
            var uniquePriority = isUnique ? 500 : 0;
            var distBonus = Math.max(0, 30 - dist); // closer = higher priority

            var score = attPriority + threatPriority + uniquePriority + distBonus;
            if (score > bestScore)
            {
                bestScore = score;
                bestGroup = grp;
            }
            totalOtherMonsters += grp.length;
        }

        if (!bestGroup || bestGroup.length === 0)
        {
            $card.prop("hidden", true);
            return;
        }

        var primary = bestGroup[0];
        var mon = primary.mon;
        var mloc = primary.loc;
        var dx = Math.abs(mloc.x - px);
        var dy = Math.abs(mloc.y - py);
        var dist = Math.max(dx, dy);

        // Render pixel-art sprite avatar
        var canvas = $card.find(".er-target-canvas")[0];
        if (!topRenderer)
        {
            topRenderer = new cr.DungeonCellRenderer();
        }
        util.init_canvas(canvas, 32, 32);
        topRenderer.set_cell_size(32, 32);
        topRenderer.init(canvas);
        topRenderer.render_cell(mloc.x, mloc.y, 0, 0);

        // Name
        var mName = (bestGroup.length > 1) ? (bestGroup.length + " " + mon.plural) : mon.name;
        $card.find(".er-target-name").text(mName);

        // Distance Indicator
        var $dist = $card.find(".er-target-dist");
        if (dist <= 1)
        {
            $dist.text("⚔️ Melee Range").removeClass("dist-ranged").addClass("dist-melee");
        }
        else
        {
            $dist.text("🏹 " + dist + " tiles away").removeClass("dist-melee").addClass("dist-ranged");
        }

        // Threat badge
        var isUnique = mon.hasOwnProperty("clientid");
        var threatLevel = mon.threat || 0;
        var $badge = $card.find(".er-target-badge");
        if (isUnique)
        {
            $badge.text("💀 UNIQUE BOSS").removeClass("badge-nasty badge-tough badge-friendly").addClass("badge-unique").show();
        }
        else if (threatLevel === 3)
        {
            $badge.text("⚠️ NASTY").removeClass("badge-unique badge-tough badge-friendly").addClass("badge-nasty").show();
        }
        else if (threatLevel === 2)
        {
            $badge.text("⚡ TOUGH").removeClass("badge-unique badge-nasty badge-friendly").addClass("badge-tough").show();
        }
        else if (mon.att === 4)
        {
            $badge.text("🌿 ALLY").removeClass("badge-unique badge-nasty badge-tough").addClass("badge-friendly").show();
        }
        else
        {
            var badgeLabel = mon.att === 0 ? mthreat_classes[threatLevel] : "Neutral";
            $badge.text(badgeLabel || "Hostile")
                  .removeClass("badge-unique badge-nasty badge-tough badge-friendly").show();
        }

        // Health Status & Meter
        var map_cell = map_knowledge.get(mloc.x, mloc.y);
        var fg = (map_cell && map_cell.t && map_cell.t.fg) || {};
        var mdam = "uninjured";
        var hpPercent = 100;
        var hpLabel = "100% • Uninjured";
        if (fg.MDAM_ADEAD) { mdam = "almost_dead"; hpPercent = 10; hpLabel = "Critical (~10%)"; }
        else if (fg.MDAM_SEV) { mdam = "severely_damaged"; hpPercent = 25; hpLabel = "Severely Wounded (~25%)"; }
        else if (fg.MDAM_HEAVY) { mdam = "heavily_damaged"; hpPercent = 50; hpLabel = "Heavily Wounded (~50%)"; }
        else if (fg.MDAM_MOD) { mdam = "moderately_damaged"; hpPercent = 70; hpLabel = "Moderately Wounded (~70%)"; }
        else if (fg.MDAM_LIGHT) { mdam = "lightly_damaged"; hpPercent = 85; hpLabel = "Lightly Wounded (~85%)"; }

        $card.find(".er-target-hp-fill")
            .css("width", hpPercent + "%")
            .removeClass("hp-uninjured hp-lightly_damaged hp-moderately_damaged hp-heavily_damaged hp-severely_damaged hp-almost_dead")
            .addClass("hp-" + mdam);

        $card.find(".er-target-hp-text").text(hpLabel);

        // Show one tactical condition to keep the banner compact.
        var status = "";
        if (fg.PARALYSED)
            status = "Paralysed";
        else if (fg.NET || fg.WEB)
            status = "Held";
        else if (fg.FLEEING)
            status = "Fleeing";
        else if (fg.POISON || fg.MORE_POISON || fg.MAX_POISON)
            status = "Poisoned";
        $card.find(".er-target-status").text(status).toggle(status !== "");

        // Average HP if known
        var $avgHp = $card.find(".er-target-avg-hp");
        if (mon.typedata && mon.typedata.avghp)
        {
            $avgHp.text("~" + mon.typedata.avghp + " Avg HP").show();
        }
        else
        {
            $avgHp.hide();
        }

        // Other nearby monsters count
        var remainingCount = totalOtherMonsters - bestGroup.length;
        var $nearby = $card.find(".er-target-nearby-count");
        if (remainingCount > 0)
        {
            $nearby.text("+" + remainingCount + " more nearby").show();
        }
        else
        {
            $nearby.hide();
        }

        // Card theming classes
        $card.removeClass("mon-unseen")
             .toggleClass("mon-unique", !!isUnique)
             .toggleClass("mon-nasty", threatLevel === 3)
             .toggleClass("mon-tough", threatLevel === 2)
             .toggleClass("mon-friendly", mon.att === 4);

        // Click targeting & inspection
        $card.off("click contextmenu");
        $card.on("click", function(ev) {
            comm.send_message("click_cell", {
                x: mloc.x,
                y: mloc.y,
                button: 1
            });
        });
        $card.on("contextmenu", function(ev) {
            ev.preventDefault();
            comm.send_message("click_cell", {
                x: mloc.x,
                y: mloc.y,
                button: 3
            });
            return false;
        });

        $card.prop("hidden", false);
    }

    function update(show_inv)
    {
        var grouped_monsters = group_monsters();
        update_top_target_card(grouped_monsters, show_inv);

        var rows = Math.min(grouped_monsters.length, max_rows);
        if (show_inv)
            rows++;
        var $roster = $("#monster_roster");
        $roster.prop("hidden", rows < 2);
        if (rows < 2)
            $roster.prop("open", false);

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
            let group;
            var canvas, renderer;

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
        $("#top_target_card").prop("hidden", true);
        $("#monster_roster").prop({hidden: true, open: false});
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
