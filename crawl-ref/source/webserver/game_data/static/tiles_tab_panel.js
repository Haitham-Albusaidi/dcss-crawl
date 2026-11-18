/**
 * DCSS Authentic Native Tiles Tab & Inventory Grid Panel
 * Exact recreation of the desktop DCSS SDL2 tiles inventory and action region.
 */
define(["jquery", "comm", "client", "./cell_renderer", "./player",
        "./tileinfo-gui", "./tileinfo-main", "./tileinfo-icons", "./util", "./enums"],
function ($, comm, client, cr, player, gui, main, icons, util, enums) {
    "use strict";

    var NUM_COLS = 12;
    var NUM_ROWS = 6; // 6 rows = 72 slots (covers all 52 letters a-z, A-Z + bottom padding)
    var CELL_SIZE = 32;

    var COMMANDS = [
        { id: "explore", tile: gui.CMD_EXPLORE, key: "o", label: "Auto-Explore (o)" },
        { id: "travel", tile: gui.CMD_INTERLEVEL_TRAVEL, key: "G", label: "Interlevel Travel (G)" },
        { id: "rest", tile: gui.CMD_REST, key: "5", label: "Rest / Heal (5)" },
        { id: "wait", tile: gui.CMD_WAIT, key: ".", label: "Wait 1 Turn (.)" },
        { id: "autofight", tile: gui.CMD_AUTOFIGHT, keycode: 9, key: "Tab", label: "Auto-Fight (Tab)" },
        { id: "pickup", tile: null, iconText: "📥", key: ",", label: "Pick Up Floor (,)" },
        { id: "drop", tile: gui.CMD_DROP, key: "d", label: "Drop Item (d)" },
        { id: "cast", tile: gui.CMD_CAST_SPELL, key: "z", label: "Cast Spell (z)" },
        { id: "ability", tile: gui.CMD_USE_ABILITY, key: "a", label: "Use Ability (a)" },
        { id: "skills", tile: gui.CMD_DISPLAY_SKILLS, key: "m", label: "Skills (m)" },
        { id: "memorise", tile: gui.CMD_MEMORISE_SPELL, key: "M", label: "Memorise Spell (M)" },
        { id: "map", tile: gui.CMD_DISPLAY_MAP, key: "X", label: "Dungeon Map (X)" },
        { id: "known", tile: gui.CMD_KNOWN_ITEMS, key: "\\", label: "Known Items (\\)" },
        { id: "search", tile: gui.CMD_SEARCH_STASHES, keycode: 6, ctrl: true, label: "Search Stashes (Ctrl+F)" }
    ];

    var TABS = [
        { id: "item", tile: gui.TAB_ITEM, label: "Inventory (i)", key: "i" },
        { id: "spell", tile: gui.TAB_SPELL, label: "Spells (z)", key: "z" },
        { id: "memorise", tile: gui.TAB_MEMORISE, label: "Memorise (M)", key: "M" },
        { id: "ability", tile: gui.TAB_ABILITY, label: "Abilities (a)", key: "a" },
        { id: "skill", tile: gui.TAB_SKILL, label: "Skills (m)", key: "m" },
        { id: "command", tile: gui.TAB_COMMAND, label: "Commands (?)", key: "?" },
        { id: "navigation", tile: gui.TAB_NAVIGATION, label: "Map / Travel (X)", key: "X" }
    ];

    var $tooltip = null;

    function getTooltip() {
        if (!$tooltip || $tooltip.length === 0) {
            if ($("#tiles-inv-tooltip").length === 0) {
                $("body").append('<div id="tiles-inv-tooltip" style="display:none;"></div>');
            }
            $tooltip = $("#tiles-inv-tooltip");
        }
        return $tooltip;
    }

    function showTooltip(x, y, text) {
        var tt = getTooltip();
        tt.text(text);
        
        var ttWidth = tt.outerWidth() || 240;
        var ttHeight = tt.outerHeight() || 80;
        var posX = x - ttWidth - 10;
        if (posX < 10) posX = x + 16;
        var posY = y - 20;
        if (posY + ttHeight > $(window).height()) {
            posY = $(window).height() - ttHeight - 10;
        }

        tt.css({ left: posX + "px", top: posY + "px" }).show();
    }

    function hideTooltip() {
        var tt = getTooltip();
        tt.hide();
    }

    function getItemAction(item) {
        if (!item || !item.name) return null;
        var letter = item.letter || player.index_to_letter(item.slot);
        var isWorn = item.name && item.name.indexOf("(worn)") !== -1;
        var isWielded = item.name && (item.name.indexOf("(weapon)") !== -1 || item.slot === player.weapon_index);
        var lower = item.name.toLowerCase();
        var isJewel = lower.indexOf("ring") !== -1 || lower.indexOf("amulet") !== -1;

        if (isWielded) {
            return { verb: "Unwield", hotkey: "w", subkey: "-", letter: letter, isUnwield: true };
        } else if (isWorn) {
            if (isJewel) {
                return { verb: "Remove", hotkey: "R", letter: letter };
            } else {
                return { verb: "Take off", hotkey: "T", letter: letter };
            }
        } else {
            if (item.action_verb) {
                var v = item.action_verb.toLowerCase();
                var hk = "w";
                if (v === "wear") hk = "W";
                else if (v === "wield") hk = "w";
                else if (v === "quaff") hk = "q";
                else if (v === "read") hk = "r";
                else if (v === "evoke") hk = "V";
                else if (v === "put on") hk = "P";
                return { verb: item.action_verb, hotkey: hk, letter: letter };
            } else if (lower.indexOf("potion") !== -1) {
                return { verb: "Quaff", hotkey: "q", letter: letter };
            } else if (lower.indexOf("scroll") !== -1) {
                return { verb: "Read", hotkey: "r", letter: letter };
            } else if (lower.indexOf("wand") !== -1) {
                return { verb: "Evoke", hotkey: "V", letter: letter };
            } else if (isJewel) {
                return { verb: "Put on", hotkey: "P", letter: letter };
            } else if (lower.indexOf("armour") !== -1 || lower.indexOf("shield") !== -1 || lower.indexOf("mail") !== -1 || lower.indexOf("robe") !== -1 || lower.indexOf("leather") !== -1 || lower.indexOf("helmet") !== -1 || lower.indexOf("cloak") !== -1 || lower.indexOf("boots") !== -1 || lower.indexOf("gloves") !== -1) {
                return { verb: "Wear", hotkey: "W", letter: letter };
            } else {
                return { verb: "Wield", hotkey: "w", letter: letter };
            }
        }
    }

    function formatItemTooltip(item) {
        if (!item || !item.name) return "";
        var action = getItemAction(item);
        if (!action) return "";
        var letter = action.letter;
        var lines = [
            letter + " - " + item.name,
            "[L-Click] " + action.verb + (action.hotkey ? " (" + action.hotkey + ")" : ""),
            "[R-Click] Describe",
            "[Shift + L-Click] Drop"
        ];
        return lines.join("\n");
    }

    function TilesPanel($container, isPopup) {
        this.$container = $($container);
        this.isPopup = !!isPopup;
        this.activeTab = "item";
        this.hoverSlot = -1;
        this.hoverCmd = -1;
        this.hoverTab = -1;
        this.renderer = new cr.DungeonCellRenderer();
        this.idPrefix = "tp_" + Math.floor(Math.random() * 100000) + "_";

        this.setupDOM();
        this.bindEvents();
        this.update();
    }

    TilesPanel.prototype.setupDOM = function () {
        this.$container.empty().addClass("dcss-tiles-panel");

        var html = '<div class="tiles-mon-header"><canvas class="tp_mon_canvas"></canvas></div>'
                 + '<div class="tiles-cmd-bar"><canvas class="tp_cmd_canvas"></canvas></div>'
                 + '<div class="tiles-body">'
                 + '  <div class="tiles-tabs-col"><canvas class="tp_tabs_canvas"></canvas></div>'
                 + '  <div class="tiles-grid-area"><canvas class="tp_grid_canvas" tabindex="0" aria-label="Inventory. Use arrow keys to inspect items."></canvas></div>'
                 + '</div>';
        this.$container.html(html);

        this.$monCanvas = this.$container.find(".tp_mon_canvas");
        this.$cmdCanvas = this.$container.find(".tp_cmd_canvas");
        this.$tabsCanvas = this.$container.find(".tp_tabs_canvas");
        this.$gridCanvas = this.$container.find(".tp_grid_canvas");
    };

    TilesPanel.prototype.bindEvents = function () {
        var self = this;

        function inspectSlot(direction) {
            for (var i = 0; i < 52; i++) {
                self.hoverSlot = (self.hoverSlot + direction + 52) % 52;
                var item = player.inv && player.inv[self.hoverSlot];
                if (!item || !item.name || !item.quantity) continue;
                var rect = self.$gridCanvas[0].getBoundingClientRect();
                var text = formatItemTooltip(item);
                self.$gridCanvas.attr("aria-label", text);
                showTooltip(rect.left + (self.hoverSlot % NUM_COLS + 1) * CELL_SIZE,
                    rect.top + Math.floor(self.hoverSlot / NUM_COLS) * CELL_SIZE, text);
                self.drawGrid();
                return;
            }
            self.hoverSlot = -1;
            hideTooltip();
            self.drawGrid();
        }
        this.$gridCanvas.on("focus", function () {
            if (this.matches(":focus-visible")) inspectSlot(1);
        }).on("keydown", function (ev) {
            var steps = {37: -1, 38: -1, 39: 1, 40: 1};
            if (steps[ev.which]) {
                ev.preventDefault();
                ev.stopPropagation();
                inspectSlot(steps[ev.which]);
            } else if (ev.which === 9) {
                ev.stopPropagation();
            }
        }).on("blur", function () {
            self.hoverSlot = -1;
            self.drawGrid();
            hideTooltip();
        });
        // Grid Canvas
        this.$gridCanvas.on("mousemove", function (e) {
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var col = Math.floor(x / CELL_SIZE);
            var row = Math.floor(y / CELL_SIZE);
            if (col >= 0 && col < NUM_COLS && row >= 0 && row < NUM_ROWS) {
                var slot = row * NUM_COLS + col;
                if (slot !== self.hoverSlot) {
                    self.hoverSlot = slot;
                    self.drawGrid();
                }
                if (slot < 52 && player.inv && player.inv[slot] && player.inv[slot].name) {
                    showTooltip(e.pageX, e.pageY, formatItemTooltip(player.inv[slot]));
                } else {
                    hideTooltip();
                }
            } else {
                if (self.hoverSlot !== -1) {
                    self.hoverSlot = -1;
                    self.drawGrid();
                }
                hideTooltip();
            }
        });

        this.$gridCanvas.on("mouseleave", function () {
            self.hoverSlot = -1;
            self.drawGrid();
            hideTooltip();
        });

        this.$gridCanvas.on("mousedown", function (e) {
            if (self.hoverSlot < 0 || self.hoverSlot >= 52) return;
            var item = player.inv ? player.inv[self.hoverSlot] : null;
            if (!item || !item.name) return;

            e.preventDefault();
            e.stopPropagation();

            var action = getItemAction(item);
            if (!action) return;
            var letterCode = action.letter.charCodeAt(0);
            var isModal = self.isPopup || $(".menu_inventory:visible").length > 0;

            if (e.shiftKey && e.which === 1) {
                // Drop item: send 'd' then item letter
                if (isModal) {
                    comm.send_message("key", { keycode: 27 }); // Close menu first
                }
                comm.send_message("key", { keycode: 100 }); // 'd'
                comm.send_message("key", { keycode: letterCode });
            } else if (e.which === 1) {
                // Left click: perform action (Wear/Take off/Quaff/Read/Evoke/Wield/Unwield)
                if (isModal) {
                    comm.send_message("key", { keycode: 27 }); // Close menu first
                }
                comm.send_message("key", { keycode: action.hotkey.charCodeAt(0) });
                if (action.isUnwield && action.subkey) {
                    comm.send_message("key", { keycode: action.subkey.charCodeAt(0) });
                } else {
                    comm.send_message("key", { keycode: letterCode });
                }
            } else if (e.which === 3) {
                // Right click: describe
                if (isModal) {
                    comm.send_message("key", { keycode: letterCode });
                } else {
                    comm.send_message("inv_item_describe", { slot: item.slot });
                }
            }
        });

        this.$gridCanvas.on("contextmenu", function (e) {
            e.preventDefault();
            return false;
        });

        // Command Bar
        this.$cmdCanvas.on("mousemove", function (e) {
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var idx = Math.floor(x / CELL_SIZE);
            if (idx >= 0 && idx < COMMANDS.length) {
                if (idx !== self.hoverCmd) {
                    self.hoverCmd = idx;
                    self.drawCommands();
                }
                showTooltip(e.pageX, e.pageY, COMMANDS[idx].label);
            } else {
                if (self.hoverCmd !== -1) {
                    self.hoverCmd = -1;
                    self.drawCommands();
                }
                hideTooltip();
            }
        });

        this.$cmdCanvas.on("mouseleave", function () {
            self.hoverCmd = -1;
            self.drawCommands();
            hideTooltip();
        });

        this.$cmdCanvas.on("click", function (e) {
            if (self.hoverCmd >= 0 && self.hoverCmd < COMMANDS.length) {
                var cmd = COMMANDS[self.hoverCmd];
                var isModal = self.isPopup || $(".menu_inventory:visible").length > 0;
                if (isModal) {
                    comm.send_message("key", { keycode: 27 }); // Close inventory modal
                }
                if (cmd.keycode) {
                    comm.send_message("key", { keycode: cmd.keycode });
                } else if (cmd.key) {
                    comm.send_message("key", { keycode: cmd.key.charCodeAt(0) });
                }
            }
        });

        // Left Tabs
        this.$tabsCanvas.on("mousemove", function (e) {
            var rect = this.getBoundingClientRect();
            var y = e.clientY - rect.top;
            var idx = Math.floor(y / CELL_SIZE);
            if (idx >= 0 && idx < TABS.length) {
                if (idx !== self.hoverTab) {
                    self.hoverTab = idx;
                    self.drawTabs();
                }
                showTooltip(e.pageX, e.pageY, TABS[idx].label);
            } else {
                if (self.hoverTab !== -1) {
                    self.hoverTab = -1;
                    self.drawTabs();
                }
                hideTooltip();
            }
        });

        this.$tabsCanvas.on("mouseleave", function () {
            self.hoverTab = -1;
            self.drawTabs();
            hideTooltip();
        });

        this.$tabsCanvas.on("click", function (e) {
            if (self.hoverTab >= 0 && self.hoverTab < TABS.length) {
                var tab = TABS[self.hoverTab];
                self.activeTab = tab.id;
                self.drawTabs();
                var isModal = self.isPopup || $(".menu_inventory:visible").length > 0;
                if (tab.id === "item") {
                    if (isModal) {
                        comm.send_message("key", { keycode: 27 }); // Toggle close
                    } else if (tab.key) {
                        comm.send_message("key", { keycode: tab.key.charCodeAt(0) });
                    }
                } else {
                    if (isModal) {
                        comm.send_message("key", { keycode: 27 }); // Close inventory modal first
                    }
                    if (tab.key) {
                        comm.send_message("key", { keycode: tab.key.charCodeAt(0) });
                    }
                }
            }
        });

        // Monster header skull button
        this.$monCanvas.on("mousemove", function (e) {
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            if (x < CELL_SIZE) {
                showTooltip(e.pageX, e.pageY, "Monsters (Tab)");
            } else {
                hideTooltip();
            }
        });

        this.$monCanvas.on("mouseleave", hideTooltip);
        this.$monCanvas.on("click", function (e) {
            var rect = this.getBoundingClientRect();
            var x = e.clientX - rect.left;
            if (x < CELL_SIZE) {
                var isModal = self.isPopup || $(".menu_inventory:visible").length > 0;
                if (isModal) {
                    comm.send_message("key", { keycode: 27 }); // Close inventory modal
                }
                comm.send_message("key", { keycode: 9 }); // Tab
            }
        });

        // Update listener
        this.$container.on("update", function () {
            self.update();
        });
        $(document).on("dcss_inv_update", function () {
            self.update();
        });

        if (this.isPopup) {
            $(document).off("keydown.tiles_popup").on("keydown.tiles_popup", function (e) {
                if (e.which === 27 || (!e.ctrlKey && !e.altKey && (e.which === 73 || e.which === 32))) { // Escape, 'i', Space
                    e.preventDefault();
                    e.stopPropagation();
                    $(document).off("keydown.tiles_popup");
                    hideTooltip();
                    comm.send_message("key", { keycode: 27 });
                    if ($(".inv-close-btn:visible").length > 0) {
                        $(".inv-close-btn").click();
                    }
                }
            });
        }
    };

    TilesPanel.prototype.drawMonsterHeader = function () {
        if (!this.$monCanvas || this.$monCanvas.length === 0) return;
        var ratio = window.devicePixelRatio || 1;
        var w = COMMANDS.length * CELL_SIZE;
        var h = 28;

        util.init_canvas(this.$monCanvas[0], w, h);
        this.renderer.init(this.$monCanvas[0]);
        var ctx = this.renderer.ctx;

        ctx.fillStyle = "#0c0d10";
        ctx.fillRect(0, 0, w * ratio, h * ratio);

        // Red skull button on left
        ctx.fillStyle = "#8c1616";
        ctx.fillRect(0, 0, CELL_SIZE * ratio, h * ratio);

        // Yellow highlight stripe on right side of skull button
        ctx.fillStyle = "#eab308";
        ctx.fillRect((CELL_SIZE - 2) * ratio, 0, 2 * ratio, h * ratio);

        // Skull icon
        this.renderer.draw_gui(gui.TAB_MONSTER, 0, -2 * ratio);
    };

    TilesPanel.prototype.drawCommands = function () {
        if (!this.$cmdCanvas || this.$cmdCanvas.length === 0) return;
        var ratio = window.devicePixelRatio || 1;
        var w = COMMANDS.length * CELL_SIZE; // 416px
        var h = CELL_SIZE;

        util.init_canvas(this.$cmdCanvas[0], w, h);
        this.renderer.init(this.$cmdCanvas[0]);
        var ctx = this.renderer.ctx;

        ctx.fillStyle = "#08090b";
        ctx.fillRect(0, 0, w * ratio, h * ratio);

        for (var i = 0; i < COMMANDS.length; i++) {
            var x = i * CELL_SIZE * ratio;
            var isHover = (this.hoverCmd === i);

            if (isHover) {
                ctx.fillStyle = "rgba(197, 160, 89, 0.25)";
                ctx.fillRect(x, 0, CELL_SIZE * ratio, CELL_SIZE * ratio);
            }

            ctx.strokeStyle = isHover ? "#c5a059" : "rgba(60, 60, 70, 0.35)";
            ctx.strokeRect(x + 0.5, 0.5, (CELL_SIZE - 1) * ratio, (CELL_SIZE - 1) * ratio);

            if (COMMANDS[i].tile !== null && COMMANDS[i].tile !== undefined) {
                this.renderer.draw_gui(COMMANDS[i].tile, x, 0);
            } else if (COMMANDS[i].iconText) {
                ctx.save();
                ctx.font = Math.round(18 * ratio) + "px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#f0dba0";
                ctx.fillText(COMMANDS[i].iconText, x + (CELL_SIZE * ratio / 2), (CELL_SIZE * ratio / 2));
                ctx.restore();
            }
        }
    };

    TilesPanel.prototype.drawTabs = function () {
        if (!this.$tabsCanvas || this.$tabsCanvas.length === 0) return;
        var ratio = window.devicePixelRatio || 1;
        var w = CELL_SIZE;
        var h = TABS.length * CELL_SIZE; // 224px

        util.init_canvas(this.$tabsCanvas[0], w, h);
        this.renderer.init(this.$tabsCanvas[0]);
        var ctx = this.renderer.ctx;

        ctx.fillStyle = "#08090b";
        ctx.fillRect(0, 0, w * ratio, h * ratio);

        for (var i = 0; i < TABS.length; i++) {
            var y = i * CELL_SIZE * ratio;
            var tab = TABS[i];
            var isSelected = (this.activeTab === tab.id);
            var isHover = (this.hoverTab === i);

            if (isSelected) {
                ctx.fillStyle = "rgba(100, 60, 20, 0.65)";
                ctx.fillRect(0, y, CELL_SIZE * ratio, CELL_SIZE * ratio);
                ctx.strokeStyle = "#c5a059";
                ctx.lineWidth = 1.5 * ratio;
                ctx.strokeRect(0.5, y + 0.5, (CELL_SIZE - 1) * ratio, (CELL_SIZE - 1) * ratio);
                ctx.lineWidth = 1;
            } else if (isHover) {
                ctx.fillStyle = "rgba(40, 42, 50, 0.8)";
                ctx.fillRect(0, y, CELL_SIZE * ratio, CELL_SIZE * ratio);
                ctx.strokeStyle = "rgba(197, 160, 89, 0.5)";
                ctx.strokeRect(0.5, y + 0.5, (CELL_SIZE - 1) * ratio, (CELL_SIZE - 1) * ratio);
            } else {
                ctx.strokeStyle = "rgba(40, 40, 50, 0.5)";
                ctx.strokeRect(0.5, y + 0.5, (CELL_SIZE - 1) * ratio, (CELL_SIZE - 1) * ratio);
            }

            this.renderer.draw_gui(tab.tile, 0, y);
        }
    };

    TilesPanel.prototype.drawGrid = function () {
        if (!this.$gridCanvas || this.$gridCanvas.length === 0) return;
        var ratio = window.devicePixelRatio || 1;
        var w = NUM_COLS * CELL_SIZE; // 384px
        var h = TABS.length * CELL_SIZE; // 224px (matching tabs column height)

        util.init_canvas(this.$gridCanvas[0], w, h);
        this.renderer.init(this.$gridCanvas[0]);
        var ctx = this.renderer.ctx;

        ctx.fillStyle = "#050608";
        ctx.fillRect(0, 0, w * ratio, h * ratio);

        var totalCells = NUM_COLS * NUM_ROWS;

        for (var idx = 0; idx < totalCells; idx++) {
            var col = idx % NUM_COLS;
            var row = Math.floor(idx / NUM_COLS);
            var x = col * CELL_SIZE * ratio;
            var y = row * CELL_SIZE * ratio;
            var cell_w = CELL_SIZE * ratio;
            var cell_h = CELL_SIZE * ratio;

            var item = (idx < 52 && player.inv) ? player.inv[idx] : null;
            var hasItem = item && item.name && item.quantity > 0;
            var isHover = (this.hoverSlot === idx);

            var isWorn = hasItem && item.name.indexOf("(worn)") !== -1;
            var isWielded = hasItem && (item.name.indexOf("(weapon)") !== -1 || item.slot === player.weapon_index);
            var isEquipped = isWorn || isWielded;

            // 1. Slot background
            if (isEquipped) {
                // Exact dark green equipped highlight from screenshot
                ctx.fillStyle = "#004d00";
                ctx.fillRect(x, y, cell_w, cell_h);
            } else {
                ctx.fillStyle = hasItem ? "rgba(12, 13, 16, 0.95)" : "rgba(6, 7, 9, 0.8)";
                ctx.fillRect(x, y, cell_w, cell_h);
            }

            // 2. Slot border
            if (isHover) {
                ctx.strokeStyle = "#ffff00";
                ctx.lineWidth = 1.5 * ratio;
                ctx.strokeRect(x + 0.5, y + 0.5, cell_w - 1, cell_h - 1);
                ctx.lineWidth = 1;
            } else {
                ctx.strokeStyle = isEquipped ? "#008800" : "rgba(50, 52, 60, 0.4)";
                ctx.strokeRect(x + 0.5, y + 0.5, cell_w - 1, cell_h - 1);
            }

            // 3. Draw item sprite
            if (hasItem && item.tile) {
                var tiles = Array.isArray(item.tile) ? item.tile : [item.tile];
                for (var t = 0; t < tiles.length; t++) {
                    this.renderer.draw_main(tiles[t], x, y);
                }

                // 4. Quantity in top-left corner
                if (item.quantity > 1) {
                    ctx.font = "bold " + Math.round(11 * ratio) + "px sans-serif";
                    ctx.fillStyle = "#ffffff";
                    ctx.shadowColor = "#000000";
                    ctx.shadowBlur = 3 * ratio;
                    ctx.fillText(item.quantity, x + 2 * ratio, y + 10 * ratio);
                    ctx.shadowBlur = 0;
                }
            }
        }

        // Row 7 baseline border (matching Image 1 authentic DCSS native texture baseline)
        ctx.strokeStyle = "rgba(40, 42, 50, 0.4)";
        ctx.beginPath();
        ctx.moveTo(0, NUM_ROWS * CELL_SIZE * ratio + 0.5);
        ctx.lineTo(w * ratio, NUM_ROWS * CELL_SIZE * ratio + 0.5);
        ctx.stroke();
    };

    TilesPanel.prototype.update = function () {
        this.drawMonsterHeader();
        this.drawCommands();
        this.drawTabs();
        this.drawGrid();
    };

    var defaultInstance = null;

    function init(containerSelector) {
        var $target = $(containerSelector || "#tiles_tab_panel");
        if ($target.length === 0) return null;
        defaultInstance = new TilesPanel($target, false);
        return defaultInstance;
    }

    function create_panel(container, isPopup) {
        return new TilesPanel(container, isPopup);
    }

    function update() {
        if (defaultInstance)
            defaultInstance.update();
    }

    // Auto-initialize when game initializes
    $(document).on("game_init", function () {
        setTimeout(function () {
            init("#tiles_tab_panel");
        }, 300);
    });

    return {
        init: init,
        create_panel: create_panel,
        update: update,
        formatItemTooltip: formatItemTooltip
    };
});
