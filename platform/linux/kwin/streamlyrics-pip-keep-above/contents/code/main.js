(function () {
    "use strict";

    var MAX_PIP_WIDTH = 900;
    var MAX_PIP_HEIGHT = 900;
    var REAPPLY_INTERVAL_MS = 1000;
    var watchedClients = [];

    var compat =
        typeof workspace.windowList !== "undefined"
            ? {
                  windowList: function () { return workspace.windowList(); },
                  windowAdded: workspace.windowAdded,
                  windowRemoved: workspace.windowRemoved,
                  frameGeometry: function (client) { return client.frameGeometry; },
              }
            : typeof workspace.clientList !== "undefined"
              ? {
                    windowList: function () { return workspace.clientList(); },
                    windowAdded: workspace.clientAdded,
                    windowRemoved: workspace.clientRemoved,
                    frameGeometry: function (client) { return client.geometry; },
                }
              : null;

    if (compat === null) {
        print("StreamLyrics PiP Keep Above: incompatible KWin scripting API.");
        return;
    }

    function toFiniteNumber(value) {
        return typeof value === "number" && isFinite(value) ? value : null;
    }

    function getGeometry(client) {
        var width = toFiniteNumber(client.width);
        var height = toFiniteNumber(client.height);
        var geometry = compat.frameGeometry(client);

        if ((width === null || height === null) && geometry) {
            width = toFiniteNumber(geometry.width);
            height = toFiniteNumber(geometry.height);
        }

        if (width === null || height === null) return null;
        return { width: width, height: height };
    }

    function connectSignal(target, signalName, handler) {
        if (!target) return;
        var signal = target[signalName];
        if (signal && typeof signal.connect === "function") {
            signal.connect(handler);
        }
    }

    function isStreamLyricsPip(client) {
        if (!client || !client.caption) return false;
        if (client.caption.indexOf("StreamLyrics") === -1) return false;
        var geometry = getGeometry(client);
        if (!geometry) return false;
        if (geometry.width > MAX_PIP_WIDTH || geometry.height > MAX_PIP_HEIGHT) return false;
        return true;
    }

    function evaluate(client) {
        if (!client) return;
        if (isStreamLyricsPip(client)) {
            if (!client.keepAbove) {
                client.keepAbove = true;
            }
        }
    }

    function evaluateAll() {
        var windows = compat.windowList();
        for (var i = 0; i < windows.length; i++) {
            evaluate(windows[i]);
        }
    }

    function watchClient(client) {
        if (!client) return;
        watchedClients.push(client);
        evaluate(client);
        connectSignal(client, "captionChanged", function () { evaluate(client); });
        connectSignal(client, "frameGeometryChanged", function () { evaluate(client); });
        connectSignal(client, "geometryChanged", function () { evaluate(client); });
        connectSignal(client, "keepAboveChanged", function () { evaluate(client); });
    }

    function unwatchClient(client) {
        var nextClients = [];
        for (var i = 0; i < watchedClients.length; i++) {
            if (watchedClients[i] !== client) nextClients.push(watchedClients[i]);
        }
        watchedClients = nextClients;
    }

    function reapplyWatchedClients() {
        for (var i = 0; i < watchedClients.length; i++) {
            evaluate(watchedClients[i]);
        }
    }

    // Process existing windows
    var windows = compat.windowList();
    for (var i = 0; i < windows.length; i++) {
        watchClient(windows[i]);
    }

    // Watch for new windows
    connectSignal(compat, "windowAdded", watchClient);
    connectSignal(compat, "windowRemoved", unwatchClient);

    // KWin or Chrome may later alter stacking state. Reapply on common
    // compositor state changes and, where timers exist, on a slow interval.
    connectSignal(workspace, "windowActivated", reapplyWatchedClients);
    connectSignal(workspace, "currentDesktopChanged", reapplyWatchedClients);
    connectSignal(workspace, "currentActivityChanged", reapplyWatchedClients);
    connectSignal(workspace, "desktopsChanged", reapplyWatchedClients);
    connectSignal(workspace, "screensChanged", reapplyWatchedClients);

    if (typeof setInterval === "function") {
        setInterval(reapplyWatchedClients, REAPPLY_INTERVAL_MS);
    }

    evaluateAll();
})();
