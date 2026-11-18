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
        { id: "skills", icon: "📊", label: "Skills Training", key: "m", badge: "m", desc: "Train weapon masteries, fighting, magic schools, and stealth." },
        { id: "sheet", icon: "📜", label: "Character Profile", key: "%", badge: "%", desc: "View attributes, resistances (rF, rC, rElec, rPois), AC, EV, and SH." },
        { id: "religion", icon: "⛩️", label: "Divine Altar / God", key: "^", badge: "^", desc: "Review piety rating, divine boons, passive prayers, and divine wrath." },
        { id: "mutations", icon: "🧬", label: "Mutations", key: "A", badge: "A", desc: "Review demonic, innate, and potion-induced mutations and boons." },
        { id: "messages", icon: "💬", label: "Chronicle Log", key: "p", ctrlKey: true, badge: "Ctrl+P", desc: "Review full battle log and history of dungeon events." },
        { id: "find", icon: "🔍", label: "Search Memory", key: "f", ctrlKey: true, badge: "Ctrl+F", desc: "Search entire dungeon memory for items, altars, shops, or portals." },
        { id: "overview", icon: "🏰", label: "Dungeon Overview", key: "o", ctrlKey: true, badge: "Ctrl+O", desc: "Overview of discovered branches, depths, runes of Zot, and shops." },
        { id: "pickup", icon: "📥", label: "Pick Up", key: ",", badge: ",", desc: "Pick up item from current ground tile into your backpack." },
        { id: "drop", icon: "📤", label: "Drop Item", key: "d", badge: "d", desc: "Drop selected items from inventory onto current tile." },
        { id: "known", icon: "✨", label: "Known Items", key: "\\", badge: "\\", desc: "Review identified weapons, armour, jewellery, and runes of Zot." },
        { id: "help", icon: "❓", label: "Guide & Hotkeys", key: "?", badge: "?", desc: "Open comprehensive in-game manual and keybinding compendium." },
        { id: "save", icon: "💾", label: "Save & Quit", key: "s", ctrlKey: true, badge: "Ctrl+S", desc: "Save progress safely and return to title screen." }
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

        // If any modal/menu is currently open, dismiss it first
        if ($(".menu:visible").length > 0 || $(".ui-popup:visible").length > 0) {
            comm.send_message("key", { keycode: 27 }); // Esc
        }

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
            if (comm && comm.send_message) {
                comm.send_message("key", { keycode: code });
            } else if (window.socket && window.socket.readyState === 1) {
                window.socket.send('{"msg":"key","keycode":' + code + '}');
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
        var $drawer = $(
            '<div class="elden-drawer hidden" id="elden-drawer">' +
            '  <div class="elden-drawer-header">' +
            '    <div class="elden-drawer-title"><span class="drawer-header-icon">📜</span> COMMAND GRIMOIRE &amp; UTILITIES</div>' +
            '    <div class="elden-drawer-actions">' +
            '      <span class="elden-drawer-hint">Click card or press key</span>' +
            '      <button type="button" class="elden-drawer-close" id="elden-drawer-close" title="Close (Esc)">✕ Esc</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="elden-drawer-grid"></div>' +
            '</div>'
        );
        var $drawerGrid = $drawer.find(".elden-drawer-grid");
        $.each(DRAWER_SLOTS, function (i, item) {
            var badgeText = item.badge || (item.ctrlKey ? "Ctrl+" + item.key.toUpperCase() : item.key);
            var $itemBtn = $(
                '<button type="button" class="elden-drawer-item" data-id="' + item.id + '">' +
                '  <span class="item-icon-box">' + item.icon + '</span>' +
                '  <span class="item-label">' + item.label + '</span>' +
                '  <span class="item-kbd">' + badgeText + '</span>' +
                '</button>'
            );
            $itemBtn.data("action", item);
            $drawerGrid.append($itemBtn);
        });

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
        function close_drawer() {
            show_drawer = false;
            $dock.find("#elden-drawer").addClass("hidden");
            $dock.find("#elden-more-toggle").removeClass("active");
            $tooltip.removeClass("visible");
        }

        function close_dpad() {
            show_dpad = false;
            $dock.find("#elden-dpad-popover").addClass("hidden");
            $dock.find("#elden-dpad-toggle").removeClass("active");
        }

        // Close button inside drawer header
        $dock.on("click", "#elden-drawer-close", function (e) {
            e.stopPropagation();
            close_drawer();
        });

        // Click on drawer item: executes command and dismisses drawer
        $dock.on("click", ".elden-drawer-item", function (e) {
            var action = $(this).data("action");
            if (action) {
                var $el = $(this);
                $el.addClass("elden-active");
                setTimeout(function () { $el.removeClass("elden-active"); }, 150);
                close_drawer();
                send_game_command(action);
            }
        });

        // Click on primary slot / compass btn
        $dock.on("click", ".elden-slot:not(.elden-toggle-slot), .elden-compass-btn", function (e) {
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
                close_drawer();
            }
        });

        // Toggle More Drawer
        $dock.find("#elden-more-toggle").on("click", function (e) {
            e.stopPropagation();
            show_drawer = !show_drawer;
            $(this).toggleClass("active", show_drawer);
            $dock.find("#elden-drawer").toggleClass("hidden", !show_drawer);
            if (show_drawer && show_dpad) {
                close_dpad();
            }
        });

        // Physical Keyboard listener for drawer
        $(document).off("keydown.elden_drawer").on("keydown.elden_drawer", function (e) {
            if (!show_drawer) return;

            // Escape closes drawer
            if (e.which === 27) {
                e.preventDefault();
                e.stopPropagation();
                close_drawer();
                return false;
            }

            // Route keypress to matching drawer action
            for (var i = 0; i < DRAWER_SLOTS.length; i++) {
                var item = DRAWER_SLOTS[i];
                var matches = false;

                if (item.ctrlKey) {
                    if (e.ctrlKey && !e.altKey) {
                        var targetCode = item.key.toUpperCase().charCodeAt(0);
                        if (e.which === targetCode) {
                            matches = true;
                        }
                    }
                } else {
                    if (!e.ctrlKey && !e.altKey) {
                        if (item.key === "%" && e.shiftKey && (e.which === 53 || e.key === "%")) {
                            matches = true;
                        } else if (item.key === "^" && e.shiftKey && (e.which === 54 || e.key === "^")) {
                            matches = true;
                        } else if (item.key === "A" && e.shiftKey && (e.which === 65 || e.key === "A")) {
                            matches = true;
                        } else if (item.key === "?" && (e.key === "?" || (e.shiftKey && e.which === 191))) {
                            matches = true;
                        } else if (item.key === "\\" && (e.key === "\\" || e.which === 220)) {
                            matches = true;
                        } else if (item.key === "," && (e.key === "," || e.which === 188)) {
                            matches = true;
                        } else if (item.key === "m" && !e.shiftKey && (e.which === 77 || e.key === "m")) {
                            matches = true;
                        } else if (item.key === "d" && !e.shiftKey && (e.which === 68 || e.key === "d")) {
                            matches = true;
                        }
                    }
                }

                if (matches) {
                    e.preventDefault();
                    e.stopPropagation();
                    close_drawer();
                    send_game_command(item);
                    return false;
                }
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
