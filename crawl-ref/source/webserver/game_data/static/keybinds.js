define(["jquery"], function ($) {
    "use strict";

    var named = { 8: "Backspace", 9: "Tab", 13: "Enter", 27: "Escape", 32: " " };

    function keyValue(code) {
        return named[code] || (Number.isInteger(code) && code >= 33 && code <= 0xffff ? String.fromCharCode(code) : "");
    }

    function label(key) {
        if (typeof key === "number")
            key = keyValue(key);
        return { Escape: "Esc", " ": "Space", Bksp: "Backspace" }[key] || key;
    }

    function badge(key) {
        return $("<kbd class='keybind-badge'>").text(label(key) || "");
    }

    function html(key) {
        return badge(key)[0].outerHTML;
    }

    function commandLabel(action) {
        return action.ctrlKey ? "Ctrl+" + action.key.toUpperCase() : label(action.key);
    }

    function commandCode(action) {
        if (action.disabled)
            return 0;
        if (Number.isInteger(action.keycode))
            return action.keycode;
        if (action.ctrlKey && /^[a-z]$/i.test(action.key))
            return action.key.toUpperCase().charCodeAt(0) - 64;
        if (action.key && action.key.length === 1)
            return action.key.charCodeAt(0);
        return Number(Object.keys(named).find(function (code) {
            return named[code] === action.key;
        })) || 0;
    }

    function matches(event, action) {
        return !action.disabled && !event.altKey && !event.metaKey
            && !!event.ctrlKey === !!action.ctrlKey
            && (action.ctrlKey
                ? !event.shiftKey && typeof event.key === "string"
                    && event.key.toLowerCase() === action.key.toLowerCase()
                : event.key === action.key);
    }

    function creationControls(message) {
        var controls = ((message["sub-items"] || {}).buttons || []).filter(function (button) {
            return !button.disabled;
        });
        var weapon = message.creation.step === "weapon";
        if (!weapon && !controls.some(function (button) { return button.hotkey === 8; }))
            controls.push({ hotkey: 8, label: "Back" });
        controls.push({ hotkey: 27, label: weapon ? "Back" : "Cancel" });
        return controls;
    }

    function inspectionActions(desc) {
        var actions = desc.action_keys || (desc.inspection || {}).actions;
        if (!actions) {
            actions = (desc.actions || "").split(", ").flatMap(function (part) {
                var clean = part.replace(/^or\s+/i, "").replace(/\.$/, "").trim();
                var match = clean.match(/\((.)\)/);
                if (!match)
                    return [];
                var text = clean.replace(match[0], match[1]);
                return [{ key: match[1].charCodeAt(0), label: text[0].toUpperCase() + text.slice(1) }];
            });
        }
        return actions.filter(function (action) {
            return !action.disabled && keyValue(action.key);
        });
    }

    return {
        keyValue: keyValue,
        badge: badge,
        html: html,
        commandLabel: commandLabel,
        commandCode: commandCode,
        matches: matches,
        creationControls: creationControls,
        inspectionActions: inspectionActions
    };
});
