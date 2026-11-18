define(["jquery", "comm", "client", "./textinput", "./util", "./options"],
function ($, comm, client, textinput, util, options) {
    "use strict";

    var more = false;
    var old_scroll_top;
    var message_pane_height = 7; // default value, overridden by client

    // Message channel IDs sent by the game (msg_channel_type in mpr.h).
    var message_classes = {
        4: "message-status", // duration
        5: "message-warning", // danger
        6: "message-warning", // warn
        7: "message-status", // recovery
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

    /**
    * Remove all message elements from the player messages window save for the
    * last height + 10.

    * This is necessary to prevent <div> elements from messages no longer in
    * view from pilling up over longer WebTiles session and thus slowing down
    * the browser.
    */
    function remove_old_messages()
    {
        var all_messages = $("#messages .game_message");
        var keep = message_pane_height + 10;
        if (all_messages.length > keep)
        {
            var messages_to_remove = all_messages.slice(0, -keep);
            messages_to_remove.remove();
        }
    }

    function add_message(data)
    {
        remove_old_messages();
        var msg_elem = $("<div>");
        $("#messages").append(msg_elem);
        msg_elem.addClass("game_message").addClass(message_classes[data.channel] || "");
        var prefix_glyph = $("<span></span>");
        prefix_glyph.addClass("prefix_glyph");
        prefix_glyph.html("&nbsp;");
        msg_elem.html(prefix_glyph);
        msg_elem.append(util.formatted_string_to_html(data.text));
        if (data.channel === 2)
        {
            var prompt = msg_elem.text().trim();
            var aim = prompt.match(/^(?:Aiming|Casting|Restarting spell|Throw(?:ing)?|Fir(?:e|ing)|Shoot(?:ing)?|Zap|Cast):\s*(.+)/i);
            if (aim)
                $("#dungeon").trigger("aim_label", [aim[1].split(" (")[0]]);
        }
        $("#messages_container").scrollTop($("#messages").height());
    }

    function rollback(count)
    {
        $("#messages .game_message").slice(-count).remove();
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
        new_command: new_command
    };
});
