define(["jquery", "comm", "client", "./keybinds", "./cell_renderer", "./util",
        "./tileinfo-gui"], function ($, comm, client, keybinds, cr, util, gui) {
    "use strict";

    var dock = { can_use: function () { return false; } };
    var state, mp;
    var slots = [];

    function disabled(slot, currentMP) {
        return !slot.available || slot.mp > currentMP || !/^[a-z]$/i.test(slot.letter);
    }

    function dispatch(button, kind, slot) {
        if (client.is_watching() || !dock.can_use()
            || (slot && disabled(slot, mp)))
            return;

        // Give Enter and Space back to the native targeting or menu prompt.
        button.blur();
        // Keep the native command and its selection in one request. The
        // server runs the selected command through Crawl's input loop.
        comm.send_message("quick_cast", {
            kind: kind, letter: slot ? slot.letter : "", id: slot ? slot.id : -1
        });
    }

    function draw_icon(canvas, tile) {
        util.init_canvas(canvas, 32, 32);
        var sheet = $("#" + gui.get_img(tile));
        function draw() {
            if (!canvas.isConnected)
                return;
            var renderer = new cr.DungeonCellRenderer();
            renderer.init(canvas);
            renderer.draw_gui(tile, 0, 0);
        }
        if (sheet[0] && sheet[0].naturalWidth)
            draw();
        else
            sheet.one("load", draw);
    }

    function render_slot(group, kind, prefix, slot) {
        var icon = $("<canvas class='arcane-icon' aria-hidden='true'>")[0];
        var label = slot.name + ", " + slot.cost + ", " + slot.failure + "% failure";
        if (prefix && slot.letter)
            label += ", " + prefix + " then " + slot.letter;
        var button = $("<button type='button' class='arcane-slot'>")
            .attr({ title: label, "aria-label": label })
            .on("click", function () { dispatch(this, kind, slot); });
        var keys = $("<span class='arcane-keys' aria-hidden='true'>");
        if (prefix && slot.letter)
            keys.append(keybinds.badge(prefix), keybinds.badge(slot.letter));
        button.append(icon, $("<span class='arcane-name'>").text(slot.name),
            $("<span class='arcane-cost'>").text(slot.cost),
            $("<span class='arcane-failure'>").text(slot.failure + "%")
                .append($("<span class='arcane-failure-label'>").text(" fail")), keys);
        group.append(button);
        draw_icon(icon, slot.tile);
        slots.push({ button: button, slot: slot });
    }

    function render() {
        var bar = $("#arcane_hotbar");
        var scroll = bar.scrollLeft();
        var spells = $("#arcane_dock .arcane-slots").empty();
        var talents = $("#talent_bar .arcane-slots").empty();
        var wasHidden = bar.prop("hidden");
        slots = [];
        bar.prop("hidden", !state);
        $("#talent_bar").prop("hidden", !state || !state.abilities.length);
        if (state) {
            state.spells.forEach(function (slot) {
                render_slot(spells, "spell", state.spell_key, slot);
            });
            state.abilities.forEach(function (slot) {
                render_slot(talents, "ability", state.ability_key, slot);
            });
            if (!state.spells.length) {
                var memorise = $("<button type='button' class='arcane-memorise'>")
                    .text("Memorise").on("click", function () { dispatch(this, "memorise"); });
                if (state.memorise_key)
                    memorise.append(keybinds.badge(state.memorise_key));
                spells.append(memorise);
            }
            bar.scrollLeft(scroll);
        }
        if (wasHidden !== bar.prop("hidden"))
            $(document).triggerHandler("arcane_dock_layout");
    }

    dock.update = function (next, currentMP) {
        mp = currentMP;
        if (next !== state) {
            state = next;
            render();
        }
        var watching = client.is_watching();
        slots.forEach(function (entry) {
            entry.button.prop("disabled", watching || disabled(entry.slot, mp));
        });
        $(".arcane-memorise").prop("disabled", watching);
    };

    $(document).on("arcane_dock_update", function (event, next, currentMP) {
        dock.update(next, currentMP);
    }).on("game_preinit game_cleanup", function () {
        dock.update(null, 0);
    }).on("keydown.arcane keypress.arcane", "#arcane_hotbar button", function (event) {
        if (event.key === "Enter" || event.key === " " || event.which === 13 || event.which === 32)
            event.stopPropagation();
    });

    return dock;
});
