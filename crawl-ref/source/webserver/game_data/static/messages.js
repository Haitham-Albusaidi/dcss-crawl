define(["jquery", "comm", "client", "./textinput", "./util", "./options"],
function ($, comm, client, textinput, util, options) {
    "use strict";

    var more = false;
    var old_scroll_top;
    var message_pane_height = 7;
    var archive;
    var active_channel, expanded, search, unread, scroll_positions;

    // IDs follow msg_channel_type in mpr.h. Regular combat narration is
    // often MSGCH_PLAIN, so match the verbs used in that channel as well.
    var channels = {
        combat: [1, 13, 15, 17, 18],
        alerts: [5, 6, 12, 31],
        story: [2, 3, 21, 23, 24, 29, 33]
    };

    function matches_channel(channel, id, text)
    {
        if (channel === "all" || channels[channel].indexOf(id) !== -1)
            return true;
        if (channel === "combat" && id === 0)
            return /\b(?:hits?|miss(?:es)?|dodges?|blocks?|kills?|slays?|slain|dies|bites?|claws?|punch(?:es)?|kicks?|does no damage|take damage|take \d+ damage|strikes?|slashes?|chops?|stabs?)\b/i.test(text);
        if (channel === "alerts" && (id === 0 || id === 4))
            return /\b(?:low hitpoints|you (?:are|feel) (?:confused|paralysed|paralyzed|poisoned))\b/i.test(text);
        if (channel === "story" && id === 0)
            return /^Found\b/.test(text)
                || /\b(?:you (?:see|find)|there (?:is|are))\b.*\b(?:altar|staircase|shop|portal|entrance)\b/i.test(text);
        return false;
    }

    function matches_message(message, channel, query)
    {
        return matches_channel(channel, message.channel, message.text)
            && message.text.toLowerCase().indexOf(query) !== -1;
    }

    // Message channel IDs sent by the game (msg_channel_type in mpr.h).
    var message_classes = {
        4: "message-status", // duration
        5: "message-warning", // danger
        6: "message-warning", // warn
        7: "message-recovery", // recovery
        12: "message-status", // mutation
        14: "message-status", // monster enchantment
        16: "message-status", // ally enchantment
        17: "message-damage", // monster damage
        31: "message-warning" // monster warning
    };

    function hide()
    {
        old_scroll_top = $("#messages_container").scrollTop();
        $("#messages").hide();
    }

    function show()
    {
        $("#messages").show();
        $("#messages_container").scrollTop(old_scroll_top);
    }

    function scroll_position()
    {
        var box = $("#messages_container")[0];
        return box.scrollHeight - box.clientHeight - box.scrollTop <= 2
            ? Infinity : box.scrollTop;
    }

    function restore_scroll(position)
    {
        var box = $("#messages_container")[0];
        box.scrollTop = position === Infinity ? box.scrollHeight : position;
        $("#chronicle_latest").prop("hidden", scroll_position() === Infinity);
    }

    function fit_height(height, position)
    {
        $("#messages_container").css({
            height: expanded ? height : "",
            "max-height": height
        });
        restore_scroll(position);
    }

    function filter_message(element)
    {
        $(element).toggleClass("chronicle-filtered",
            !matches_message($.data(element, "chronicle"), active_channel,
                             expanded ? search : ""));
    }

    function update_filter(position)
    {
        $("#messages").prepend(archive);
        $("#messages .game_message").each(function () { filter_message(this); });
        remove_old_messages();
        restore_scroll(position);
    }

    function update_badge()
    {
        $("#chronicle_unread").text(unread).prop("hidden", !unread);
    }

    function set_expanded(value)
    {
        var position = scroll_position();
        var box = $("#messages_container")[0];
        var old_height = box.scrollHeight;
        expanded = value;
        $("#chronicle_toggle").attr("aria-expanded", expanded);
        $("#chronicle_search_row").prop("hidden", !expanded);
        $("#message_pane").toggleClass("chronicle-expanded", expanded);
        update_filter(position);
        $(document).trigger("chronicle_layout");
        if (position !== Infinity && !search && active_channel === "all")
            position = Math.max(0, position + box.scrollHeight - old_height);
        restore_scroll(position);
    }

    function set_prompt_mode(active)
    {
        var pane = $("#message_pane");
        if (pane.hasClass("chronicle-prompt") === active)
            return;
        pane.toggleClass("chronicle-prompt", active);
        if (active)
            restore_scroll(Infinity);
    }

    var prefix_glyph_classes = "turn_marker command_marker";
    function set_last_prefix_glyph(text, classes)
    {
        var last_msg_elem = $("#messages .game_message").last();
        var prefix_glyph = last_msg_elem.find(".prefix_glyph");
        prefix_glyph.text(text);
        prefix_glyph.addClass(classes);
    }

    function new_command(new_turn)
    {
        $("#more").hide();
        if (new_turn)
            set_last_prefix_glyph("_", "turn_marker");
        else
            set_last_prefix_glyph("_", "command_marker");
    }

    // Keep the compact unfiltered view cheap while retaining the original
    // formatted nodes for history, including their turn and command markers.
    function remove_old_messages()
    {
        if (expanded || active_channel !== "all")
            return;
        var all_messages = $("#messages .game_message");
        var keep = message_pane_height + 10;
        if (all_messages.length > keep)
        {
            all_messages.slice(0, -keep).each(function () {
                archive.appendChild(this);
            });
        }
    }

    function add_message(data)
    {
        var msg_elem = $("<div>");
        $("#messages").append(msg_elem);
        msg_elem.addClass("game_message").addClass(message_classes[data.channel] || "");
        var prefix_glyph = $("<span></span>");
        prefix_glyph.addClass("prefix_glyph");
        prefix_glyph.html("&nbsp;");
        msg_elem.html(prefix_glyph);
        msg_elem.append(util.formatted_string_to_html(data.text));
        var message = {channel: data.channel, text: msg_elem.text().trim()};
        $.data(msg_elem[0], "chronicle", message);
        filter_message(msg_elem[0]);
        if (matches_channel("alerts", message.channel, message.text))
        {
            msg_elem.addClass("message-warning");
            if (active_channel !== "alerts")
                unread++;
        }
        if (data.channel === 2)
        {
            var prompt = msg_elem.text().trim();
            var aim = prompt.match(/^(?:Aiming|Casting|Restarting spell|Throw(?:ing)?|Fir(?:e|ing)|Shoot(?:ing)?|Zap|Cast):\s*(.+)/i);
            if (aim)
                $("#dungeon").trigger("aim_label", [aim[1].split(" (")[0]]);
        }
    }

    function rollback(count)
    {
        var rows = $("#messages .game_message");
        rows.slice(-count).remove();
        for (var i = rows.length; i < count && archive.lastChild; ++i)
            archive.removeChild(archive.lastChild);
        // A rollback can expose rows that had already moved into history.
        if (count && rows.length - count < message_pane_height + 10
            && archive.lastChild)
        {
            update_filter(Infinity);
        }
    }

    function update_empty_grimoire(messages)
    {
        if (client.is_watching())
            return;
        var last = messages[messages.length - 1];
        if (!last)
            return;
        // Crawl can join messages or append a repeat count to the latest line.
        var empty = last.channel === 0 && /\bYou don't know any spells\.(?: x\d+)?$/
            .test(last.text.replace(/<[^>]*>/g, ""));
        $("#empty_grimoire").prop("hidden", !empty);
    }

    function handle_messages(msg)
    {
        var position = scroll_position();
        if (msg.rollback)
            rollback(msg.rollback);
        if (msg.old_msgs)
            rollback(msg.old_msgs);
        if ("more" in msg)
        {
            more = msg.more;
            if ("more_text" in msg && msg.more_text.length > 0)
                $("#more").text(msg.more_text);
            else
                $("#more").text("--more--");
        }
        $("#more").toggle(more);
        if (msg.messages)
        {
            update_empty_grimoire(msg.messages);
            for (var i = 0; i < msg.messages.length; ++i)
            {
                add_message(msg.messages[i]);

            }
        }
        var cursor = $("#text_cursor");
        if (cursor.length > 0)
            cursor.appendTo($("#messages .game_message").last());
        if (position === Infinity)
            remove_old_messages();
        update_badge();
        restore_scroll(more || cursor.length || $("#message_pane").hasClass("chronicle-prompt")
            ? Infinity : position);
    }

    function messages_key_handler(ev)
    {
        var notice = $("#empty_grimoire");
        if (ev.type === "game_keydown" && notice.is(":visible"))
        {
            notice.prop("hidden", true);
            if (ev.which === 27)
                return false;
        }
        return !textinput.input_active();
    }

    function text_cursor(data)
    {
        if (data.enabled)
        {
            if ($("#text_cursor").length > 0)
                return;
            if (textinput.input_active() &&
                textinput.input_type() == "messages" &&
                textinput.find_input().length > 0)
            {
                return;
            }
            var cursor = $("<span id='text_cursor'>_</span>");
            $("#messages .game_message").last().append(cursor);
            restore_scroll(Infinity);
        }
        else
        {
            $("#text_cursor").remove();
        }
    }

    options.add_listener(function ()
    {
        if (options.get("tile_font_msg_size") === 0)
            $("#message_pane").css("font-size", "");
        else
        {
            $("#message_pane").css("font-size",
                options.get("tile_font_msg_size") + "px");
        }

        var family = options.get("tile_font_msg_family");
        if (family !== "" && family !== "monospace")
        {
            family += ", monospace";
            document.documentElement.style.setProperty("--msg-font", family);
        }
    });

    comm.register_handlers({
        "msgs": handle_messages,
        "text_cursor": text_cursor
    });

    $(document).off("game_init.messages")
        .on("game_init.messages", function () {
            more = false;
            archive = document.createDocumentFragment();
            active_channel = "all";
            expanded = false;
            search = "";
            unread = 0;
            scroll_positions = {};
            $("#chronicle_controls").off(".chronicle")
                .on("keydown.chronicle keypress.chronicle keyup.chronicle", function (ev) {
                    if (ev.target.tagName === "INPUT"
                        || ev.which === 9 || ev.which === 13
                        || ev.which === 27 || ev.which === 32)
                        ev.stopPropagation();
                    if (ev.which === 27 && ev.type === "keydown")
                        ev.target.blur();
                })
                .on("click.chronicle", "[data-channel]", function () {
                    scroll_positions[active_channel] = scroll_position();
                    active_channel = this.getAttribute("data-channel");
                    if (active_channel === "alerts")
                        unread = 0;
                    $("[data-channel]", "#chronicle_controls").attr("aria-pressed", "false");
                    $(this).attr("aria-pressed", "true");
                    update_badge();
                    update_filter(scroll_positions[active_channel] ?? Infinity);
                })
                .on("click.chronicle", "#chronicle_toggle", function () {
                    set_expanded(!expanded);
                })
                .on("click.chronicle", "#chronicle_latest", function () {
                    restore_scroll(Infinity);
                    $("#chronicle_toggle").focus();
                })
                .on("input.chronicle", "#chronicle_search", function () {
                    search = this.value.trim().toLowerCase();
                    update_filter(scroll_position());
                });
            $("#messages_container").off("scroll.chronicle").on("scroll.chronicle", function () {
                $("#chronicle_latest").prop("hidden", scroll_position() === Infinity);
            });
            var notice = $("#empty_grimoire");
            notice.off(".empty_grimoire")
                .on("keydown.empty_grimoire", "button", function (ev) {
                    if (ev.which === 9 || ev.which === 13 || ev.which === 32)
                        ev.stopPropagation();
                })
                .on("click.empty_grimoire", "button", function () {
                    notice.prop("hidden", true);
                    if ($(this).hasClass("empty-grimoire-memorise"))
                        comm.send_message("key", {keycode: 77}); // M
                });
            $(document).off("game_keydown.messages game_keypress.messages")
                .on("game_keydown.messages", messages_key_handler)
                .on("game_keypress.messages", messages_key_handler);
        });

    return {
        hide: hide,
        show: show,
        new_command: new_command,
        scroll_position: scroll_position,
        fit_height: fit_height,
        set_prompt_mode: set_prompt_mode,
        remove_old_messages: remove_old_messages,
        matches_message: matches_message,
        is_expanded: function () { return expanded; },
        get message_pane_height() { return message_pane_height; },
        set message_pane_height(height) { message_pane_height = height; }
    };
});
