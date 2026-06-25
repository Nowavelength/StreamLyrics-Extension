(function () {
    "use strict";

    var MAX_PIP_WIDTH = 900;
    var MAX_PIP_HEIGHT = 900;

    function isStreamLyricsPip(client) {
        if (!client || !client.caption) return false;
        if (client.caption.indexOf("StreamLyrics") === -1) return false;
        if (client.width > MAX_PIP_WIDTH || client.height > MAX_PIP_HEIGHT) return false;
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

    function watchClient(client) {
        if (!client) return;
        evaluate(client);
        client.captionChanged.connect(function () { evaluate(client); });
        client.frameGeometryChanged.connect(function () { evaluate(client); });
    }

    // Process existing windows
    var windows = workspace.windowList();
    for (var i = 0; i < windows.length; i++) {
        watchClient(windows[i]);
    }

    // Watch for new windows
    workspace.windowAdded.connect(watchClient);
})();
