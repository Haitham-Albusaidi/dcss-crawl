define(["jquery", "comm", "client", "./ui", "./enums", "./cell_renderer",
    "./util", "./scroller", "./tileinfo-main", "./tileinfo-gui",
    "./tileinfo-player", "./options", "./keybinds"],
function ($, comm, client, ui, enums, cr, util, scroller, main, gui, player, options, keybinds) {
    "use strict";

    var describe_scale = 2.0;

    function fmt_body_txt(txt)
    {
        return txt
            // convert double linebreaks into paragraph markers
            .split("\n\n")
            .map(function (s) {
                return "<pre>" + util.formatted_string_to_html(s) + "</pre>";
            })
            .filter(function (s) { return s !== "<pre></pre>"; })
            .join("")
            // replace single linebreaks with manual linebreaks
            .split("\n")
            .join("<br>");
    }

    function _fmt_spellset_html(desc)
    {
        var desc_parts = desc.split("SPELLSET_PLACEHOLDER")
            .map(fmt_body_txt)
        if (desc_parts.length == 2)
            desc_parts.splice(1, 0, "<div id=spellset_placeholder></div>")
        return desc_parts.join("");
    }

    function _fmt_spells_list(root, spellset, colour)
    {
        var $container = root.find("#spellset_placeholder");
        // XX this container only seems to be added if there are spells, do
        // we actually need to remove it again?
        if ($container.length === 0 && spellset.length !== 0)
        {
            root.prepend("<div class='fg4'>Buggy spellset!</div>");
            return;
        }
        $container.attr("id", "").addClass("menu_contents spellset");
        if (spellset.length === 0)
        {
            $container.remove();
            return;
        }
        $.each(spellset, function (i, book) {
            if (book.label.trim())
                $container.append(book.label);
            var $list = $("<ol>");
            $.each(book.spells, function (i, spell) {
                var $item = $("<li class=selectable>");
                var $canvas = $("<canvas class='glyph-mode-hidden'>");
                var letter = spell.letter;

                var renderer = new cr.DungeonCellRenderer();
                util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
                renderer.init($canvas[0]);
                renderer.draw_from_texture(spell.tile, 0, 0, enums.texture.GUI, 0, 0, 0, false);
                $item.append($canvas);

                var label = " " + letter + " - " + spell.title;
                $item.append("<span>" + util.formatted_string_to_html(label) + "</span>");

                if (spell.effect !== undefined)
                    $item.append("<span>" + util.formatted_string_to_html(spell.effect) + " </span>");
                if (spell.range_string !== undefined)
                    $item.append("<span>" + util.formatted_string_to_html(spell.range_string) + " </span>");

                $list.append($item);
                if (colour)
                    $item.addClass("fg"+spell.colour);
                $item.on("click", function () {
                    comm.send_message("text_input", { text: letter });
                });
            });
            $container.append($list);
        });
    }

    function paneset_cycle($el, next)
    {
        var $panes = $el.children(".pane");
        var $current = $panes.filter(".current").removeClass("current");
        if (next === undefined)
            next = $panes.index($current) + 1;
        $panes.eq(next % $panes.length).addClass("current");
    }

    function progress_bar(msg)
    {
        var $popup = $(".templates > .progress-bar").clone();
        if (msg.title === "")
            $popup.children(".header").remove();
        else
            $popup.find(".header > span").html(msg.title);
        $popup.children(".bar-text").html("<span>" +
            util.formatted_string_to_html(msg.bar_text) + "</span>");
        $popup.children(".status > span").html(msg.status);
        return $popup;
    }

    function progress_bar_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("progress-bar"))
            return;
        $popup.children(".bar-text").html("<span>" +
                    util.formatted_string_to_html(msg.bar_text) + "</span>");
        $popup.children(".status")[0].textContent = msg.status;
    }

    function describe_generic(desc)
    {
        var $popup = $(".templates > .describe-generic").clone();
        var $body = $popup.children(".body");
        if (desc.title === "")
            $popup.children(".header").remove();
        else
            $popup.find(".header > span").text(desc.title);
        $body.html(fmt_body_txt(desc.body + desc.footer));
        var s = scroller($popup.children(".body")[0]);
        s.contentElement.className += " describe-generic-body";
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var canvas = $popup.find(".header > canvas");
        if (desc.tile)
        {
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0,
                desc.tile.ymax, false, describe_scale);
        }
        else
            canvas.remove();

        return $popup;
    }

    function describe_feature_wide(desc)
    {
        var $popup = $(".templates > .describe-feature").clone();
        var $feat_tmpl = $(".templates > .describe-generic");
        desc.feats.forEach(function (feat) {
            var $feat = $feat_tmpl.clone().removeClass("hidden").addClass("describe-feature-feat");
            $feat.find(".header > span").text(feat.title);
            if (feat.body != feat.title)
            {
                var text = feat.body;
                if (feat.quote)
                     text += "\n\n" + feat.quote;
                $feat.find(".body").html(util.formatted_string_to_html(text));
            }
            else
                $feat.find(".body").remove();

            var canvas = $feat.find(".header > canvas");
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(feat.tile.t, 0, 0, feat.tile.tex, 0, 0,
                feat.tile.ymax, false, describe_scale);
            $popup.append($feat);
        });
        if (desc.actions)
        {
            $popup.append("<div class=actions></div>");
            $popup.find(".actions").html(clickify_actions(desc.actions));
        }

        var s = scroller($popup[0]);
        $popup.on("keydown keypress", function (event) {
            var key = String.fromCharCode(event.which);
            if (key != "<" && key != ">") // XX not always
                scroller_handle_key(s, event);
        });
        return $popup;
    }

    // Given some string like "e(v)oke", produce a span with the `data-hotkey`
    // attribute set on that span. This auto-enables clicking. This will
    // handle both a final period, and a sequence of prefix words that do not
    // have a hotkey marked in them.
    // TODO: it might be more robust to produce structured info on the server
    // side...
    function clickify_action(action_text)
    {
        var suffix = "";
        var prefix = "";
        // makes some assumptions about how this is joined...see describe.cc
        // _actions_desc.
        if (action_text.endsWith(".")) // could be more elegant...
        {
            suffix = ".";
            action_text = action_text.slice(0, -1);
        }
        if (action_text.startsWith("or "))
        {
            prefix = "or ";
            action_text = action_text.substr(3);
        }
        var hotkeys = action_text.match(/\(.\)/); // very inclusive for the key name
        if (!hotkeys)
            return prefix + action_text + suffix;
        return prefix + $("<span>").attr("data-hotkey", hotkeys[0][1])
            .append(keybinds.badge(hotkeys[0][1]),
                document.createTextNode(" " + action_text.replace(hotkeys[0], hotkeys[0][1])))
            [0].outerHTML + suffix;
    }

    // Turn a list of actions like that found in the describe item popup into
    // clickable links.
    function clickify_actions(actions_text)
    {
        // assumes that the list is joined via ", ", including the final
        // element. (I.e. this will break without the Oxford comma.)
        var words = actions_text.split(", ");
        var linkized = [];
        words.forEach(function(w) {
            linkized.push(clickify_action(w));
        });
        return linkized.join(", ");
    }

    function describe_item(desc)
    {
        var $popup = $(".templates > .describe-item").clone();
        $popup.addClass("modern-item-insp");

        var insp = desc.inspection || {};
        var stats = insp.stats || {};
        var sections = insp.sections || {};

        // Save original data on popup element for spell-success toggle restoration
        $popup.data("item-desc-data", desc);
        $popup.data("item-showing-spell-success", false);

        // 1. Title and basic classification
        var rawTitle = desc.title || "";
        var cleanTitle = rawTitle.replace(/^[a-z0-9]\s*[-–]\s*/i, "").trim();
        $popup.find(".header > span").addClass("item-insp-title").text(cleanTitle || rawTitle);

        // Determine item category
        var category = "ITEM";
        var categoryIcon = "📦";
        if (insp.kind === "weapon") {
            category = "WEAPON";
            categoryIcon = "⚔️";
        } else if (insp.kind === "armour") {
            category = "ARMOUR";
            categoryIcon = "🛡️";
        } else if (insp.kind === "throwable") {
            category = "THROWABLE";
            categoryIcon = "🏹";
        } else if (desc.spellset && desc.spellset.length > 0) {
            category = "SPELLBOOK";
            categoryIcon = "📖";
        } else if (/potion/i.test(cleanTitle) || (desc.actions && /quaff/i.test(desc.actions))) {
            category = "POTION";
            categoryIcon = "🧪";
        } else if (/scroll/i.test(cleanTitle) || (desc.actions && /read/i.test(desc.actions))) {
            category = "SCROLL";
            categoryIcon = "📜";
        } else if (/wand/i.test(cleanTitle) || (desc.actions && /zap/i.test(desc.actions))) {
            category = "WAND";
            categoryIcon = "🪄";
        } else if (/ring|amulet|necklace|choker|talisman/i.test(cleanTitle) || (desc.actions && /(put on|remove)/i.test(desc.actions))) {
            category = "JEWELLERY";
            categoryIcon = "💍";
        } else if (/ration|meat|bread|fruit|chunk/i.test(cleanTitle) || (desc.actions && /eat/i.test(desc.actions))) {
            category = "FOOD";
            categoryIcon = "🍞";
        } else if (/manual|tome/i.test(cleanTitle)) {
            category = "BOOK";
            categoryIcon = "📘";
        } else if (/gold/i.test(cleanTitle)) {
            category = "TREASURE";
            categoryIcon = "🪙";
        } else if (desc.actions && /evoke/i.test(desc.actions)) {
            category = "EVOCABLE";
            categoryIcon = "✨";
        }

        // Equipment Status
        var equipStatus = null;
        if (insp.equipped !== undefined) {
            if (insp.equipped) {
                equipStatus = insp.melded ? { label: "MELDED", icon: "🟣", cls: "melded" }
                                          : { label: "EQUIPPED", icon: "🟢", cls: "equipped" };
            } else {
                equipStatus = { label: "IN PACK", icon: "⚪", cls: "in-pack" };
            }
        } else {
            if (/\(worn\)|\(weapon\)|\(quivered\)|\(equipped\)/i.test(rawTitle)) {
                equipStatus = { label: "EQUIPPED", icon: "🟢", cls: "equipped" };
            } else if (/\(melded\)/i.test(rawTitle)) {
                equipStatus = { label: "MELDED", icon: "🟣", cls: "melded" };
            }
        }

        // Enchantment badge
        var enchantment = null;
        if (insp.enchantment !== undefined) {
            enchantment = (insp.enchantment >= 0 ? "+" : "") + insp.enchantment;
        } else {
            var enchMatch = cleanTitle.match(/([+-]\d+)/);
            if (enchMatch && !/\(\s*[+-]\d+\s*apt\s*\)/i.test(cleanTitle))
                enchantment = enchMatch[1];
        }

        // Build header badges row
        var $badgesRow = $("<div class='item-insp-badges'></div>");
        $badgesRow.append("<span class='item-insp-badge item-badge-category'>" + categoryIcon + " " + category + "</span>");
        if (equipStatus) {
            $badgesRow.append("<span class='item-insp-badge item-badge-status " + equipStatus.cls + "'>" + equipStatus.icon + " " + equipStatus.label + "</span>");
        }
        if (enchantment) {
            $badgesRow.append("<span class='item-insp-badge item-badge-enchant'>Enchantment " + enchantment + "</span>");
        }
        if (stats.hands) {
            var handsStr = stats.hands === 1 ? "🗡️ 1-Handed" : "⚔️ 2-Handed";
            $badgesRow.append("<span class='item-insp-badge item-badge-hands'>" + handsStr + "</span>");
        }

        // Wrap header elements nicely
        var $header = $popup.find(".header");
        $header.addClass("item-insp-header");
        var $titleWrap = $("<div class='item-insp-title-wrap'></div>");
        $header.find("span.item-insp-title").detach().appendTo($titleWrap);
        $titleWrap.append($badgesRow);
        $header.append($titleWrap);

        // Canvas for sprites
        var canvas = $header.find("canvas");
        canvas.wrap("<div class='item-insp-canvas-frame'></div>");
        var renderer = new cr.DungeonCellRenderer();
        var scale = describe_scale || 2.0;
        util.init_canvas(canvas[0],
            renderer.cell_width * scale,
            renderer.cell_height * scale);
        renderer.init(canvas[0]);

        if (desc.tiles && desc.tiles.length) {
            desc.tiles.forEach(function (tile) {
                renderer.draw_from_texture(tile.t, 0, 0, tile.tex, 0, 0, tile.ymax,
                    false, scale);
            });
        }

        // 2. Build structured body content
        var $body = $popup.find(".body");
        $body.empty().addClass("item-insp-body");

        function render_crawl_html(text) {
            return typeof _fmt_spellset_html === "function" ? _fmt_spellset_html(text) : fmt_body_txt(text);
        }

        // Container for toggleable content (to support describe-spell-success seamlessly)
        var $mainContent = $("<div class='item-insp-main-content'></div>");

        // A. Stat Cards Grid
        var statCards = [];
        if (stats.base_damage !== undefined) {
            statCards.push({
                label: "BASE DAMAGE",
                val: stats.base_damage,
                sub: stats.damage_rating ? "Rating: " + stats.damage_rating : "Damage potential"
            });
        }
        if (stats.accuracy !== undefined) {
            statCards.push({
                label: "ACCURACY",
                val: (stats.accuracy >= 0 ? "+" : "") + stats.accuracy,
                sub: "Hit modifier"
            });
        }
        if (stats.current_delay_aut !== undefined) {
            var curDelayTurns = (stats.current_delay_aut / 10).toFixed(1);
            var minDelayTurns = stats.minimum_delay_aut !== undefined ? (stats.minimum_delay_aut / 10).toFixed(1) : null;
            var subText = minDelayTurns ? "Min " + minDelayTurns + (stats.minimum_delay_skill !== undefined ? " @ Skill " + stats.minimum_delay_skill : "") : "Turns per attack";
            statCards.push({
                label: "ATTACK DELAY",
                val: curDelayTurns + " turns",
                sub: subText
            });
        } else if (stats.base_delay_aut !== undefined) {
            var baseDelayTurns = (stats.base_delay_aut / 10).toFixed(1);
            statCards.push({
                label: "BASE DELAY",
                val: baseDelayTurns + " turns",
                sub: "Standard speed"
            });
        }
        if (stats.skill) {
            statCards.push({
                label: "WEAPON SKILL",
                val: stats.skill,
                sub: stats.hands ? (stats.hands === 1 ? "1-Handed" : "2-Handed") : "Governing skill"
            });
        }
        if (stats.base_armour !== undefined) {
            statCards.push({
                label: "BASE ARMOUR",
                val: stats.base_armour,
                sub: "Base AC rating"
            });
        }
        if (stats.base_shield !== undefined) {
            statCards.push({
                label: "BASE SHIELD",
                val: stats.base_shield,
                sub: "Base SH rating"
            });
        }
        if (stats.encumbrance !== undefined) {
            statCards.push({
                label: "ENCUMBRANCE",
                val: stats.encumbrance,
                sub: stats.encumbrance === 0 ? "No penalty" : "EV/Spell penalty"
            });
        }
        if (stats.evasion !== undefined) {
            statCards.push({
                label: "EVASION MOD",
                val: (stats.evasion >= 0 ? "+" : "") + stats.evasion,
                sub: "Dodge modifier"
            });
        }
        if (stats.max_enchantment !== undefined) {
            statCards.push({
                label: "MAX ENCHANT",
                val: "+" + stats.max_enchantment,
                sub: "Reinforcement cap"
            });
        }
        if (stats.destroy_denominator !== undefined) {
            var breakText = stats.destroy_denominator === 0 ? "Never"
                          : stats.destroy_denominator === 1 ? "100%"
                          : "1 in " + stats.destroy_denominator;
            statCards.push({
                label: "BREAK CHANCE",
                val: breakText,
                sub: "On projectile impact"
            });
        }

        if (statCards.length > 0) {
            var $statsGrid = $("<div class='item-insp-stats-grid'></div>");
            statCards.forEach(function (card) {
                var $c = $("<div class='item-stat-card'></div>");
                $c.append("<div class='item-stat-label'>" + card.label + "</div>");
                $c.append("<div class='item-stat-val'>" + card.val + "</div>");
                if (card.sub)
                    $c.append("<div class='item-stat-sub'>" + card.sub + "</div>");
                $statsGrid.append($c);
            });
            $mainContent.append($statsGrid);
        }

        // B. Description & Lore parsing
        var descText = "";
        var advText = "";
        var loreText = "";
        var notesText = "";

        if (sections.description !== undefined) {
            descText = sections.description;
            advText = sections.advanced || "";
            loreText = sections.lore || "";
            notesText = sections.notes || "";
        } else {
            var bodyRaw = desc.body || "";
            var quoteSplit = bodyRaw.split(/\n?_{10,}\n+/);
            if (quoteSplit.length > 1) {
                descText = quoteSplit[0].trim();
                loreText = quoteSplit.slice(1).join("\n").replace(/<\/?darkgrey>/g, "").trim();
            } else {
                descText = bodyRaw.trim();
            }
        }

        // Description Card
        if (descText) {
            var $descCard = $("<div class='item-insp-card item-insp-desc-card'></div>");
            $descCard.append("<div class='item-insp-card-title'>📜 Description</div>");
            $descCard.append("<div class='item-insp-card-body'>" + render_crawl_html(descText) + "</div>");
            $mainContent.append($descCard);
        }

        // Spells List (for Spellbooks)
        if (desc.spellset && desc.spellset.length > 0) {
            var $spellCard = $("<div class='item-insp-card item-insp-spellset-card'></div>");
            $spellCard.append("<div class='item-insp-card-title'>📖 Contained Spells</div>");
            var $spellsContainer = $("<div class='item-insp-spells-container'></div>");
            _fmt_spells_list($spellsContainer, desc.spellset, true);
            $spellCard.append($spellsContainer);
            $mainContent.append($spellCard);
        }

        // Collapsible Advanced Mechanics & Formulas
        if (advText) {
            var $advCard = $("<details class='item-insp-card item-insp-advanced-card' open></details>");
            $advCard.append("<summary class='item-insp-advanced-summary'>⚙️ Advanced Mechanics & Details</summary>");
            $advCard.append("<div class='item-insp-card-body item-insp-advanced-body'>" + render_crawl_html(advText) + "</div>");
            $mainContent.append($advCard);
        }

        // Lore Box
        if (loreText) {
            var $loreCard = $("<div class='item-insp-card item-insp-lore-card'></div>");
            var $loreBox = $("<div class='item-insp-lore-box'></div>");
            $loreBox.append("<span class='item-insp-lore-quote-mark'>“</span>");
            $loreBox.append("<div class='item-insp-lore-text'>" + render_crawl_html(loreText) + "</div>");
            $loreCard.append($loreBox);
            $mainContent.append($loreCard);
        }

        // Notes / Hints Card
        if (notesText) {
            var $notesCard = $("<div class='item-insp-card item-insp-notes-card'></div>");
            $notesCard.append("<div class='item-insp-card-title'>💡 Notes & Hints</div>");
            $notesCard.append("<div class='item-insp-card-body'>" + render_crawl_html(notesText) + "</div>");
            $mainContent.append($notesCard);
        }

        // Spell Failure Comparison Container (hidden by default)
        var $spellSuccessContainer = $("<div class='item-insp-spell-success-container hidden'></div>");

        $body.append($mainContent);
        $body.append($spellSuccessContainer);

        // 3. Actions Footer Dock
        var $actionsDock = $popup.find(".actions");
        $actionsDock.empty().addClass("item-insp-actions-dock");

        keybinds.inspectionActions(desc).concat({ key: 27, label: "Close" }).forEach(function (action) {
            var key = keybinds.keyValue(action.key);
            var $button = $("<button type='button' class='item-insp-action-btn'>")
                .attr({ "data-hotkey": key, "data-keycode": action.key });
            if (action.key === 27)
                $button.addClass("item-insp-close-btn");
            $button.append(keybinds.badge(key), $("<span class='item-insp-btn-label'>").text(action.label));
            $actionsDock.append($button);
        });

        // 4. Scroller and Keyboard Event Handling
        var s = scroller($body[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        return $popup;
    }

    function format_spell_html(desc)
    {
        var parts = desc.match(/(^[\s\S]*\n\n)(Level: [^\n]+)(\n\n[\s\S]*)$/);
        if (parts == null || parts.length != 4)
            return fmt_body_txt(desc);
        parts[2] = parts[2].replace(/ /g, '&nbsp;');
        return fmt_body_txt(parts[1]) + parts[2] + fmt_body_txt(parts[3]);
    }

    function describe_spell(desc)
    {
        var $popup = $(".templates > .describe-spell").clone();
        $popup.find(".header > span").text(desc.title);
        $popup.find(".body").html(format_spell_html(desc.desc));
        var s = scroller($popup.find(".body")[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });
        if (desc.can_mem)
            $popup.find(".actions").removeClass("hidden");

        var canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init(canvas[0]);
        renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0,
            desc.tile.ymax, false, describe_scale);

        return $popup;
    }

    function describe_cards(desc)
    {
        var $popup = $(".templates > .describe-cards").clone();
        var $card_tmpl = $(".templates > .describe-generic");
        var t = gui.NEMELEX_CARD, tex = enums.texture.GUI;
        desc.cards.forEach(function (card) {
            var $card = $card_tmpl.clone().removeClass("hidden").addClass("describe-card");
            $card.find(".header > span").text(card.name);
            $card.find(".body").html(fmt_body_txt(card.desc));

            var canvas = $card.find(".header > canvas");
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(t, 0, 0, tex, 0, 0, 0, false,
                describe_scale);
            $popup.append($card);
        });
        var s = scroller($popup[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });
        return $popup;
    }

    function describe_god(desc)
    {
        var use_extra_pane = (desc.extra.length > 0);

        if (use_extra_pane)
            var $popup = $(".templates > #describe-god-extra").clone();
        else
            var $popup = $(".templates > #describe-god-basic").clone();
        $popup.find(".header > span").addClass("fg" + desc.colour).html(
                                                                    desc.name);

        var canvas = $popup.find(".header > canvas")[0];
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas,
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init(canvas);
        renderer.draw_from_texture(desc.tile.t, 0, 0,
                                   desc.tile.tex, 0, 0, 0, false,
                                   describe_scale);

        var $body = $popup.children(".body");
        var $footer = $popup.find(".footer > .paneset");
        var $panes = $body.children(".pane");

        if (!desc.is_altar)
            $footer.find('.join-keyhelp').remove();
        else
            $footer.find('.join-keyhelp').append(desc.service_fee)

        $panes.eq(0).find(".desc").html(desc.description);
        $panes.eq(0).find(".god-favour td.title")
                    .addClass("fg"+desc.colour).html(desc.title);
        $panes.eq(0).find(".god-favour td.favour")
                    .addClass("fg"+desc.colour).html(desc.favour);
        var powers_list = desc.powers_list.split("\n").slice(3, -1);
        var $powers = $panes.eq(0).find(".god-powers");
        var re = /^(<[a-z]*>)?(.*\.) *(\(.*\))?$/;
        for (var i = 0; i < powers_list.length; i++)
        {
            var matches = powers_list[i].match(re);
            var colour = (matches.length == 4 && matches[1] === "<darkgrey>")
                ? 8 : desc.colour;
            var power = matches[2], cost = matches[3] || "";
            $powers.append("<div class='power fg"+colour+"'><div>"
                +power+"</div><div>"+cost+"</div></div>");
        }

        desc.powers = fmt_body_txt(desc.powers);
        if (desc.info_table.length !== "")
        {
            desc.powers += "<div class=tbl>"
                            + util.formatted_string_to_html(desc.info_table)
                            + "</div>";
        }
        $panes.eq(1).html(desc.powers);

        $panes.eq(2).html(
                    fmt_body_txt(desc.wrath));
        if (use_extra_pane)
        {
            $panes.eq(3).html("<div class=tbl>"
                                + util.formatted_string_to_html(desc.extra)
                                + "</div>");
        }

        var num_panes = (use_extra_pane ? 3 : 2)
        for (var i = 0; i <= num_panes; i++)
            scroller($panes.eq(i)[0]);


        $popup.on("keydown keypress", function (event) {
            var enter = event.which == 13, space = event.which == 32;
            if (enter || space)
                return;
            var s = scroller($panes.filter(".current")[0]);
            scroller_handle_key(s, event);
        });

        $popup.on("keydown", function (event) {
            if (event.key === "!" || event.key === "^")
            {
                paneset_cycle($body);
                paneset_cycle($footer);
            }
        });
        paneset_cycle($body);
        paneset_cycle($footer);

        return $popup;
    }

    function describe_god_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("describe-god"))
            return;
        if (msg.pane !== undefined && client.is_watching())
        {
            paneset_cycle($popup.children(".body"), msg.pane);
            var $footer = $popup.find(".footer > .paneset");
            if ($footer.length > 0)
                paneset_cycle($footer, msg.pane);
        }
        if (msg.prompt !== undefined)
            $popup.children(".footer").html(msg.prompt).addClass("fg3");
    }

    function describe_item_spell_success(desc)
    {
        var $popup = ui.top_popup();
        if (!$popup || $popup.length === 0)
            return;

        if (desc.body !== undefined)
        {
            var $mainContent = $popup.find(".item-insp-main-content");
            var $spellSuccess = $popup.find(".item-insp-spell-success-container");

            if ($mainContent.length > 0 && $spellSuccess.length > 0)
            {
                var showing = $popup.data("item-showing-spell-success") || false;
                showing = !showing;
                $popup.data("item-showing-spell-success", showing);

                if (showing) {
                    $mainContent.addClass("hidden");
                    $spellSuccess.empty().removeClass("hidden");
                    $spellSuccess.append("<div class='item-insp-spell-success-banner'>⚡ Spell Failure Comparison <span class='item-insp-banner-sub'>Press " + keybinds.html("!") + " to return to item description</span></div>");
                    $spellSuccess.append("<div class='item-insp-card item-insp-desc-card'><div class='item-insp-card-body'>" + fmt_body_txt(desc.body) + "</div></div>");
                } else {
                    $spellSuccess.addClass("hidden").empty();
                    $mainContent.removeClass("hidden");
                }
            }
            else
            {
                var $body = $popup.find(".simplebar-content");
                if ($body.length === 0)
                    $body = $popup.find(".body");
                $body.html(fmt_body_txt(desc.body));
            }
        }
    }

    function _fmt_mon_stats_grid(raw)
    {
        var clean = raw.replace(/<[^>]+>/g, "");
        var regex = /([A-Za-z\s]+):\s*([^\s][^:]*?)(?=(?:\s{2,}[A-Za-z\s]+:|$|\n))/g;
        var match;
        var cellsHtml = "";
        var iconMap = {
            "max hp": "❤️",
            "threat": "⚠️",
            "will": "🔮",
            "ac": "🛡️",
            "ev": "💨",
            "sh": "🛡️",
            "class": "🧬",
            "size": "📏",
            "int": "🧠",
            "speed": "⚡",
            "regen": "💖",
            "hd": "⭐"
        };

        while ((match = regex.exec(clean)) !== null) {
            var k = match[1].trim();
            var v = match[2].trim();
            var kl = k.toLowerCase();
            var icon = iconMap[kl] || "✦";
            var valClass = "";

            if (kl === "max hp") valClass = "stat-hp";
            else if (kl === "ac") valClass = "stat-ac";
            else if (kl === "ev") valClass = "stat-ev";
            else if (kl === "will") valClass = "stat-will";
            else if (kl === "threat") {
                var vl = v.toLowerCase();
                if (vl.indexOf("trivial") !== -1) valClass = "threat-trivial";
                else if (vl.indexOf("minor") !== -1) valClass = "threat-minor";
                else if (vl.indexOf("moderate") !== -1) valClass = "threat-moderate";
                else if (vl.indexOf("danger") !== -1) valClass = "threat-dangerous";
                else valClass = "threat-fatal";
            }

            cellsHtml += '<div class="mon-stat-cell">';
            cellsHtml += '  <span class="mon-stat-lbl">' + icon + ' ' + util.formatted_string_to_html(k) + '</span>';
            cellsHtml += '  <span class="mon-stat-val ' + valClass + '">' + util.formatted_string_to_html(v) + '</span>';
            cellsHtml += '</div>';
        }

        if (!cellsHtml) {
            return '<pre>' + util.formatted_string_to_html(raw) + '</pre>';
        }
        return '<div class="mon-stat-grid">' + cellsHtml + '</div>';
    }

    function _fmt_mon_combat_odds(raw)
    {
        var clean = raw.replace(/<[^>]+>/g, "");
        var lines = clean.split("\n");
        var html = '<div class="mon-combat-odds-box">';
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            var isPlayer = line.indexOf("You have") !== -1;
            var pctMatch = line.match(/about\s+(\d+%|\d+\.\d+%)/i);
            var pct = pctMatch ? pctMatch[1] : "";
            var rowClass = isPlayer ? "player-odds" : "enemy-odds";
            var icon = isPlayer ? "⚔️" : "🛡️";

            html += '<div class="mon-odds-row ' + rowClass + '">';
            html += '  <span class="mon-odds-icon">' + icon + '</span>';
            if (pct) {
                var colorClass = isPlayer ? "green" : "amber";
                html += '  <span class="mon-odds-val ' + colorClass + '">' + pct + '</span>';
            }
            var descText = isPlayer
                ? line.replace(/^You have\s+about\s+\d+%?\s*(?:to hit\s+)?/i, "")
                : line.replace(/^It has\s+about\s+\d+%?\s*/i, "");
            html += '  <span class="mon-odds-desc">' + util.formatted_string_to_html(descText) + '</span>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function _fmt_mon_attacks(raw)
    {
        var clean = raw.replace(/<[^>]+>/g, "");
        var lines = clean.split("\n");
        var html = '<div class="mon-attacks-card">';
        html += '  <div class="mon-attacks-header">⚔️ Attack Arsenal</div>';

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line.indexOf("Max Damage") !== -1) continue;

            var m = line.match(/^([^:]+):\s*(.*?)(?:\s+(\d+))?$/);
            if (m) {
                var atkType = m[1].trim();
                var desc = m[2].trim();
                var dmg = m[3] ? m[3].trim() : "";

                html += '<div class="mon-attack-row">';
                html += '  <div class="mon-attack-info">';
                html += '    <span class="mon-attack-type">' + util.formatted_string_to_html(atkType) + ':</span>';
                if (desc) {
                    html += '    <span class="mon-attack-weapon">' + util.formatted_string_to_html(desc) + '</span>';
                }
                html += '  </div>';
                if (dmg) {
                    html += '  <span class="mon-dmg-chip">' + dmg + ' MAX DMG</span>';
                }
                html += '</div>';
            } else {
                html += '<div class="mon-attack-row"><span class="mon-attack-weapon">' + util.formatted_string_to_html(line) + '</span></div>';
            }
        }
        html += '</div>';
        return html;
    }

    function _fmt_mon_traits(raw)
    {
        var clean = raw.replace(/<[^>]+>/g, "");
        var lines = clean.split("\n");
        var html = '<div class="mon-traits-box">';
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            var icon = "✦";
            var l = line.toLowerCase();
            if (l.indexOf("door") !== -1) icon = "🚪";
            else if (l.indexOf("notice") !== -1 || l.indexOf("stealth") !== -1) icon = "👁️";
            else if (l.indexOf("flie") !== -1 || l.indexOf("fly") !== -1) icon = "🪶";
            else if (l.indexOf("swim") !== -1 || l.indexOf("water") !== -1) icon = "🌊";
            else if (l.indexOf("poison") !== -1) icon = "🧪";
            else if (l.indexOf("fire") !== -1) icon = "🔥";
            else if (l.indexOf("cold") !== -1 || l.indexOf("ice") !== -1) icon = "❄️";
            else if (l.indexOf("invisible") !== -1) icon = "🔮";
            else if (l.indexOf("regenerat") !== -1) icon = "💖";
            else if (l.indexOf("breath") !== -1) icon = "💨";
            else if (l.indexOf("spell") !== -1) icon = "🪄";

            html += '<div class="mon-trait-chip"><span class="trait-icon">' + icon + '</span><span>' + util.formatted_string_to_html(line) + '</span></div>';
        }
        html += '</div>';
        return html;
    }

    function _fmt_mon_resists(raw)
    {
        var lines = raw.split("\n");
        var html = '<div class="mon-resists-box">';
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            html += '<div class="mon-resist-line">🛡️ ' + util.formatted_string_to_html(line) + '</div>';
        }
        html += '</div>';
        return html;
    }

    function _fmt_mon_status_body(status)
    {
        if (!status) return "";
        var lines = status.split("\n");
        var html = '<div class="mon-status-container">';
        html += '  <div class="mon-status-header">⚡ Current Status & Conditions</div>';
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line) continue;
            html += '<div class="mon-status-line">🔹 ' + util.formatted_string_to_html(line) + '</div>';
        }
        html += '</div>';
        return html;
    }

    function _fmt_mon_quote_body(quote)
    {
        if (!quote) return "";
        var quoteHtml = util.formatted_string_to_html(quote).split("\n").join("<br>");
        return '<div class="mon-quote-box"><div class="mon-quote-mark">“</div><div class="mon-quote-text">' + quoteHtml + '</div></div>';
    }

    function fmt_modern_monster_body(rawBody)
    {
        if (!rawBody) return "";

        var hasPlaceholder = rawBody.indexOf("SPELLSET_PLACEHOLDER") !== -1;
        var parts = rawBody.split("SPELLSET_PLACEHOLDER");

        var formattedParts = parts.map(function(part) {
            var paragraphs = part.split(/\n\n+/);
            var htmlArr = [];

            for (var p = 0; p < paragraphs.length; p++) {
                var rawPara = paragraphs[p].trim();
                if (!rawPara) continue;

                // 1. STAT GRID: Contains Max HP, Threat, AC, EV, etc.
                if ((rawPara.indexOf("Max HP:") !== -1 || rawPara.indexOf("Threat:") !== -1) &&
                    (rawPara.indexOf("AC:") !== -1 || rawPara.indexOf("EV:") !== -1)) {
                    htmlArr.push(_fmt_mon_stats_grid(rawPara));
                    continue;
                }

                // 2. COMBAT ODDS: Contains "to hit"
                if (rawPara.indexOf("to hit") !== -1 && (rawPara.indexOf("You have about") !== -1 || rawPara.indexOf("It has about") !== -1)) {
                    htmlArr.push(_fmt_mon_combat_odds(rawPara));
                    continue;
                }

                // 3. ATTACK ARSENAL: Contains "Attack" and "Max Damage"
                if (rawPara.indexOf("Attack") !== -1 && rawPara.indexOf("Max Damage") !== -1) {
                    htmlArr.push(_fmt_mon_attacks(rawPara));
                    continue;
                }

                // 4. RESISTANCES: Starts with Resistances or Resists
                if (/^(?:Resistances?|Immunities?):/i.test(rawPara)) {
                    htmlArr.push(_fmt_mon_resists(rawPara));
                    continue;
                }

                // 5. TRAITS & BEHAVIOR: e.g. "It has a ...", "It can ...", "It is ...", "It cannot ..."
                if (/^It (?:can|has|is|cannot|does|will|regenerates|leaves|flies)/i.test(rawPara)) {
                    htmlArr.push(_fmt_mon_traits(rawPara));
                    continue;
                }

                // 6. DEFAULT / LORE PARAGRAPH
                var loreHtml = util.formatted_string_to_html(rawPara).split("\n").join("<br>");
                htmlArr.push('<div class="mon-lore-block">' + loreHtml + '</div>');
            }

            return htmlArr.join("");
        });

        if (hasPlaceholder) {
            return formattedParts[0] + '<div id="spellset_placeholder"></div>' + (formattedParts[1] || "");
        }
        return formattedParts.join("");
    }

    function _build_footer_tabs(active_index, have_status, have_quote)
    {
        var tabs = [
            { id: 0, label: "Description", icon: "📜" }
        ];
        if (have_status) tabs.push({ id: 1, label: "Status & Effects", icon: "⚡" });
        if (have_quote) tabs.push({ id: 2, label: "Lore & Quote", icon: "💬" });

        var html = '<div class="er-codex-tab-bar">';
        html += '  <button type="button" class="er-codex-switch-key-btn">' + keybinds.html("!") + ' Switch View</button>';
        html += '  <div class="er-codex-tabs-list">';
        for (var i = 0; i < tabs.length; i++) {
            var t = tabs[i];
            var isActive = (t.id === active_index);
            html += '<button type="button" class="er-codex-tab-btn' + (isActive ? ' active' : '') + '" data-pane-idx="' + t.id + '">' + t.icon + ' ' + t.label + '</button>';
        }
        html += '  </div>';
        html += '</div>';
        return html;
    }

    function describe_monster(desc)
    {
        var $popup = $(".templates > .describe-monster").clone();

        var $header = $popup.find(".header");
        var $canvas = $header.find("canvas");
        $header.html("");

        var $headerLeft = $('<div class="er-codex-header-left"></div>');
        var $avatarBox = $('<div class="er-codex-avatar-frame"></div>').append($canvas);
        var $titleGroup = $('<div class="er-codex-title-group"></div>');
        $titleGroup.append($('<div class="er-codex-title"></div>').text(desc.title));
        $titleGroup.append($('<div class="er-codex-subtitle">TACTICAL CODEX & BEAST LORE</div>'));
        $headerLeft.append($avatarBox).append($titleGroup);

        var $closeBtn = $('<button type="button" class="er-codex-close-btn" aria-label="Close Codex">✕ ' + keybinds.html("Esc") + '</button>');
        $closeBtn.on("click", function (e) {
            e.stopPropagation();
            comm.send_message("key", { keycode: 27 });
        });

        $header.append($headerLeft).append($closeBtn);

        var $body = $popup.find(".body.paneset");
        var $footer = $popup.find(".footer > .paneset");
        var $panes = $body.find(".pane");
        var $footer_panes = $footer.find(".pane");

        $panes.eq(0).html(fmt_modern_monster_body(desc.body));
        _fmt_spells_list($panes.eq(0), desc.spellset, false);

        var have_quote = desc.quote !== "";
        var have_status = desc.status !== "";

        $footer_panes.eq(0).html(_build_footer_tabs(0, have_status, have_quote));
        $footer_panes.eq(1).html(_build_footer_tabs(1, have_status, have_quote));
        $footer_panes.eq(2).html(_build_footer_tabs(2, have_status, have_quote));

        if (have_quote)
            $panes.eq(2).html(_fmt_mon_quote_body(desc.quote));
        else
        {
            $panes.eq(2).remove();
            $footer_panes.eq(2).remove();
        }

        if (have_status)
            $panes.eq(1).html(_fmt_mon_status_body(desc.status));
        else
        {
            $panes.eq(1).remove();
            $footer_panes.eq(1).remove();
        }

        if (!have_status && !have_quote)
            $footer.parent().remove();

        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init($canvas[0]);

        if ((desc.fg_idx >= main.MAIN_MAX) && desc.doll)
        {
            var mcache_map = {};
            if (desc.mcache)
            {
                for (var i = 0; i < desc.mcache.length; ++i)
                    mcache_map[desc.mcache[i][0]] = i;
            }
            $.each(desc.doll, function (i, doll_part) {
                var xofs = 0;
                var yofs = Math.max(0, player.get_tile_info(desc.doll[0][0]).h - 32);
                if (mcache_map[doll_part[0]] !== undefined)
                {
                    var mind = mcache_map[doll_part[0]];
                    xofs = desc.mcache[mind][1];
                    yofs += desc.mcache[mind][2];
                }
                renderer.draw_player(doll_part[0],
                        0, 0, xofs, yofs, doll_part[1], describe_scale);
            });
        }

        if ((desc.fg_idx >= player.MCACHE_START) && desc.mcache)
        {
            $.each(desc.mcache, function (i, mcache_part) {
                if (mcache_part) {
                    var yofs = Math.max(0, player.get_tile_info(mcache_part[0]).h - 32);
                    renderer.draw_player(mcache_part[0],
                            0, 0, mcache_part[1], mcache_part[2]+yofs,
                            undefined, describe_scale);
                }
            });
        }
        else if (desc.fg_idx > 0 && desc.fg_idx <= main.MAIN_MAX)
        {
            renderer.draw_foreground(0, 0, { t: {
                fg: { value: desc.fg_idx }, bg: 0, icons: [],
            }}, describe_scale);
        }

        renderer.draw_foreground(0, 0, { t: {
            fg: enums.prepare_fg_flags(desc.flag),
            bg: 0,
            icons: desc.icons,
        }}, describe_scale);

        for (var i = 0; i < $panes.length; i++)
            scroller($panes.eq(i)[0]);

        $popup.on("keydown keypress", function (event) {
            var s = scroller($panes.filter(".current")[0]);
            scroller_handle_key(s, event);
        });

        $popup.on("keydown", function (event) {
            if (event.key === "!")
            {
                paneset_cycle($body);
                if (have_quote || have_status)
                    paneset_cycle($footer);
            }
        });

        $popup.on("click", ".er-codex-tab-btn", function(e) {
            e.stopPropagation();
            var targetIdx = parseInt($(this).attr("data-pane-idx"), 10);
            paneset_cycle($body, targetIdx);
            if (have_quote || have_status)
                paneset_cycle($footer, targetIdx);
        });

        $popup.on("click", ".er-codex-switch-key-btn", function(e) {
            e.stopPropagation();
            paneset_cycle($body);
            if (have_quote || have_status)
                paneset_cycle($footer);
        });

        paneset_cycle($body);
        if (have_quote || have_status)
            paneset_cycle($footer);

        return $popup;
    }

    function describe_monster_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("describe-monster"))
            return;
        if (msg.pane !== undefined && client.is_watching())
        {
            paneset_cycle($popup.children(".body"), msg.pane);
            var $footer = $popup.find(".footer > .paneset");
            if ($footer.length > 0)
                paneset_cycle($footer, msg.pane);
        }
    }

    function version(desc)
    {
        var $popup = $(".templates > .describe-generic").clone();
        $popup.find(".header > span").html(
            util.formatted_string_to_html(desc.information));
        var $body = $popup.find(".body");
        $body.html(fmt_body_txt(desc.features) + fmt_body_txt(desc.changes));
        var s = scroller($body[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var t = gui.STARTUP_STONESOUP, tex = enums.texture.GUI;
        var $canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init($canvas[0]);
        renderer.draw_from_texture(t, 0, 0, tex, 0, 0, 0, false,
            describe_scale);

        return $popup;
    }

    var update_server_scroll_timeout = null;
    var scroller_from_server = false;

    function scroller_handle_key(scroller, event)
    {
        if (event.altKey || event.shiftkey || event.ctrlKey) {
            if (update_server_scroll_timeout)
                update_server_scroll();
            return;
        }

        var handled = true;

        if (event.type === "keydown")
            switch (event.which)
            {
                case 33: // page up
                    scroller_scroll_page(scroller, -1);
                    break;
                case 34: // page down
                    scroller_scroll_page(scroller, 1);
                    break;
                case 35: // end
                    scroller_scroll_to_line(scroller, 2147483647); //int32_t max
                    break;
                case 36: // home
                    scroller_scroll_to_line(scroller, 0);
                    break;
                case 38: // up
                    scroller_scroll_line(scroller, -1);
                    break;
                case 40: // down
                    scroller_scroll_line(scroller, 1);
                    break;
                default:
                    handled = false;
                    break;
            }
        else if (event.type === "keypress")
            switch (String.fromCharCode(event.which))
            {
                case " ": case ">": case "+": case '\'':
                    scroller_scroll_page(scroller, 1);
                    break;
                case "-": case "<": case ";":
                    scroller_scroll_page(scroller, -1);
                    break;
                default:
                    handled = false;
                    break;
            }
        else
            handled = false;

        if (handled)
        {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        return handled;
    }

    function scroller_line_height(scroller)
    {
        var span = $(scroller.scrollElement).siblings('.scroller-lhd')[0];
        var rect = span.getBoundingClientRect();
        return rect.bottom - rect.top;
    }

    function scroller_scroll_page(scroller, dir)
    {
        var line_height = scroller_line_height(scroller);
        var contents = $(scroller.scrollElement);
        // XX this is a bit weird, maybe context[0] is the wrong thing to use?
        // The -24 is to compensate for the top/bottom shades. In practice, the
        // top line ends up a bit in the shade in long docs, possibly it should
        // be adjusted for.
        var page_shift = contents[0].getBoundingClientRect().height - 24;
        page_shift = Math.floor(page_shift / line_height) * line_height;
        contents[0].scrollTop += page_shift * dir;
        update_server_scroll();
    }

    function scroller_scroll_line(scroller, dir)
    {
        var line_height = scroller_line_height(scroller);
        var contents = $(scroller.scrollElement);
        contents[0].scrollTop += line_height * dir;
        update_server_scroll(scroller);
    }

    function scroller_scroll_to_line(scroller, line)
    {
        var $scroller = $(scroller.scrollElement);
        // TODO: can this work without special-casing int32_t max, where any
        // pos greater than the max scrolls to end?
        if (line == 2147483647) // FS_START_AT_END
        {
            // special case for webkit: excessively large values don't work
            var inner_h = $(scroller.contentElement).outerHeight();
            $scroller[0].scrollTop = inner_h - $scroller.parent().outerHeight();
        }
        else
        {
            var line_height = scroller_line_height(scroller);
            line *= line_height;
            $scroller[0].scrollTop = line;
        }
    }

    function update_server_scroll()
    {
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }
        var $popup = ui.top_popup();
        if (!$popup.hasClass("formatted-scroller"))
            return;
        var body = $popup.find(".simplebar-scroll-content").parent()[0];
        var s = scroller(body);
        var container = s.scrollElement;
        var line_height = scroller_line_height(s);
        comm.send_message("formatted_scroller_scroll", {
            scroll: Math.round(container.scrollTop / line_height),
        });
    }

    function scroller_onscroll()
    {
        // don't tell the server we scrolled, when we did so because the
        // server told us to; not absolutely necessary, but nice to have
        if (scroller_from_server)
            return;
        if (!update_server_scroll_timeout)
            update_server_scroll_timeout = setTimeout(update_server_scroll, 100);
    }

    function parse_resists_text(raw_text)
    {
        var text = (raw_text || "").replace(/<[^>]+>/g, "");
        var lines = text.split("\n");

        var data = {
            heroName: "Player",
            heroClass: "",
            turns: "0",
            time: "00:00:00",
            hp: "0/0",
            ac: "0",
            str: "0",
            xl: "1",
            nextExp: "0%",
            mp: "0/0",
            ev: "0",
            intStat: "0",
            god: "No God",
            gold: "0",
            sh: "0",
            dex: "0",
            spells: "0/0 levels left",
            resists: [],
            equipment: [],
            passives: "",
            status: "",
            mutations: ""
        };

        if (lines.length > 0)
        {
            var mTitle = lines[0].match(/^(.*?)\s+Turns:\s*(\d+),\s*Time:\s*([\d:]+)/);
            if (mTitle)
            {
                var fullTitle = mTitle[1].trim();
                var mParen = fullTitle.match(/^(.*?)\s*\((.*?)\)$/);
                if (mParen)
                {
                    data.heroName = mParen[1].trim();
                    data.heroClass = mParen[2].trim();
                }
                else
                {
                    data.heroName = fullTitle;
                }
                data.turns = mTitle[2];
                data.time = mTitle[3];
            }
        }

        for (var i = 1; i < lines.length; i++)
        {
            var line = lines[i];
            var trimmed = line.trim();
            if (!trimmed)
                continue;

            // Stats
            var mHp = line.match(/Health:\s*([\d/]+)\s+AC:\s*(-?\d+)\s+Str:\s*(-?\d+)\s+XL:\s*(\d+)\s+Next:\s*([\d%]+)/);
            if (mHp)
            {
                data.hp = mHp[1];
                data.ac = mHp[2];
                data.str = mHp[3];
                data.xl = mHp[4];
                data.nextExp = mHp[5];
                continue;
            }

            var mMp = line.match(/Magic:\s*([\d/]+)\s+EV:\s*(-?\d+)\s+Int:\s*(-?\d+)\s+God:\s*(.*?)(?=\s{2,}|\s*$)/);
            if (mMp)
            {
                data.mp = mMp[1];
                data.ev = mMp[2];
                data.intStat = mMp[3];
                data.god = mMp[4].trim();
                continue;
            }

            var mGold = line.match(/Gold:\s*(\d+)\s+SH:\s*(-?\d+)\s+Dex:\s*(-?\d+)\s+Spells:\s*(.*)/);
            if (mGold)
            {
                data.gold = mGold[1];
                data.sh = mGold[2];
                data.dex = mGold[3];
                data.spells = mGold[4].trim();
                continue;
            }

            // Bottom tags
            if (trimmed.startsWith("%:"))
            {
                data.passives = trimmed.substring(2).trim();
                continue;
            }
            if (trimmed.startsWith("@:"))
            {
                data.status = trimmed.substring(2).trim();
                continue;
            }
            if (trimmed.startsWith("A:"))
            {
                data.mutations = trimmed.substring(2).trim();
                continue;
            }

            // Resistances & Equipment
            var mEq = line.match(/\s{2,}([a-zA-Z]\s*-\s*.+|\(no\s+[a-z]+\))$/);
            var resStr = line;
            if (mEq)
            {
                data.equipment.push(mEq[1].trim());
                resStr = line.substring(0, mEq.index).trim();
            }

            var mRes = resStr.match(/^(rFire|rCold|rNeg|rPois|rElec|rCorr|SInv|Will|Stlth|HPRegen|MPRegen)\s+(.*)/);
            if (mRes)
            {
                data.resists.push({
                    name: mRes[1],
                    value: mRes[2].trim()
                });
            }
        }

        return data;
    }

    function render_elden_ring_resists_html(data)
    {
        var resistIcons = {
            "rFire": { icon: "🔥", label: "Fire Resistance" },
            "rCold": { icon: "❄️", label: "Cold Resistance" },
            "rNeg": { icon: "💀", label: "Negative Energy" },
            "rPois": { icon: "🧪", label: "Poison Resistance" },
            "rElec": { icon: "⚡", label: "Electricity Resistance" },
            "rCorr": { icon: "💧", label: "Corrosion Resistance" },
            "SInv": { icon: "👁️", label: "See Invisible" },
            "Will": { icon: "🔮", label: "Willpower" },
            "Stlth": { icon: "👣", label: "Stealth" },
            "HPRegen": { icon: "❤️", label: "HP Regen" },
            "MPRegen": { icon: "💙", label: "MP Regen" }
        };

        var html = '<div class="er-resists-container">';

        // 1. Header Banner
        html += '<div class="er-profile-header-bar">';
        html += '  <div class="er-profile-header-left">';
        html += '    <span class="er-profile-header-icon">🛡️</span>';
        html += '    <div class="er-profile-title-group">';
        html += '      <span class="er-profile-hero-name">' + (data.heroName || "Hero") + '</span>';
        if (data.heroClass)
            html += '      <span class="er-profile-hero-class">' + data.heroClass + '</span>';
        html += '    </div>';
        html += '  </div>';
        html += '  <div class="er-profile-header-right">';
        html += '    <div class="er-profile-meta-pill">';
        html += '      <span>TURNS: <b>' + data.turns + '</b></span>';
        html += '      <span class="er-dot">•</span>';
        html += '      <span>TIME: <b>' + data.time + '</b></span>';
        html += '    </div>';
        html += '    <button class="er-profile-close-btn" title="Close (Esc)">✕ Esc</button>';
        html += '  </div>';
        html += '</div>';

        // 2. Stats Grid (Vitals, Defenses, Attributes, Progress)
        html += '<div class="er-profile-stats-grid">';
        
        // Vitals card
        html += '  <div class="er-stat-card er-card-vitals">';
        html += '    <div class="er-card-header">VITALS</div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Health</span><span class="er-stat-val val-hp">' + data.hp + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Magic</span><span class="er-stat-val val-mp">' + data.mp + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Gold</span><span class="er-stat-val val-gold">💰 ' + data.gold + '</span></div>';
        html += '  </div>';

        // Defenses card
        html += '  <div class="er-stat-card er-card-defenses">';
        html += '    <div class="er-card-header">DEFENSES</div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Armour (AC)</span><span class="er-stat-val val-ac">' + data.ac + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Evasion (EV)</span><span class="er-stat-val val-ev">' + data.ev + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Shield (SH)</span><span class="er-stat-val val-sh">' + data.sh + '</span></div>';
        html += '  </div>';

        // Attributes card
        html += '  <div class="er-stat-card er-card-attributes">';
        html += '    <div class="er-card-header">ATTRIBUTES</div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Strength</span><span class="er-stat-val val-str">' + data.str + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Intelligence</span><span class="er-stat-val val-int">' + data.intStat + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Dexterity</span><span class="er-stat-val val-dex">' + data.dex + '</span></div>';
        html += '  </div>';

        // Progress card
        html += '  <div class="er-stat-card er-card-progress">';
        html += '    <div class="er-card-header">PROGRESS</div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Level (XL)</span><span class="er-stat-val val-xl">' + data.xl + ' (' + data.nextExp + ')</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Deity</span><span class="er-stat-val val-god">' + data.god + '</span></div>';
        html += '    <div class="er-stat-row"><span class="er-stat-lbl">Spell Cap</span><span class="er-stat-val val-spells">' + data.spells + '</span></div>';
        html += '  </div>';

        html += '</div>'; // end stats grid

        // 3. Main Split (Resistances Table on Left, Equipment Loadout on Right)
        html += '<div class="er-profile-columns">';

        // Left Column: Resistances
        html += '  <div class="er-column er-resists-col">';
        html += '    <div class="er-section-header"><span class="er-sec-icon">✨</span> RESISTANCES & RECOVERY</div>';
        html += '    <div class="er-resists-list">';
        for (var r = 0; r < data.resists.length; r++)
        {
            var item = data.resists[r];
            var info = resistIcons[item.name] || { icon: "🔹", label: item.name };
            
            var valClean = item.value;
            var isPositive = valClean.indexOf("+") !== -1;
            var isRegen = item.name.indexOf("Regen") !== -1;
            
            html += '      <div class="er-resist-row' + (isPositive ? ' active' : '') + '">';
            html += '        <span class="er-res-icon">' + info.icon + '</span>';
            html += '        <span class="er-res-name">' + item.name + '</span>';
            html += '        <span class="er-res-label">' + info.label + '</span>';
            html += '        <span class="er-res-val' + (isPositive ? ' val-pos' : (isRegen ? ' val-regen' : '')) + '">' + valClean + '</span>';
            html += '      </div>';
        }
        html += '    </div>';
        html += '  </div>';

        // Right Column: Equipment
        html += '  <div class="er-column er-equip-col">';
        html += '    <div class="er-section-header"><span class="er-sec-icon">⚔️</span> EQUIPPED GEAR</div>';
        html += '    <div class="er-equip-list">';
        for (var e = 0; e < data.equipment.length; e++)
        {
            var eq = data.equipment[e];
            var isEmpty = eq.startsWith("(no ");
            var mLetter = eq.match(/^([a-zA-Z])\s*-\s*(.*)/);
            
            if (isEmpty)
            {
                var slotName = eq.replace(/^\(no\s+|\)$/g, "");
                html += '      <div class="er-equip-row empty">';
                html += '        <span class="er-slot-icon">◽</span>';
                html += '        <span class="er-slot-name">' + slotName + '</span>';
                html += '        <span class="er-slot-empty">Empty</span>';
                html += '      </div>';
            }
            else if (mLetter)
            {
                var letter = mLetter[1];
                var name = mLetter[2];
                var isPlus = name.indexOf("+") !== -1;
                html += '      <div class="er-equip-row equipped' + (isPlus ? ' enchanted' : '') + '">';
                html += '        <span class="er-equip-key">[' + letter + ']</span>';
                html += '        <span class="er-equip-name">' + name + '</span>';
                html += '      </div>';
            }
            else
            {
                html += '      <div class="er-equip-row equipped"><span class="er-equip-name">' + eq + '</span></div>';
            }
        }
        html += '    </div>';
        html += '  </div>';

        html += '</div>'; // end columns

        // 4. Bottom Section: Passives, Status, Mutations
        html += '<div class="er-profile-bottom-cards">';
        
        if (data.passives)
        {
            html += '  <div class="er-trait-card">';
            html += '    <span class="er-trait-badge">PASSIVES</span>';
            html += '    <span class="er-trait-text">' + data.passives + '</span>';
            html += '  </div>';
        }
        if (data.status)
        {
            html += '  <div class="er-trait-card">';
            html += '    <span class="er-trait-badge">STATUS</span>';
            html += '    <span class="er-trait-text">' + data.status + '</span>';
            html += '  </div>';
        }
        if (data.mutations)
        {
            html += '  <div class="er-trait-card">';
            html += '    <span class="er-trait-badge badge-mut">TRAITS & MUTATIONS</span>';
            html += '    <div class="er-mutation-pills">';
            var muts = data.mutations.split(",");
            for (var m = 0; m < muts.length; m++)
            {
                var mut = muts[m].trim();
                if (mut)
                {
                    html += '<span class="er-mut-pill">' + mut + '</span>';
                }
            }
            html += '    </div>';
            html += '  </div>';
        }

        html += '</div>'; // end bottom cards

        // 5. Footer Hint
        html += '<div class="er-profile-footer-hint">Press ' + keybinds.html("Esc") + ' or ' + keybinds.html("Space") + ' or click anywhere to return</div>';

        html += '</div>'; // end container
        return html;
    }

    // Command help uses white text for keys and yellow for section headings.
    // Keep the server's preformatted columns and only decorate key tokens.
    function format_help_keys($body)
    {
        $body.find(".fg15").each(function () {
            var $entry = $(this);
            var key = $entry.text().trim();
            if (/^(?:[!-~]|(?:Ctrl|Alt|Shift)[-+]\S+|Esc|Tab|Enter|Space|Bksp|Backspace|Del|Home|End|PgUp|PgDn|Dir\.)$/.test(key))
                $entry.contents().replaceWith(keybinds.badge(key.replace(/^(Ctrl|Alt|Shift)-/, "$1+")));
        });
    }

    function formatted_scroller(desc)
    {
        var $popup = $(".templates > .formatted-scroller").clone();
        var $body = $popup.children(".body");
        var body_html = util.formatted_string_to_html(desc.text);
        if (desc.highlight !== "")
        {
            var rexp = '[^\n]*('+desc.highlight+')[^\n]*\n?';
            var re = new RegExp(rexp, 'g');
            body_html = body_html.replace(re, function (line) {
                return "<span class=highlight>" + line + "</span>";
            });
        }
        $popup.attr("data-tag", desc.tag);

        if (desc.tag === "resists")
        {
            var parsed = parse_resists_text(desc.text);
            var custom_html = render_elden_ring_resists_html(parsed);
            $body.html(custom_html);
            $popup.addClass("er-profile-popup");
            $popup.find(".er-profile-close-btn").on("click", function(e) {
                e.stopPropagation();
                comm.send_message("key", { keycode: 27 });
            });
        }
        else if (desc.tag === "dungeon_overview" || (desc.text && desc.text.indexOf("Dungeon Overview") !== -1))
        {
            $popup.attr("data-tag", "dungeon_overview");
            $popup.addClass("er-overview-popup");
            $body.html(body_html);
            if (desc.tag === "help")
                format_help_keys($body);
            var overviewHeader = $(
                '<div class="er-overview-header-bar">' +
                '  <div class="er-overview-header-left">' +
                '    <span class="er-overview-icon">🏰</span>' +
                '    <span class="er-overview-title">DUNGEON OVERVIEW & LOCATIONS</span>' +
                '  </div>' +
                '  <div class="er-overview-header-right">' +
                '    <span class="er-overview-hint">' + keybinds.html("G") + ' Travel &nbsp;|&nbsp; ' + keybinds.html("_") + ' Altars &nbsp;|&nbsp; ' + keybinds.html("Esc") + ' Close</span>' +
                '    <button class="er-overview-close-btn" title="Close (Esc)">✕</button>' +
                '  </div>' +
                '</div>'
            );
            $popup.prepend(overviewHeader);
            overviewHeader.find(".er-overview-close-btn").on("click", function (e) {
                e.stopPropagation();
                comm.send_message("key", { keycode: 27 });
            });
        }
        else
        {
            $body.html(body_html);
            if (desc.tag === "help")
                format_help_keys($body);
        }

        if (desc.more)
            $popup.children(".more").html(util.formatted_string_to_html(desc.more));
        else
            $popup.children(".more").remove();

        // XX why do some layouts use a span inside of a div, some just use
        // the div? (Answer remains unclear to me, but something about
        // preformatting + nested spans did mess this up when I tried to use
        // a template span here)
        if (desc.title)
            $popup.children(".header").html(util.formatted_string_to_html(desc.title));
        else
            $popup.children(".header").remove();

        var s = scroller($body[0]);
        var scroll_elem = s.scrollElement;
        scroll_elem.addEventListener("scroll", scroller_onscroll);
        $popup.on("keydown keypress", function (event) {
            if (event.which !== 36 || desc.tag !== "help")
                scroller_handle_key(s, event);
        });
        if (desc.easy_exit && options.get("tile_web_mouse_control"))
        {
            $popup.on("click", function () {
                // XX a bit ad hoc
                comm.send_message("key", { keycode: 27 });
            });
        }
        return $popup;
    }

    function formatted_scroller_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("formatted-scroller"))
            return;
        var s = scroller($popup.find(".body")[0]);
        if (msg.text !== undefined)
        {
            var $body = $(s.contentElement);
            if ($popup.attr("data-tag") === "resists")
            {
                var parsed = parse_resists_text(msg.text);
                var custom_html = render_elden_ring_resists_html(parsed);
                $body.html(custom_html);
                $popup.find(".er-profile-close-btn").on("click", function(e) {
                    e.stopPropagation();
                    comm.send_message("key", { keycode: 27 });
                });
            }
            else
            {
                $body.html(util.formatted_string_to_html(msg.text));
                if ($popup.attr("data-tag") === "help")
                    format_help_keys($body);
            }
            var ss = $popup.find(".body").eq(0).data("scroller");
            if (ss && ss.recalculateImmediate)
                ss.recalculateImmediate();
        }
        if (msg.scroll !== undefined && (!msg.from_webtiles || client.is_watching()))
        {
            scroller_from_server = true;
            scroller_scroll_to_line(s, msg.scroll);
            scroller_from_server = false;
        }
    }

    function msgwin_get_line(msg)
    {
        var $popup = $(".templates > .msgwin-get-line").clone();
        $popup.children(".header").html(util.formatted_string_to_html(msg.prompt));
        return $popup;
    }

    function update_cc_preview($popup, $button)
    {
        if (!$popup || !$button || $button.length === 0)
            return;
        var name = $button.attr("data-name") || "";
        var group = $button.attr("data-group") || "";
        var rec = $button.attr("data-recommendation") || "";
        var skill = $button.attr("data-skill") || "";
        var apt = $button.attr("data-aptitude");
        var desc = $button.attr("data-desc") || "";
        var tile = $button.data("tile");
        var doll = $popup.data("doll");
        var step = $popup.data("step");

        var $codex = $popup.find(".cc-codex-card");
        if ($codex.length === 0)
            return;

        // Title and Group
        $codex.find(".cc-codex-title").text(name);
        $codex.find(".cc-codex-group").text(group ? "── " + group + " ──" : "");

        // Recommendation Badge
        var $recBadge = $codex.find(".cc-codex-rec");
        if (rec === "recommended")
        {
            $recBadge.html("<span class='cc-badge cc-badge-rec'>★ Recommended for your character</span>").show();
        }
        else if (rec === "allowed" && step !== "species")
        {
            $recBadge.html("<span class='cc-badge cc-badge-allowed'>Allowed Option</span>").show();
        }
        else
        {
            $recBadge.empty().hide();
        }

        // Weapon Stats (for weapon step)
        var $weaponStats = $codex.find(".cc-codex-weapon-stats");
        if (skill)
        {
            var aptVal = parseInt(apt, 10);
            var aptSign = isNaN(aptVal) ? "" : (aptVal > 0 ? "+" + aptVal : "" + aptVal);
            var aptCls = aptVal > 0 ? "apt-pos" : (aptVal < 0 ? "apt-neg" : "apt-zero");
            var statsHtml = "<div class='cc-stat-row'>" +
                "<div class='cc-stat-chip'><span class='cc-stat-lbl'>Skill:</span> <span class='cc-stat-val'>" + skill + "</span></div>" +
                (aptSign ? "<div class='cc-stat-chip'><span class='cc-stat-lbl'>Aptitude:</span> <span class='cc-stat-val " + aptCls + "'>" + aptSign + " apt</span></div>" : "") +
                "</div>";
            $weaponStats.html(statsHtml).show();
        }
        else
        {
            $weaponStats.empty().hide();
        }

        // Description
        $codex.find(".cc-codex-desc").html(util.formatted_string_to_html(desc));

        // Canvas Avatar
        var $canvas = $codex.find(".cc-codex-avatar");
        if ($canvas.length > 0)
        {
            var ctx = $canvas[0].getContext("2d");
            ctx.clearRect(0, 0, $canvas[0].width, $canvas[0].height);
            var renderer = new cr.DungeonCellRenderer();
            renderer.init($canvas[0]);
            if (step === "weapon" && doll && doll.length > 0)
            {
                $.each(doll, function (_, part) {
                    renderer.draw_player(part[0], 0, 0, 0, 0, part[1]);
                });
            }
            else if (tile && tile.length > 0)
            {
                $.each(tile, function (_, t) {
                    renderer.draw_from_texture(t.t, 0, 0, t.tex, 0, 0, t.ymax, false);
                });
            }
        }
    }

    function build_character_creation_ui(msg, $popup)
    {
        var creation = msg.creation || {};
        var step = creation.step || "species";
        var species = creation.species || "";
        var background = creation.background || "";
        var unavailable = creation.unavailable_backgrounds || [];
        var renderer = new cr.DungeonCellRenderer();

        $popup.addClass("character-creation-modern step-" + step);
        $popup.data("step", step);
        if (msg.doll)
            $popup.data("doll", msg.doll);

        // Header & Stepper
        var $header = $("<div class='cc-header'>");
        var $topRow = $("<div class='cc-top-row'>");
        var $titleBox = $("<div class='cc-title-box'>");

        var stepTitles = {
            "species": "Choose Your Species",
            "background": "Choose Your Background",
            "weapon": "Choose Your Starting Weapon"
        };
        var stepTitle = stepTitles[step] || "Character Creation";
        $titleBox.append($("<h2 class='cc-main-title'>").text(stepTitle));
        var subtitle = msg.prompt ? util.formatted_string_to_html(msg.prompt) :
            (step === "species" ? "Select the lineage that defines your intrinsic resistances and aptitudes." :
             step === "background" ? "Select your profession, starting equipment, and initial training." :
             "Select your starting weapon suited to your combat training.");
        $titleBox.append($("<div class='cc-subtitle'>").html(subtitle));
        $topRow.append($titleBox);

        $header.append($topRow);

        // Stepper Progress Bar
        var $stepper = $("<div class='cc-stepper'>");

        // Step 1: Species
        var $step1 = $("<div class='cc-step-item'>").attr("data-step", "species");
        if (step === "species") $step1.addClass("active");
        else if (species) $step1.addClass("completed");
        var s1Text = species ? "✓ " + species : "1. Species";
        $step1.html("<span class='cc-step-num'>I</span><span class='cc-step-label'>" + s1Text + "</span>");

        // Step 2: Background
        var $step2 = $("<div class='cc-step-item'>").attr("data-step", "background");
        if (step === "background") $step2.addClass("active");
        else if (background) $step2.addClass("completed");
        var s2Text = background ? "✓ " + background : "2. Background";
        $step2.html("<span class='cc-step-num'>II</span><span class='cc-step-label'>" + s2Text + "</span>");

        // Step 3: Weapon
        var $step3 = $("<div class='cc-step-item'>").attr("data-step", "weapon");
        if (step === "weapon") $step3.addClass("active");
        var s3Text = step === "weapon" ? "3. Weapon" : "3. Weapon";
        $step3.html("<span class='cc-step-num'>III</span><span class='cc-step-label'>" + s3Text + "</span>");

        $stepper.append($step1).append("<div class='cc-step-arrow'>──►</div>")
                .append($step2).append("<div class='cc-step-arrow'>──►</div>")
                .append($step3);
        $header.append($stepper);

        // Main Body Layout (Left: Choices, Right: Codex)
        var $body = $("<div class='cc-body'>");
        var $choicesCol = $("<div class='cc-choices-column'>");
        var $codexCol = $("<div class='cc-codex-column'>");

        // Organize buttons into groups based on main-items.labels
        var labels = msg["main-items"].labels || [];
        var buttons = msg["main-items"].buttons || [];
        var menu_id = msg["main-items"].menu_id;

        function clean_lbl(raw) {
            return $("<div>").html(util.formatted_string_to_html(raw)).text().trim();
        }

        var groupsMap = [];
        var groupNames = [];

        if (labels.length > 0) {
            var sortedLabels = labels.slice().sort(function (a, b) {
                return (a.x - b.x) || (a.y - b.y);
            });
            $.each(sortedLabels, function (_, lbl) {
                var name = clean_lbl(lbl.label);
                if (name && groupNames.indexOf(name) === -1) {
                    groupNames.push(name);
                    groupsMap.push({ name: name, label: lbl, buttons: [] });
                }
            });
        }
        if (groupsMap.length === 0) {
            groupsMap.push({ name: "Available Choices", label: null, buttons: [] });
        }

        // Map each button to closest label above it in the same column
        $.each(buttons, function (_, btn) {
            var matchedGroup = null;
            var bestDist = Infinity;
            $.each(groupsMap, function (_, g) {
                if (g.label) {
                    if (g.label.x === btn.x && g.label.y < btn.y) {
                        var dist = btn.y - g.label.y;
                        if (dist < bestDist) {
                            bestDist = dist;
                            matchedGroup = g;
                        }
                    }
                }
            });
            if (!matchedGroup) {
                var colIdx = Math.min(btn.x, groupsMap.length - 1);
                matchedGroup = groupsMap[colIdx] || groupsMap[0];
            }
            matchedGroup.buttons.push(btn);
        });

        // Hidden descriptions paneset for compatibility
        var $descriptions = $("<div class='descriptions paneset' style='display:none;'>");

        // Render each group
        var firstButton = null;
        $.each(groupsMap, function (_, group) {
            if (group.buttons.length === 0 && (!unavailable || unavailable.length === 0))
                return;

            var $groupDiv = $("<div class='cc-group'>");
            $groupDiv.append($("<div class='cc-group-header'>").text(group.name));
            var $grid = $("<div class='cc-cards-grid' menu_id='" + menu_id + "'>");

            $.each(group.buttons, function (_, btn) {
                var choice = btn.choice || {};
                var choiceName = choice.name || clean_lbl(btn.label || (btn.labels ? btn.labels[0] : "")).replace(/^[a-zA-Z0-9]\s*-\s*/, "");
                var rec = choice.recommendation || "unknown";
                var hotkeyChar = ui.key_value_from_utf8(btn.hotkey);

                var $card = $("<button type='button' class='button cc-card'>");
                $card.attr("menu_id", menu_id);
                if (btn.disabled)
                    $card.prop("disabled", true);
                else if (hotkeyChar)
                    $card.attr("data-hotkey", hotkeyChar);
                $card.attr("data-name", choiceName);
                $card.attr("data-group", group.name);
                $card.attr("data-recommendation", rec);
                $card.attr("data-desc", btn.description || "");
                $card.data("tile", btn.tile || []);
                $card.addClass("hlc-" + btn.highlight_colour);

                // Hidden description for paneset_cycle
                $descriptions.append("<span class='pane'>" + (btn.description || "") + "</span>");
                $card.attr("data-description-index", $descriptions.children().length - 1);

                // Hotkey badge
                if (!btn.disabled && hotkeyChar)
                    $card.append(keybinds.badge(hotkeyChar));

                // Canvas icon
                var $iconCanvas = $("<canvas class='cc-card-icon glyph-mode-hidden'>");
                util.init_canvas($iconCanvas[0], renderer.cell_width, renderer.cell_height);
                renderer.init($iconCanvas[0]);
                $.each(btn.tile || [], function (_, t) {
                    renderer.draw_from_texture(t.t, 0, 0, t.tex, 0, 0, t.ymax, false);
                });
                $card.append($iconCanvas);

                // Name & Badges
                var $infoBox = $("<div class='cc-card-info'>");
                $infoBox.append($("<span class='cc-card-name'>").text(choiceName));

                var $badgeRow = $("<div class='cc-card-badges'>");
                if (rec === "recommended") {
                    $badgeRow.append("<span class='cc-badge cc-badge-rec'>★ Rec</span>");
                } else if (rec === "allowed" && step !== "species") {
                    $badgeRow.append("<span class='cc-badge cc-badge-allowed'>Allowed</span>");
                }

                if (choice.skill) {
                    $card.attr("data-skill", choice.skill);
                    $badgeRow.append($("<span class='cc-badge cc-badge-skill'>").text(choice.skill));
                }
                if (choice.aptitude !== undefined) {
                    $card.attr("data-aptitude", choice.aptitude);
                    var aptVal = parseInt(choice.aptitude, 10);
                    var aptSign = aptVal > 0 ? "+" + aptVal : "" + aptVal;
                    var aptCls = aptVal > 0 ? "apt-pos" : (aptVal < 0 ? "apt-neg" : "apt-zero");
                    $badgeRow.append($("<span class='cc-badge cc-badge-apt " + aptCls + "'>").text(aptSign + " apt"));
                }
                if ($badgeRow.children().length > 0)
                    $infoBox.append($badgeRow);

                $card.append($infoBox);

                // Event wiring
                $card.on("mouseenter", function () {
                    if (!btn.disabled)
                        focus_button($(this));
                });
                $card.on("click", function (e) {
                    focus_button($(this));
                    var keycode = btn.hotkey;
                    if (!btn.disabled && keycode) {
                        comm.send_message("key", { keycode: keycode });
                    }
                    e.stopPropagation();
                });

                $grid.append($card);
                if (!firstButton && !btn.disabled) firstButton = $card;
            });

            // Append unavailable backgrounds if any match this group
            if (step === "background" && unavailable.length > 0) {
                $.each(unavailable, function (_, unav) {
                    if (unav.group === group.name) {
                        var $banned = $("<div class='cc-card cc-card-banned'>");
                        var $bannedInfo = $("<div class='cc-card-info'>");
                        $bannedInfo.append($("<span class='cc-card-name'>").text(unav.name));
                        $bannedInfo.append("<span class='cc-badge cc-badge-banned'>🚫 Banned for " + species + "</span>");
                        $banned.append($bannedInfo);
                        $grid.append($banned);
                    }
                });
            }

            $groupDiv.append($grid);
            $choicesCol.append($groupDiv);
        });

        $body.append($choicesCol);

        // Right Column: Inspection Codex Card
        var $codexCard = $("<div class='cc-codex-card'>");
        var $avatarFrame = $("<div class='cc-codex-avatar-frame'>");
        var $avatarCanvas = $("<canvas class='cc-codex-avatar'>");
        util.init_canvas($avatarCanvas[0], renderer.cell_width, renderer.cell_height);
        $avatarFrame.append($avatarCanvas);
        $codexCard.append($avatarFrame);

        $codexCard.append($("<h3 class='cc-codex-title'>").text(""));
        $codexCard.append($("<div class='cc-codex-group'>").text(""));
        $codexCard.append($("<div class='cc-codex-rec'>"));
        $codexCard.append($("<div class='cc-codex-weapon-stats'>"));
        $codexCard.append("<div class='cc-codex-divider'></div>");
        $codexCard.append($("<div class='cc-codex-desc'>").text(""));

        $codexCol.append($codexCard);
        $body.append($codexCol);

        // Footer Action Dock (Sub-items)
        var $dock = $("<div class='cc-dock'>");
        var subData = msg["sub-items"] || {};
        var sub_menu_id = subData.menu_id || "sub-menu";
        var $subGrid = $("<div class='cc-dock-actions' menu_id='" + sub_menu_id + "'>");

        $.each(keybinds.creationControls(msg), function (_, sBtn) {
            var sHotkey = ui.key_value_from_utf8(sBtn.hotkey);
            var sLabel = clean_lbl(sBtn.label || (sBtn.labels ? sBtn.labels[0] : ""));
            if (sHotkey)
                sLabel = sLabel.replace(/^\S+\s+-\s+/, "");
            var $sPill = $("<button type='button' class='button cc-dock-pill'>");
            $sPill.attr("menu_id", sub_menu_id);
            $sPill.attr("data-hotkey", sHotkey);
            if (sHotkey)
                $sPill.append(keybinds.badge(sHotkey));
            $sPill.append($("<span class='cc-dock-label'>").text(sLabel));

            $sPill.on("click", function (e) {
                var keycode = sBtn.hotkey;
                if (keycode) {
                    comm.send_message("key", { keycode: keycode });
                }
                e.stopPropagation();
            });
            $subGrid.append($sPill);
        });
        $dock.append($subGrid);

        // Assemble $popup
        $popup.empty();
        $popup.append($header);
        $popup.append($body);
        $popup.append($dock);
        $popup.append($descriptions);

        // Auto-focus first button to populate codex immediately
        if (firstButton) {
            setTimeout(function () {
                focus_button(firstButton);
            }, 0);
        }

        return $popup;
    }

    function focus_button($button)
    {
        var $popup = $button.closest(".newgame-choice");
        var menu_id = $button.closest("[menu_id]").attr("menu_id");
        $popup.find(".button.selected").removeClass("selected");
        $button.addClass("selected");
        var $scr = $button.closest(".simplebar-scroll-content");
        if ($scr.length === 1)
        {
            var br = $button[0].getBoundingClientRect();
            var gr = $scr.parent()[0].getBoundingClientRect();
            var delta = br.top < gr.top ? br.top - gr.top :
                    br.bottom > gr.bottom ? br.bottom - gr.bottom : 0;
            $scr[0].scrollTop += delta;
        }
        var $ccChoices = $button.closest(".cc-choices-column");
        if ($ccChoices.length === 1)
        {
            var cbr = $button[0].getBoundingClientRect();
            var cgr = $ccChoices[0].getBoundingClientRect();
            var cdelta = cbr.top < cgr.top ? cbr.top - cgr.top - 10 :
                    cbr.bottom > cgr.bottom ? cbr.bottom - cgr.bottom + 10 : 0;
            if (cdelta !== 0)
                $ccChoices[0].scrollTop += cdelta;
        }

        var $descriptions = $popup.find(".descriptions");
        paneset_cycle($descriptions, $button.attr("data-description-index"));
        if ($popup.hasClass("character-creation-modern"))
            update_cc_preview($popup, $button);
        comm.send_message("outer_menu_focus", {
            hotkey: ui.utf8_from_key_value($button.attr("data-hotkey")),
            menu_id: menu_id,
        });
    }

    function newgame_choice(msg)
    {
        var $popup = $(".templates > .newgame-choice").clone();
        if (msg.creation)
        {
            return build_character_creation_ui(msg, $popup);
        }
        if (msg.doll)
        {
            var $canvas = $("<canvas>");
            var $title = $("<span>");
            var $prompt = $("<div class=header>");
            $popup.children(".header").append($canvas).append($title).after($prompt);
            $title.html(util.formatted_string_to_html(msg.title));
            $prompt.html(util.formatted_string_to_html(msg.prompt));
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
            renderer.init($canvas[0]);
            $.each(msg.doll, function (i, doll_part) {
                renderer.draw_player(doll_part[0], 0, 0, 0, 0, doll_part[1]);
            });
        }
        else
            $popup.children(".header").html(util.formatted_string_to_html(msg.title));
        var renderer = new cr.DungeonCellRenderer();
        var $descriptions = $popup.find(".descriptions");

        function build_item_grid(data, $container, fat)
        {
            $container.attr("menu_id", data.menu_id);
            $.each(data.buttons, function (i, button) {
                var $button = $("<div class=button>");
                if ((button.tile || []).length > 0 || fat)
                {
                    var $canvas = $("<canvas class='glyph-mode-hidden'>");
                    util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
                    renderer.init($canvas[0]);

                    $.each(button.tile || [], function (_, tile) {
                        renderer.draw_from_texture(tile.t, 0, 0, tile.tex, 0, 0, tile.ymax, false);
                    });
                    $button.append($canvas);
                }
                $.each(button.labels || [button.label], function (i, label) {
                    // TODO: this has somewhat weird behavior if multiple spans
                    // are produced from the formatted string...should they
                    // really have a flex-grow property?
                    var $lbl = $(util.formatted_string_to_html(label)).css("flex-grow", "1");
                    $button.append($lbl);
                });
                // at least remove empty spans because of the above issue:
                $button.find("span:empty").remove();
                $button.attr("style", "grid-row:"+(button.y+1)+"; grid-column:"+(button.x+1)+";");
                $descriptions.append("<span class='pane'> " + button.description + "</span>");
                $button.attr("data-description-index", $descriptions.children().length - 1);
                $button.attr("data-hotkey", ui.key_value_from_utf8(button.hotkey));
                $button.addClass("hlc-" + button.highlight_colour);
                $container.append($button);

                $button.on('mouseenter', function () { focus_button($(this)); });
                $button.on('click', function (e) {
                    focus_button($(this));
                    var keycode = button.hotkey;
                    if (keycode) {
                        comm.send_message("key", { keycode: keycode });
                    }
                    e.stopPropagation();
                });
            });
            $.each(data.labels, function (i, button) {
                var $button = $("<div class=label>");
                $button.append(util.formatted_string_to_html(button.label));
                $button.attr("style", "grid-row:"+(button.y+1)+"; grid-column:"+(button.x+1)+";");
                $container.append($button);
            });
        }

        var $main = $popup.find(".main-items");
        build_item_grid(msg["main-items"], $main, true);
        build_item_grid(msg["sub-items"], $popup.find(".sub-items"));
        scroller($main.parent()[0]);

        return $popup;
    }

    function newgame_choice_update(msg)
    {
        if (!client.is_watching() && msg.from_client)
            return;
        var $popup = ui.top_popup();
        if (!$popup || !$popup.hasClass("newgame-choice"))
            return;
        var hotkey = ui.key_value_from_utf8(msg.button_focus);
        focus_button($popup.find("[data-hotkey='"+hotkey+"']"));
    }

    function newgame_random_combo(msg)
    {
        var $popup = $(".templates > .describe-generic").clone();
        $popup.find(".header > span").html(util.formatted_string_to_html(msg.prompt));
        var $body = $popup.find(".body").text("Do you want to play this combination? ");
        [{ key: "y", label: "Play" }, { key: "n", label: "Try again" },
            { key: "q", label: "Cancel" }].forEach(function (action) {
            var $button = $("<button type='button'>").attr("data-hotkey", action.key);
            $button.append(keybinds.badge(action.key), document.createTextNode(" " + action.label));
            $body.append($button, " ");
        });

        var $canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
        renderer.init($canvas[0]);
        $.each(msg.doll, function (i, doll_part) {
            renderer.draw_player(doll_part[0], 0, 0, 0, 0, doll_part[1]);
        });

        return $popup;
    }

    function game_over(desc)
    {
        var $popup = $(".templates > .game-over").clone();
        $popup.find(".header > span").html(desc.title);
        $popup.children(".body").html(fmt_body_txt(desc.body));
        var s = scroller($popup.children(".body")[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas[0], renderer.cell_width, renderer.cell_height);
        renderer.init(canvas[0]);
        renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0, desc.tile.ymax, false);

        return $popup;
    }

    function seed_selection(desc)
    {
        var $popup = $(".templates > .seed-selection").clone();
        $popup.find(".header").text(desc.title);
        $popup.find(".body-text").html(desc.body);
        $popup.find(".footer").html(desc.footer);
        if (!desc.show_pregen_toggle)
            $popup.find(".pregen-toggle").remove();
        scroller($popup.find(".body")[0]);

        var $input = $popup.find("input[type=text]");
        var input_val = $input.val();
        $input.on("input change", function (event) {
            var valid_seed = $input.val().match(/^\d*$/);
            if (valid_seed)
                input_val = $input.val();
            else
                $input.val(input_val);
        });

        return $popup;
    }

    var ui_handlers = {
        "describe-generic" : describe_generic,
        "describe-feature-wide" : describe_feature_wide,
        "describe-item" : describe_item,
        "describe-spell" : describe_spell,
        "describe-cards" : describe_cards,
        "describe-god" : describe_god,
        "describe-monster" : describe_monster,
        "version" : version,
        "formatted-scroller" : formatted_scroller,
        "progress-bar" : progress_bar,
        "seed-selection" : seed_selection,
        "msgwin-get-line" : msgwin_get_line,
        "newgame-choice": newgame_choice,
        "newgame-random-combo": newgame_random_combo,
        "game-over" : game_over,
    };

    function register_ui_handlers(dict)
    {
        $.extend(ui_handlers, dict);
    }

    function recv_ui_push(msg)
    {
        var popup = null
        var handler = ui_handlers[msg.type];
        try
        {
            popup = handler
                ? handler(msg)
                : $("<div>Unhandled UI type " + msg.type + "</div>");
        }
        catch (err)
        {
            console.log(err);
            popup = $("<div>Buggy UI of type " + msg.type + "</div>");
        }
        ui.show_popup(popup, msg["ui-centred"], msg.generation_id);
        if (msg.type === "formatted-scroller")
        {
            popup.closest(".ui-popup-outer").addClass("popup-inventory-outer");
            popup.closest(".ui-popup").addClass("popup-inventory-wrapper");
        }
    }

    function recv_ui_pop(msg)
    {
        ui.hide_popup();
    }

    var ui_stack_handled = false;

    function recv_ui_stack(msg)
    {
        if (!client.is_watching())
            return;
        // only process once on load
        if (ui_stack_handled)
            return;

        for (var i = 0; i < msg.items.length; i++)
            comm.handle_message(msg.items[i]);
        ui_stack_handled = true;
    }

    function recv_ui_state(msg)
    {
        var ui_handlers = {
            "describe-god" : describe_god_update,
            "describe-monster" : describe_monster_update,
            "formatted-scroller" : formatted_scroller_update,
            "progress-bar" : progress_bar_update,
            "newgame-choice" : newgame_choice_update,
            "describe-spell-success" : describe_item_spell_success,
        };
        var handler = ui_handlers[msg.type];
        if (handler)
            handler(msg);
    }

    function recv_ui_scroll(msg)
    {
        var $popup = ui.top_popup();
        // formatted scrollers send their own synchronization messages
        if ($popup === undefined
            || $popup.hasClass("formatted-scroller")
            || $popup.hasClass("menu"))
            return;

        if (msg.scroll !== undefined && (!msg.from_webtiles || client.is_watching()))
        {
            var body = $popup.find(".simplebar-scroll-content").parent();
            if (body.length === 1)
                scroller_scroll_to_line(scroller(body[0]), msg.scroll);
        }
    }

    function ui_layouts_cleanup()
    {
        ui_stack_handled = false;
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }
    }

    $(document).off("game_init.ui-layouts")
        .on("game_init.ui-layouts", function () {
        $(document).off("game_cleanup.ui-layouts")
                   .on("game_cleanup.ui-layouts", ui_layouts_cleanup);
    });

    comm.register_handlers({
        "ui-push": recv_ui_push,
        "ui-pop": recv_ui_pop,
        "ui-stack": recv_ui_stack,
        "ui-state": recv_ui_state,
        "ui-scroller-scroll": recv_ui_scroll,
    });

    return {
        register_handlers: register_ui_handlers,
    };
});
