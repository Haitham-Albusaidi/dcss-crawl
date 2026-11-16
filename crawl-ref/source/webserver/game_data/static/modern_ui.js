/**
 * Elden Ring & Souls-like Immersive HUD for Dungeon Crawl Stone Soup (WebTiles)
 * Replaces clunky dashboard panels with a sleek floating action dock and diegetic fantasy aesthetics.
 */
define(["jquery", "comm", "client"], function ($, comm, client) {
    "use strict";

    var PRIMARY_SLOTS = [
        { id: "autoexplore", icon: "🧭", label: "Auto-Explore", key: "o", desc: "Automap and explore level, collect safe items, and halt immediately on monster threats." },
        { id: "autofight", icon: "⚔️", label: "Auto-Fight", key: "Tab", keycode: 9, desc: "Attack adjacent enemy or step towards closest visible foe." },
        { id: "rest", icon: "💤", label: "Rest / Heal", key: "5", desc: "Rest in place until HP and MP are fully restored or danger appears." },
        { id: "cast", icon: "🪄", label: "Cast Spell", key: "z", desc: "Open spell grimoire to choose and cast memorised incantations." },
        { id: "ability", icon: "⚡", label: "Invoke Talent", key: "a", desc: "Unleash divine God powers, racial gifts, and supernatural mutations." },
        { id: "fire", icon: "🏹", label: "Quiver / Fire", key: "f", desc: "Fire quivered missile, wand, or targeted spell at lock-on target." },
        { id: "inventory", icon: "🎒", label: "Equipment Bag", key: "i", desc: "Inspect inventory items, weapons, armor, jewels, and consumables." },
        { id: "use", icon: "🧪", label: "Drink / Read", key: "e", desc: "Quaff healing elixir, read arcane scroll, or use magical talisman." },
        { id: "map", icon: "🗺️", label: "Dungeon Map", key: "X", desc: "Unfurl full floor map to view discovered rooms and click-travel." },
        { id: "examine", icon: "👁️", label: "Examine / Look", key: "x", desc: "Target cursor to inspect enemy stats, vulnerabilities, and floor tiles." },
        { id: "upstairs", icon: "🪜", label: "Ascend Stairs", key: "<", desc: "Ascend staircase or egress hatch to previous dungeon floor." },
        { id: "downstairs", icon: "🪜", label: "Descend Stairs", key: ">", desc: "Descend staircase deeper into the perilous dungeon depths." },
        { id: "wait", icon: "⏳", label: "Wait Turn", key: ".", desc: "Wait in place for 1 turn (passes time for buffs or enemy approach)." }
    ];

    var DRAWER_SLOTS = [
        { id: "skills", icon: "📊", label: "Skills Training", key: "m", desc: "Train weapon masteries, fighting, magic schools, and stealth." },
        { id: "sheet", icon: "📜", label: "Character Profile", key: "%", desc: "View attributes, resistances (rF, rC, rElec, rPois), AC, EV, and SH." },
        { id: "religion", icon: "⛩️", label: "Divine Altar / God", key: "^", desc: "Review piety rating, divine boons, passive prayers, and divine wrath." },
        { id: "mutations", icon: "🧬", label: "Mutations", key: "A", desc: "Review demonic, innate, and potion-induced mutations and boons." },
        { id: "messages", icon: "💬", label: "Chronicle Log", key: "M", desc: "Review full battle log and history of dungeon events." },
        { id: "find", icon: "🔍", label: "Search Memory", key: "f", ctrlKey: true, desc: "Search entire dungeon memory for items, altars, shops, or portals." },
        { id: "overview", icon: "🏰", label: "Dungeon Overview", key: "o", ctrlKey: true, desc: "Overview of discovered branches, depths, runes of Zot, and shops." },
        { id: "pickup", icon: "📥", label: "Pick Up", key: ",", desc: "Pick up item from current ground tile into your backpack." },
        { id: "drop", icon: "📤", label: "Drop Item", key: "d", desc: "Drop selected items from inventory onto current tile." },
        { id: "help", icon: "❓", label: "Guide & Hotkeys", key: "?", desc: "Open comprehensive in-game manual and keybinding compendium." },
        { id: "save", icon: "💾", label: "Save & Quit", key: "s", ctrlKey: true, desc: "Save progress safely and return to title screen." }
    ];

    var DPAD_COMPASS = [
        { label: "↖", key: "y", desc: "Northwest (y / 7)" },
        { label: "↑", key: "k", desc: "North (k / 8)" },
        { label: "↗", key: "u", desc: "Northeast (u / 9)" },
        { label: "←", key: "h", desc: "West (h / 4)" },
        { label: "•", key: ".", desc: "Wait Turn (5 / .)" },
        { label: "→", key: "l", desc: "East (l / 6)" },
        { label: "↙", key: "b", desc: "Southwest (b / 1)" },
        { label: "↓", key: "j", desc: "South (j / 2)" },
        { label: "↘", key: "n", desc: "Southeast (n / 3)" }
    ];

    var show_dpad = false;
    var show_drawer = false;
    var $dock = null;
    var $tooltip = null;

    function send_game_command(action) {
        if (client.is_watching && client.is_watching())
            return;

        var code;
        if (action.keycode) {
            code = action.keycode;
        } else if (action.ctrlKey && action.key) {
            var rawKey = action.key.replace(/^ctrl\+/i, "");
            code = rawKey.toUpperCase().charCodeAt(0) - 64;
        } else if (action.key && action.key.length === 1) {
            code = action.key.charCodeAt(0);
        } else if (typeof action === "string") {
            code = action.charCodeAt(0);
        }

        if (code !== undefined) {
            if (window.socket && window.socket.readyState === 1) {
                window.socket.send('{"msg":"key","keycode":' + code + '}');
            } else if (comm && comm.send_message) {
                comm.send_message("key", { keycode: code });
            }
        }
    }

    function create_slot(item, extraClass) {
        var $slot = $('<button type="button" class="elden-slot ' + (extraClass || '') + '"></button>');
        $slot.data("action", item);

        var displayKey = item.ctrlKey ? "^" + item.key.toUpperCase() : item.key;
        $slot.html(
            '<span class="elden-slot-icon">' + item.icon + '</span>' +
            '<span class="elden-slot-badge">' + displayKey + '</span>'
        );
        return $slot;
    }

    function create_dom() {
        if ($("#elden-action-dock").length > 0) {
            $("#elden-action-dock").remove();
        }

        $dock = $('<div id="elden-action-dock" class="elden-dock"></div>');
        var $inner = $('<div class="elden-dock-inner"></div>');

        // 1. Primary Action Row (Always sleek floating at center-bottom)
        var $primaryRow = $('<div class="elden-slots-row"></div>');
        $.each(PRIMARY_SLOTS, function (i, item) {
            $primaryRow.append(create_slot(item));
        });

        // Compass / D-Pad button
        var $dpadToggle = $(
            '<button type="button" class="elden-slot elden-toggle-slot" id="elden-dpad-toggle" title="Toggle 8-Way Movement Compass">' +
            '  <span class="elden-slot-icon">🧭</span>' +
            '  <span class="elden-slot-badge">DIR</span>' +
            '</button>'
        );
        $primaryRow.append($dpadToggle);

        // More Drawer button
        var $moreToggle = $(
            '<button type="button" class="elden-slot elden-toggle-slot" id="elden-more-toggle" title="Toggle Full Grimoire & Tools">' +
            '  <span class="elden-slot-icon">📜</span>' +
            '  <span class="elden-slot-badge">MORE</span>' +
            '</button>'
        );
        $primaryRow.append($moreToggle);

        // 2. Secondary Tray Drawer (Expands smoothly above)
        var $drawer = $('<div class="elden-drawer hidden" id="elden-drawer"></div>');
        var $drawerGrid = $('<div class="elden-drawer-grid"></div>');
        $.each(DRAWER_SLOTS, function (i, item) {
            var $itemBtn = $(
                '<button type="button" class="elden-drawer-item">' +
                '  <span class="item-icon">' + item.icon + '</span>' +
                '  <span class="item-label">' + item.label + '</span>' +
                '  <span class="item-kbd">' + (item.ctrlKey ? "Ctrl+" + item.key.toUpperCase() : item.key) + '</span>' +
                '</button>'
            );
            $itemBtn.data("action", item);
            $drawerGrid.append($itemBtn);
        });
        $drawer.append($drawerGrid);

        // 3. Floating 8-Directional D-Pad Popover
        var $dpadPopover = $('<div class="elden-dpad-popover hidden" id="elden-dpad-popover"></div>');
        var $dpadGrid = $('<div class="elden-dpad-grid"></div>');
        $.each(DPAD_COMPASS, function (i, d) {
            var $btn = $('<button type="button" class="elden-compass-btn">' + d.label + '</button>');
            $btn.data("action", { key: d.key, desc: d.desc });
            $dpadGrid.append($btn);
        });
        $dpadPopover.append($dpadGrid);

        $inner.append($drawer).append($dpadPopover).append($primaryRow);
        $dock.append($inner);

        // Append directly to body so it floats independently over canvas
        $("body").append($dock);

        // Tooltip
        if ($("#elden-tooltip").length === 0) {
            $tooltip = $('<div id="elden-tooltip" class="elden-tooltip"></div>');
            $("body").append($tooltip);
        } else {
            $tooltip = $("#elden-tooltip");
        }

        bind_events();
    }

    function bind_events() {
        // Click action execution
        $dock.on("click", ".elden-slot:not(.elden-toggle-slot), .elden-drawer-item, .elden-compass-btn", function (e) {
            var action = $(this).data("action");
            if (action) {
                var $el = $(this);
                $el.addClass("elden-active");
                setTimeout(function () { $el.removeClass("elden-active"); }, 150);
                send_game_command(action);
            }
        });

        // Toggle D-Pad
        $dock.find("#elden-dpad-toggle").on("click", function (e) {
            e.stopPropagation();
            show_dpad = !show_dpad;
            $(this).toggleClass("active", show_dpad);
            $dock.find("#elden-dpad-popover").toggleClass("hidden", !show_dpad);
            if (show_dpad && show_drawer) {
                show_drawer = false;
                $dock.find("#elden-drawer").addClass("hidden");
                $dock.find("#elden-more-toggle").removeClass("active");
            }
        });

        // Toggle More Drawer
        $dock.find("#elden-more-toggle").on("click", function (e) {
            e.stopPropagation();
            show_drawer = !show_drawer;
            $(this).toggleClass("active", show_drawer);
            $dock.find("#elden-drawer").toggleClass("hidden", !show_drawer);
            if (show_drawer && show_dpad) {
                show_dpad = false;
                $dock.find("#elden-dpad-popover").addClass("hidden");
                $dock.find("#elden-dpad-toggle").removeClass("active");
            }
        });

        // Hover Tooltip
        $dock.on("mouseenter", ".elden-slot, .elden-drawer-item, .elden-compass-btn", function () {
            var action = $(this).data("action");
            if (!action || !action.desc) return;

            var offset = $(this).offset();
            var title = action.label || "Action";
            var keyStr = action.ctrlKey ? "Ctrl+" + action.key.toUpperCase() : (action.key || "");

            $tooltip.html(
                '<div class="elden-tooltip-header">' +
                '  <span class="elden-tooltip-title">' + (action.icon ? action.icon + ' ' : '') + title + '</span>' +
                (keyStr ? '  <span class="elden-tooltip-badge">' + keyStr + '</span>' : '') +
                '</div>' +
                '<div class="elden-tooltip-body">' + action.desc + '</div>'
            );

            var top = offset.top - $tooltip.outerHeight() - 10;
            var left = offset.left + ($(this).outerWidth() / 2) - ($tooltip.outerWidth() / 2);
            if (left < 12) left = 12;
            if (left + $tooltip.outerWidth() > $(window).width() - 12) {
                left = $(window).width() - $tooltip.outerWidth() - 12;
            }

            $tooltip.css({ top: top + "px", left: left + "px" }).addClass("visible");
        });

        $dock.on("mouseleave", ".elden-slot, .elden-drawer-item, .elden-compass-btn", function () {
            $tooltip.removeClass("visible");
        });
    }

    function init() {
        create_dom();
    }

    $(document).ready(function () {
        init();
    });

    $(document).bind("game_init", function () {
        init();
    });

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 50);
    }

    return {
        init: init,
        send_key: send_game_command
    };
});
