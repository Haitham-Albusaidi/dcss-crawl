/**
 * Elden Ring & Souls-like Immersive HUD for Dungeon Crawl Stone Soup (WebTiles)
 * Replaces clunky dashboard panels with a sleek floating action dock and diegetic fantasy aesthetics.
 */
define(["jquery", "comm", "client", "./keybinds", "./cell_renderer", "./util", "./tileinfo-gui"], function ($, comm, client, keybinds, cr, util, gui) {
    "use strict";

    var PRIMARY_SLOTS = [
        { id: "autoexplore", tile: gui.CMD_EXPLORE, label: "Auto-Explore", key: "o", desc: "Automap and explore level, collect safe items, and halt immediately on monster threats." },
        { id: "autofight", tile: gui.CMD_AUTOFIGHT, label: "Auto-Fight", key: "Tab", keycode: 9, desc: "Attack adjacent enemy or step towards closest visible foe." },
        { id: "pickup", tile: gui.CMD_MAP_FIND_STASH, label: "Pick Up Floor", key: ",", desc: "Choose items on your tile to pick up." },
        { id: "rest", tile: gui.CMD_REST, label: "Rest / Heal", key: "5", desc: "Rest in place until HP and MP are fully restored or danger appears." },
        { id: "cast", tile: gui.CMD_CAST_SPELL, label: "Cast Spell", key: "z", desc: "Open spell grimoire to choose and cast memorised incantations." },
        { id: "ability", tile: gui.CMD_USE_ABILITY, label: "Use Ability", key: "a", desc: "Unleash divine God powers, racial gifts, and supernatural mutations." },
        { id: "fire", tile: gui.CMD_AUTOFIGHT, label: "Fire Quivered Action", key: "f", desc: "Fire quivered missile, wand, or targeted spell at lock-on target." },
        { id: "inventory", tile: gui.CMD_DISPLAY_INVENTORY, label: "Inventory", key: "i", desc: "Inspect inventory items, weapons, armor, jewels, and consumables." },
        { id: "use", tile: gui.CMD_DISPLAY_INVENTORY, label: "Equip Item", key: "e", desc: "Choose an item to equip." },
        { id: "map", tile: gui.CMD_DISPLAY_MAP, label: "Dungeon Map", key: "X", desc: "Unfurl full floor map to view discovered rooms and click-travel." },
        { id: "examine", tile: gui.CMD_MAP_GOTO_TARGET, label: "Examine / Look", key: "x", desc: "Target cursor to inspect enemy stats, vulnerabilities, and floor tiles." },
        { id: "upstairs", tile: gui.CMD_MAP_FIND_UPSTAIR, label: "Ascend Stairs", key: "<", desc: "Ascend staircase or egress hatch to previous dungeon floor." },
        { id: "downstairs", tile: gui.CMD_MAP_FIND_DOWNSTAIR, label: "Descend Stairs", key: ">", desc: "Descend staircase deeper into the perilous dungeon depths." },
        { id: "wait", tile: gui.CMD_WAIT, label: "Wait Turn", key: ".", desc: "Wait in place for 1 turn (passes time for buffs or enemy approach)." }
    ];

    var DRAWER_SLOTS = [
        { id: "skills", icon: "📊", label: "Skills Training", key: "m", desc: "Train weapon masteries, fighting, magic schools, and stealth." },
        { id: "sheet", icon: "📜", label: "Character Profile", key: "%", desc: "View attributes, resistances (rF, rC, rElec, rPois), AC, EV, and SH." },
        { id: "religion", icon: "⛩️", label: "Divine Altar / God", key: "^", desc: "Review piety rating, divine boons, passive prayers, and divine wrath." },
        { id: "mutations", icon: "🧬", label: "Mutations", key: "A", desc: "Review demonic, innate, and potion-induced mutations and boons." },
        { id: "messages", icon: "💬", label: "Chronicle Log", key: "p", ctrlKey: true, desc: "Review full battle log and history of dungeon events." },
        { id: "find", icon: "🔍", label: "Search Memory", key: "f", ctrlKey: true, desc: "Search entire dungeon memory for items, altars, shops, or portals." },
        { id: "overview", icon: "🏰", label: "Dungeon Overview", key: "o", ctrlKey: true, desc: "Overview of discovered branches, depths, runes of Zot, and shops." },
        { id: "pickup", icon: "📥", label: "Pick Up Floor", key: ",", desc: "Choose items on your tile to pick up." },
        { id: "drop", icon: "📤", label: "Drop Item", key: "d", desc: "Drop selected items from inventory onto current tile." },
        { id: "known", icon: "✨", label: "Known Items", key: "\\", desc: "Review identified weapons, armour, jewellery, and runes of Zot." },
        { id: "help", icon: "❓", label: "Guide & Hotkeys", key: "?", desc: "Open comprehensive in-game manual and keybinding compendium." },
        { id: "save", icon: "💾", label: "Save & Quit", key: "s", ctrlKey: true, desc: "Save progress safely and return to title screen." }
    ];

    var DPAD_COMPASS = [
        { label: "↖", key: "y", desc: "Northwest (y / 7)" },
        { label: "↑", key: "k", desc: "North (k / 8)" },
        { label: "↗", key: "u", desc: "Northeast (u / 9)" },
        { label: "←", key: "h", desc: "West (h / 4)" },
        { label: "•", key: ".", desc: "Wait Turn (. / s)" },
        { label: "→", key: "l", desc: "East (l / 6)" },
        { label: "↙", key: "b", desc: "Southwest (b / 1)" },
        { label: "↓", key: "j", desc: "South (j / 2)" },
        { label: "↘", key: "n", desc: "Southeast (n / 3)" }
    ];

    var show_dpad = false;
    var show_drawer = false;
    var $dock = null;
    var $tooltip = null;
    var drawerKeydown = null;

    function send_game_command(action) {
        if (client.is_watching && client.is_watching())
            return;

        var code = keybinds.commandCode(typeof action === "string" ? { key: action } : action);
        if (!code)
            return;

        if ($(".menu:visible, .ui-popup:visible").length)
            comm.send_message("key", { keycode: 27 });
        comm.send_message("key", { keycode: code });
    }

    function create_slot(item) {
        var $slot = $('<button type="button" class="elden-slot">')
            .data("action", item).attr("aria-label", item.label);
        var $icon = $('<canvas class="elden-slot-icon" aria-hidden="true">');
        util.init_canvas($icon[0], 32, 32);
        var $tilesheet = $("#" + gui.get_img(item.tile));
        function drawIcon() {
            var renderer = new cr.DungeonCellRenderer();
            renderer.init($icon[0]);
            renderer.draw_gui(item.tile, 0, 0);
        }
        if ($tilesheet[0] && $tilesheet[0].naturalWidth)
            drawIcon();
        else
            $tilesheet.one("load", drawIcon);
        return $slot.append($icon, keybinds.badge(keybinds.commandLabel(item)).addClass("elden-slot-key"));
    }

    function create_dom() {
        if ($("#elden-action-dock").length > 0) {
            $("#elden-action-dock").remove();
        }

        $dock = $('<div id="elden-action-dock" class="elden-dock" role="group" aria-label="Action dock" aria-keyshortcuts="Alt+Shift+D"></div>');
        var $inner = $('<div class="elden-dock-inner"></div>');

        // Primary action row in the space reserved below the dungeon.
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
        $dpadToggle.removeAttr("title").attr("aria-label", "Movement Compass")
            .data("action", {label: "Movement Compass", desc: "Show the eight movement directions."});
        $primaryRow.append($dpadToggle);

        // More Drawer button
        var $moreToggle = $(
            '<button type="button" class="elden-slot elden-toggle-slot" id="elden-more-toggle" title="Toggle Full Grimoire & Tools">' +
            '  <span class="elden-slot-icon">📜</span>' +
            '  <span class="elden-slot-badge">MORE</span>' +
            '</button>'
        );
        $moreToggle.removeAttr("title").attr("aria-label", "More Actions")
            .data("action", {label: "More Actions", desc: "Open skills, character tools, and game commands."});
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
            var $itemBtn = $(
                '<button type="button" class="elden-drawer-item" data-id="' + item.id + '">' +
                '  <span class="item-icon-box">' + item.icon + '</span>' +
                '  <span class="item-label">' + item.label + '</span>' +
                keybinds.html(keybinds.commandLabel(item)) +
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
            $btn.attr("aria-label", d.desc)
                .data("action", {key: d.key, label: d.desc.split(" (")[0]});
            $dpadGrid.append($btn);
        });
        $dpadPopover.append($dpadGrid);

        $inner.append($drawer).append($dpadPopover).append($primaryRow);
        $dock.append($inner);

        $("#action_dock_row").append($dock);

        // Tooltip
        if ($("#elden-tooltip").length === 0) {
            $tooltip = $('<div id="elden-tooltip" class="elden-tooltip" aria-hidden="true"></div>');
            $("body").append($tooltip);
        } else {
            $tooltip = $("#elden-tooltip").removeClass("visible");
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
            $tooltip.removeClass("visible");
        }

        // Let focused dock buttons use native navigation and activation.
        $dock.on("keydown", "button", function (e) {
            var key = (e.originalEvent || e).key;
            if (key === "Tab" || key === "Enter" || key === " ")
                e.stopPropagation();
            else if (key === "Escape" && !show_drawer) {
                e.stopPropagation();
                if (show_dpad)
                    close_dpad();
                this.blur();
                $tooltip.removeClass("visible");
            }
        });

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
        if (drawerKeydown)
            document.removeEventListener("keydown", drawerKeydown, true);
        drawerKeydown = function (e) {
            if ($(e.target).is("input, textarea, [contenteditable]")
                || $(".ui-popup:visible, .menu:visible").length)
                return;

            if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey
                && e.code === "KeyD" && $("#normal").is(":visible")) {
                e.preventDefault();
                $dock.find(".elden-slots-row button").first().focus();
                return;
            }
            if (!show_drawer) return;

            // Escape closes drawer
            if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopImmediatePropagation();
                close_drawer();
                return false;
            }

            // Route keypress to matching drawer action
            for (var i = 0; i < DRAWER_SLOTS.length; i++) {
                var item = DRAWER_SLOTS[i];
                if (keybinds.matches(e, item)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    close_drawer();
                    send_game_command(item);
                    return false;
                }
            }
        };
        document.addEventListener("keydown", drawerKeydown, true);

        var tooltip_targets = ".elden-slot, .elden-drawer-item, .elden-compass-btn";
        $dock.on("mouseenter focusin", tooltip_targets, function () {
            var action = $(this).data("action");
            if (!action) return;

            var key = keybinds.commandLabel(action);
            var $header = $('<div class="elden-tooltip-header"></div>')
                .append($('<span class="elden-tooltip-title"></span>').text(action.label));
            if (key)
                $header.append(keybinds.badge(key));
            $tooltip.empty().append($header);
            if (action.desc)
                $tooltip.append($('<div class="elden-tooltip-body"></div>').text(action.desc));

            var rect = this.getBoundingClientRect();
            var width = $tooltip.outerWidth();
            var top = rect.top - $tooltip.outerHeight() - 10;
            if (top < 12)
                top = rect.bottom + 10;
            var left = Math.max(12, Math.min(rect.left + (rect.width - width) / 2,
                $(window).width() - width - 12));

            $tooltip.css({ top: top + "px", left: left + "px" }).addClass("visible");
        });

        $dock.on("mouseleave focusout", tooltip_targets, function (e) {
            if (e.type === "mouseleave" ? !this.matches(":focus-visible") : !this.matches(":hover"))
                $tooltip.removeClass("visible");
        });
    }

    function init() {
        show_drawer = false;
        show_dpad = false;
        create_dom();
    }

    $(document).on("game_cleanup.modern_ui", function () {
        if (drawerKeydown)
            document.removeEventListener("keydown", drawerKeydown, true);
        drawerKeydown = null;
        if ($tooltip)
            $tooltip.removeClass("visible");
    });

    return {
        init: init,
        send_key: send_game_command
    };
});
