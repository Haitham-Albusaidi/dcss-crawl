define(["jquery", "comm", "client", "./enums", "./map_knowledge", "./messages",
        "./options", "./util", "./keybinds"],
function ($, comm, client, enums, map_knowledge, messages, options, util, keybinds) {
    "use strict";

    var player = {}, last_time;

    var stat_boosters = {
        "str": "vitalised",
        "int": "vitalised",
        "dex": "vitalised",
        "hp": "divinely vigorous|berserking",
        "mp": "divinely vigorous"
    };

    function percent(value, max)
    {
        return max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
    }

    function meter(value, max, survival)
    {
        var width = percent(value, max);
        var projected = max > 0 && Number.isFinite(survival) && survival < value
            ? Math.max(0, survival) : null;
        var safe = projected === null ? width : percent(projected, max);
        return {
            width: safe,
            poison: width - safe,
            projected: projected,
            state: max <= 0 || width > 60 ? "healthy"
                : width >= 30 ? "injured" : "critical"
        };
    }

    function crest(data)
    {
        var rank = Math.max(0, Math.min(6, data.piety_rank || 0));
        var lost = Math.max(0, Math.min(6 - rank, data.ostracism_pips || 0));
        var piety = "";
        var label = "";
        if (data.god === "Xom")
        {
            var tension = data.piety_rank;
            piety = Number.isInteger(tension) && tension >= 0 && tension < 6
                ? "\u25cb".repeat(tension) + "\u25c6" + "\u25cb".repeat(5 - tension)
                : "\u25cb".repeat(6);
            label = "Xom's interest";
        }
        else if (data.god !== "Gozag" && (data.god || rank))
        {
            piety = "\u2605".repeat(rank) + "\u2606".repeat(6 - rank - lost)
                + "\u00d7".repeat(lost);
            label = data.god ? "Piety " + rank + " of 6"
                : "Monk starting piety " + rank + " of 6";
            if (lost)
                label += ", " + lost + " lost to ostracism";
        }
        if (data.penance)
            label += " (under penance)";
        return {
            name: data.name,
            lineage: [data.species_display_name || data.species, data.background]
                .filter(Boolean).join(" "),
            deity: data.god || "Atheist",
            piety: piety,
            pietyLabel: label,
            gozagGold: data.god === "Gozag" ? data.gold + " gold" : ""
        };
    }

    function noise_meter(noise, silenced)
    {
        return {
            width: silenced ? 0 : percent(noise, 1000),
            label: silenced ? "Silenced" : noise <= 333 ? "Quiet"
                : noise <= 666 ? "Loud" : "Very loud"
        };
    }

    function attribute(value, max)
    {
        return value < max ? value + " (" + max + ")" : String(value);
    }

    function progression(xl, progress)
    {
        return {
            label: xl >= 27 ? "Max" : "Next " + progress + "%",
            width: xl >= 27 ? 100 : percent(progress, 100)
        };
    }

    function index_to_letter(index)
    {
        if (index === -1)
            return "-"
        else if (index < 26)
            return String.fromCharCode("a".charCodeAt(0) + index);
        else
            return String.fromCharCode("A".charCodeAt(0) + index - 26);
    }
    player.index_to_letter = index_to_letter;

    function inventory_item_desc(index, parens=false, colour=-1)
    {
        var item = player.inv[index];
        var elem = $("<span>");
        if (parens)
            elem.text("(" + item.name + ")");
        else
            elem.text(item.name);

        if (colour != -1)
            elem.addClass("fg" + colour);
        else if (item.col != -1 && item.col != null)
            elem.addClass("fg" + item.col);
        return elem;
    }
    player.inventory_item_desc = inventory_item_desc;

    function equipment(item, fallback, stack)
    {
        if (!item || item.quantity <= 0 || !item.name)
            return {name: fallback, tiles: [], ego: "", quantity: ""};

        // The inventory name, tiles and known ego are identification-aware
        // server fields. Raw pluses, flags and item subtypes are not used.
        return {
            name: item.name,
            tiles: Array.isArray(item.tile) ? item.tile : [],
            ego: item.known_ego || "",
            quantity: stack && item.quantity > 0 ? "\u00d7" + item.quantity : "",
            slot: item.slot
        };
    }

    function status_pill(status)
    {
        var text = status.text || status.light || "";
        var labels = {
            Pois: "Poisoned", Conf: "Confused", Sil: "Silenced",
            Invis: "Invisible", Fly: "Flight"
        };
        var danger = /^(confused|paraly|petrif|silenc|asleep|sleeping|held)/i;
        var warning = /^(slow|hasted and slowed)|backlit and visible/i;
        var benefit = /^(berserk|fast|haste|invis|flight|flying|vitalis|divinely vigorous)/i;
        var severity = status.light === "Pois" || status.light === "Sil" || danger.test(text) ? "danger"
            : warning.test(text) ? "warning"
            : benefit.test(text) ? "beneficial"
            : [4, 12].includes(status.col) ? "danger"
            : [1, 2, 3, 9, 10, 11].includes(status.col)
                ? "beneficial" : "warning";
        return {
            label: Object.prototype.hasOwnProperty.call(labels, status.light)
                ? labels[status.light] : status.light,
            severity: severity,
            description: status.desc || ""
        };
    }

    player.has_status_light = function (status_light, col)
    {
        for (var i = 0; i < player.status.length; ++i)
        {
            if (player.status[i].light &&
                player.status[i].light.match(status_light) &&
                (col == null || player.status[i].col == col))
                return true;
        }
        return false;
    }
    player.has_status = function (status_name, col)
    {
        for (var i = 0; i < player.status.length; ++i)
        {
            if (player.status[i].text &&
                player.status[i].text.match(status_name) &&
                (col == null || player.status[i].col == col))
                return true;
        }
        return false;
    }
    player.incapacitated = function incapacitated()
    {
        // FIXME: does this cover all ATTR_HELD cases?
        return player.has_status("paralysed|petrified|sleeping")
               || player.has_status("confused")
               || player.has_status("held", 4);
    }

    function update_defense(type)
    {
        var modifier = player[type + "_mod"];
        $("#stats_" + type).text(player[type])
            .toggleClass("boosted_defense", modifier > 0)
            .toggleClass("degenerated_defense", modifier < 0);
    }

    function stat_class(stat)
    {
        var val = player[stat];
        var max_val = player[stat + "_max"];
        if (val <= 0 || player.has_status("lost " + stat))
            return "zero_stat";

        var limits = options.get("stat_colour")
        for (var i in limits)
            if (val <= limits[i].value)
                return "colour_" + limits[i].colour;

        if (player.has_status(stat_boosters[stat]))
            return "boosted_stat";

        if (val < max_val)
            return "degenerated_stat";

        return "";
    }

    function update_stat(stat)
    {
        var elem = $("<span>").text(attribute(player[stat], player[stat + "_max"]));
        elem.addClass(stat_class(stat));
        $("#stats_" + stat).html(elem);
    }

    function update_doom()
    {
        if (player.doom == 0 && options.get("always_show_doom_contam") === false)
        {
            $("#stats_doom_ui").hide();
            return;
        }
        else
            $("#stats_doom_ui").show();

        var val = player["doom"];
        var elem = $("<span>");
        elem.text(" " + val + "%");

        var colour = "fg7";
        if (player.doom == 0)
            colour = "fg8";
        if (player.doom >= 75)
            colour = "fg5";
        else if (player.doom >= 50)
            colour = "fg12";
        else if (player.doom >= 25)
            colour = "fg14";

        elem.addClass(colour);
        $("#stats_doom").html(elem);
        $("#stats_doom_ui").attr("title",
            $("<span>").html(util.formatted_string_to_html(player.doom_desc || "")).text());
    }

    function update_contam()
    {
        if (player.contam == 0 && options.get("always_show_doom_contam") === false)
        {
            $("#stats_contam_ui").hide();
            return;
        }
        else
            $("#stats_contam_ui").show();

        var val = player.contam;
        var elem = $("<span>");
        elem.text(" " + val + "%");

        var colour = "fg8";
        if (val >= 200)
            colour = "fg4";
        else if (val >= 100)
            colour = "fg14";
        elem.addClass(colour);
        $("#stats_contam").html(elem);
    }

    function percentage_color(name)
    {
        var real = false;
        // There is only real_hp_max, real_mp_max doesn't exist
        if (player["real_" + name + "_max"]
            && player["real_" + name + "_max"] != player[name + "_max"])
            real = true;

        $("#stats_" + name).removeClass();
        $("#stats_" + name + "_separator").removeClass();
        $("#stats_" + name + "_max").removeClass();
        if (real)
            $("#stats_real_" + name + "_max").removeClass();

        if (player.has_status(stat_boosters[name]))
        {
            $("#stats_" + name).addClass("boosted_stat");
            $("#stats_" + name + "_separator").addClass("boosted_stat");
            $("#stats_" + name + "_max").addClass("boosted_stat");
            if (real)
                $("#stats_real_" + name + "_max").addClass("boosted_stat");
            return;
        }

        var val = player[name] / player[(real ? "real_" : "") + name + "_max"]
                  * 100;
        var limits = options.get(name + "_colour");
        var colour = null;
        for (var i in limits)
            if (val <= limits[i].value)
                colour = limits[i].colour;

        if (colour)
            $("#stats_" + name).addClass("colour_" + colour);
    }

    function update_vitals()
    {
        for (var name of ["hp", "mp"])
        {
            var value = player[name];
            var max = player[name + "_max"];
            var gauge = meter(value, max, name === "hp" ? player.poison_survival : null);
            $("#stats_" + name).text(value);
            $("#stats_" + name + "_max").text(max);
            $("#stats_" + name + "_bar_full").css("width", gauge.width + "%");
            percentage_color(name);
            if (name === "hp")
            {
                $("#stats_hpline").attr("data-health", gauge.state);
                $("#stats_hp_bar_poison").css({left: gauge.width + "%", width: gauge.poison + "%"});
                $("#hero_poison_preview").prop("hidden", gauge.projected === null)
                    .text(gauge.projected === null ? "" : gauge.projected + " HP after poison");
            }
        }
        $("#stats_real_hp_max").text(player.real_hp_max && player.real_hp_max !== player.hp_max
            ? "(" + player.real_hp_max + ")" : "");
        $("#stats_dd_real_mp_max").text(player.dd_real_mp_max && player.dd_real_mp_max !== player.mp_max
            ? "(" + player.dd_real_mp_max + ")" : "");
        $("#stats_mpline").prop("hidden", player.species === "Djinni");
    }

    function update_deck()
    {
        ["str", "int", "dex"].forEach(update_stat);
        ["ac", "ev", "sh"].forEach(update_defense);
        update_doom();
        update_contam();

        var xp = progression(player.xl, player.progress);
        $("#stats_xl").text(player.xl);
        $("#stats_progress").text(xp.label);
        $("#hero_xl_fill").css("width", xp.width + "%");

        var silenced = player.has_status("silence");
        var noise = noise_meter(player.adjusted_noise, silenced);
        $("#stats_noise").attr("data-noise", noise.label);
        $("#stats_noise_status").text(noise.label);
        $("#stats_noise_num").text(player.wizard && !silenced ? " (" + player.noise + ")" : "");
        $("#stats_noise_bar_full").css("width", noise.width + "%");

        $("#hero_gold").text(player.gold);
        $("#hero_gold_badge").prop("hidden", player.god === "Gozag");
        $("#stats_place").text(player.place + (player.depth ? ":" + player.depth : ""));
        $("#cartographer_place").text(player.place + (player.depth ? ": " + player.depth : ""));

        var time = options.get("show_game_time") === true;
        var delta = player.time_delta ? " (" + (player.time_delta / 10).toFixed(1) + ")" : "";
        $("#stats_time_caption").text(time ? "Time" : "Turn");
        $("#stats_time").text((time ? (player.time / 10).toFixed(1) : player.turn) + delta);
    }

    function keep_hud_keys_local(ev)
    {
        if (["Tab", "Enter", " ", "Escape"].includes(ev.key))
            ev.stopPropagation();
        if (ev.key === "Escape" && ev.type === "keydown")
            ev.currentTarget.blur();
    }

    var displayed_status;
    function update_status_effects()
    {
        if (displayed_status === player.status)
            return;

        displayed_status = player.status;
        var $list = $("#stats_status_lights").empty();
        var $tooltip = $("#stats_status_lights_tooltip").prop("hidden", true);
        var statuses = player.status;
        if (player.has_status("silence") && !player.has_status_light(/^Sil$/))
        {
            statuses = statuses.concat({
                light: "Sil",
                desc: "Silence prevents spellcasting and other actions that require sound."
            });
        }
        for (var status of statuses)
        {
            if (!status.light)
                continue;

            let pill = status_pill(status);
            let $pill = $(pill.description ? '<button type="button">' : "<span>")
                .addClass("er-badge hero_status").attr("data-severity", pill.severity);
            if (status.use_html)
                $pill.html(util.formatted_string_to_html(status.light));
            else
                $pill.text(pill.label);

            if (pill.description)
            {
                $pill.attr("aria-describedby", "stats_status_lights_tooltip");
                $pill.on("focus click mouseenter", () => {
                    var anchor = $pill[0].getBoundingClientRect();
                    $tooltip.html(util.formatted_string_to_html(pill.description))
                        .prop("hidden", false);
                    var width = $tooltip.outerWidth();
                    var height = $tooltip.outerHeight();
                    $tooltip.css({
                        left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
                        top: anchor.bottom + height + 8 < window.innerHeight
                            ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4)
                    });
                }).on("blur", () => $tooltip.prop("hidden", true))
                    .on("mouseleave", () => {
                        if (!$pill.is(":focus"))
                            $tooltip.prop("hidden", true);
                    }).on("keydown keypress", keep_hud_keys_local);
            }
            $list.append($pill);
        }
        $("#hero_status_effects").prop("hidden", !$list.children().length);
    }

    function update_armament()
    {
        var offhand = player.offhand_index >= 0 ? player.offhand_index : player.shield_index;
        var slots = {
            weapon: equipment(player.inv[player.weapon_index], player.unarmed_attack || "Unarmed"),
            offhand_weapon: equipment(player.inv[offhand], "Empty offhand"),
            quiver: equipment(player.inv[player.quiver_item], "Empty quiver", true)
        };

        // Non-item actions (e.g. spells and abilities) have no inventory slot.
        if (player.quiver_desc)
            $("#stats_quiver").html(util.formatted_string_to_html(player.quiver_desc));
        else
            $("#stats_quiver").text(slots.quiver.name);

        for (var name in slots)
        {
            let slot = slots[name];
            let $card = $("#stats_" + name + "_container");
            if (name !== "quiver")
                $("#stats_" + name).text(slot.name);
            var $details = $card.find(".hero_equipment_details").empty();
            if (slot.ego)
                $details.append($("<span>").addClass("er-badge").text(slot.ego));
            if (slot.quantity)
                $details.append($("<span>").addClass("er-badge").text(slot.quantity));
            if (Number.isInteger(slot.slot) && name !== "quiver")
                $details.append(keybinds.badge(index_to_letter(slot.slot)));

            $card.find("canvas").prop("hidden", !slot.tiles.length).data("tiles", slot.tiles);
            $card.prop("disabled", !Number.isInteger(slot.slot) || client.is_watching())
                .data("slot", slot.slot ?? null);
        }
        $(document).triggerHandler("hero_equipment_update");
    }

    function update_stats_pane()
    {
        var identity = crest(player);
        $("#stats_titleline").text(identity.name).attr("title", (player.title || "").trim());
        $("#stats_species_god").text(identity.lineage);
        $("#stats_god").text(identity.deity);
        $("#stats_piety").text(identity.piety).attr("title", identity.pietyLabel)
            .attr("aria-label", identity.pietyLabel).toggleClass("penance", !!player.penance);
        $("#stats_gozag_gold").text(identity.gozagGold)
            .toggleClass("boosted_stat", player.has_status("gold aura"));
        var mode = player.wizard ? "Wizard" : player.explore ? "Explore" : "";
        $("#stats_wizmode").text(mode).prop("hidden", !mode);

        update_vitals();
        update_deck();
        update_status_effects();
        update_armament();
    }

    function handle_player_message(data)
    {
        for (var i in data.inv)
        {
            if (data.inv[i].quantity === 0)
                delete player.inv[i];
            player.inv[i] = $.extend(player.inv[i] || {}, data.inv[i]);
            player.inv[i].slot = Number(i); // XX why is i a string?
            player.inv[i].letter = index_to_letter(player.inv[i].slot);
        }

        if (data.inv)
        {
            $("#action-panel").triggerHandler("update");
            $("#tiles_tab_panel").triggerHandler("update");
            $(document).trigger("dcss_inv_update");
        }

        delete data.inv;
        delete data.msg;

        $.extend(player, data);

        // chick if a forced player update has given us an explicit last
        // time to show in the hud for spectators (only). Otherwise, this value
        // is calculated on the client-side. (XX this works somewhat differently
        // than the console/tiles view; reconcile?)
        if ("time_last_input" in data)
        {
            // currently this message should *only* happen for spectators, but
            // just to be sure..
            // we don't want to do anything on this message to players,
            // because the server value can get out of sync with what the js
            // client is showing.
            if (client.is_watching())
                player.time_delta = player.time - player.time_last_input;

            last_time = player.time;
        }
        else if ("time" in data)
        {
            if (last_time)
                player.time_delta = player.time - last_time;

            last_time = player.time;
            messages.new_command(true);
        }

        update_stats_pane();
        if ("pos" in data)
            $(document).triggerHandler("hero_position_update");

        if ("hp" in data || "hp_max" in data ||
            "mp" in data || "mp_max" in data)
        {
            map_knowledge.touch(player.pos);
            $("#dungeon").trigger("update_cells", [[player.pos]]);
        }
    }

    options.add_listener(function ()
    {
        if (player.name !== "")
            update_stats_pane();

        if (options.get("tile_font_stat_size") === 0)
            $("#stats").css("font-size", "");
        else
        {
            $("#stats").css("font-size",
                options.get("tile_font_stat_size") + "px");
        }

        var family = options.get("tile_font_stat_family");
        if (family !== "" && family !== "monospace")
            document.documentElement.style.setProperty("--stat-font", family + ", monospace");
        else
            document.documentElement.style.removeProperty("--stat-font");
    });

    comm.register_handlers({
        "player": handle_player_message,
    });

    $(document).off("game_init.player")
        .on("game_init.player", function () {
            $.extend(player, {
                name: "", god: "", title: "", species: "",
                species_display_name: "", background: "",
                hp: 0, hp_max: 0, real_hp_max: 0, poison_survival: null,
                mp: 0, mp_max: 0, dd_real_mp_max: 0,
                ac: 0, ev: 0, sh: 0,
                ac_mod: 0, ev_mod: 0, sh_mod: 0,
                xl: 0, progress: 0,
                time: 0, time_delta: 0,
                gold: 0,
                str: 0, int: 0, dex: 0,
                str_max: 0, int_max: 0, dex_max: 0,
                piety_rank: 0, penance: false, ostracism_pips: 0,
                status: [],
                inv: {},
                weapon_index: -1,
                offhand_index: -1, shield_index: -1,
                weapon_colour: 0,
                offhand_weapon_colour: 0,
                quiver_item: -1, quiver_desc: "",
                unarmed_attack: "",
                pos: {x: 0, y: 0},
                wizard: 0, explore: 0,
                depth: 0, place: "", turn: 0,
                doom: 0, doom_desc: "", contam: 0,
                noise: 0,
                adjusted_noise: 0
            });
            displayed_status = null;
            last_time = null;

            $("#hero_armament").off(".heroHUD")
                .on("click.heroHUD", ".hero_equipment", function () {
                    var slot = $(this).data("slot");
                    if (!client.is_watching() && Number.isInteger(slot))
                        comm.send_message("inv_item_describe", {slot: slot});
                }).on("keydown.heroHUD keypress.heroHUD", ".hero_equipment", keep_hud_keys_local);
            $("#right_column").off("scroll.heroHUD").on("scroll.heroHUD", () =>
                $("#stats_status_lights_tooltip").prop("hidden", true));
        });

    return player;
});
