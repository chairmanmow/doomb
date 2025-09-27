load("json-client.js");

var mpLogPath = (typeof system !== "undefined" && system && system.data_dir) ? system.data_dir + "dumbfps-mp.log" : null;

function mpLog(message) {
    var line = new Date().toISOString() + " [DUMBFPS MP] " + message;
    try {
        if (typeof log === "function") {
            log(line);
        }
    } catch (ignore) {}
    if (mpLogPath) {
        try {
            var f = new File(mpLogPath);
            if (f.open("a")) {
                f.writeln(line);
                f.close();
            }
        } catch (ignore3) {}
    }
}

function parseArgs(argv) {
    var opts = {
        enabled: false,
        host: null,
        port: null,
        db: null,
        authUser: null,
        authPass: null,
        channel: null
    };
    for (var i = 0; argv && i < argv.length; i++) {
        var arg = argv[i];
        if (!arg) {
            continue;
        }
        if (arg === "--mp" || arg === "--multiplayer") {
            opts.enabled = true;
            continue;
        }
        if (arg.indexOf("--mp-host=") === 0) {
            opts.host = arg.substr(10);
            continue;
        }
        if (arg.indexOf("--mp-port=") === 0) {
            opts.port = parseInt(arg.substr(10), 10);
            continue;
        }
        if (arg.indexOf("--mp-service=") === 0) {
            var hp = arg.substr(13).split(':');
            if (hp[0]) {
                opts.host = hp[0];
            }
            if (hp[1]) {
                opts.port = parseInt(hp[1], 10);
            }
            continue;
        }
        if (arg.indexOf("--mp-db=") === 0) {
            opts.db = arg.substr(8);
            continue;
        }
        if (arg.indexOf("--mp-auth=") === 0) {
            var cred = arg.substr(10).split(':');
            opts.authUser = cred[0];
            opts.authPass = cred.length > 1 ? cred[1] : "";
            continue;
        }
        if (arg.indexOf("--mp-channel=") === 0) {
            opts.channel = arg.substr(13);
            continue;
        }
    }
    return opts;
}

function defaultServiceConfig() {
    var cfg = { host: "localhost", port: 10088 };
    try {
        var servicesIni = new File(system.ctrl_dir + "services.ini");
        if (servicesIni.open("r")) {
            var jsonSection = servicesIni.iniGetObject("JSON");
            servicesIni.close();
            if (jsonSection) {
                if (jsonSection.host) {
                    cfg.host = jsonSection.host;
                }
                if (jsonSection.Port) {
                    cfg.port = parseInt(jsonSection.Port, 10);
                } else if (jsonSection.port) {
                    cfg.port = parseInt(jsonSection.port, 10);
                }
            }
        }
    } catch (e) {
        mpLog("Failed reading services.ini: " + e);
    }
    return cfg;
}

function createKey(systemRef) {
    var parts = [];
    if (systemRef) {
        if (systemRef.qwk_id) {
            parts.push(systemRef.qwk_id);
        } else if (systemRef.host_name) {
            parts.push(systemRef.host_name);
        } else if (systemRef.name) {
            parts.push(systemRef.name);
        }
        if (typeof systemRef.node_number !== "undefined") {
            parts.push("node" + systemRef.node_number);
        }
    }
    if (user && user.alias) {
        parts.push(user.alias.replace(/\s+/g, '_'));
    }
    if (!parts.length) {
        parts.push("node" + (systemRef ? systemRef.node_number : "0"));
    }
    return parts.join('-');
}

function MultiplayerClient(options) {
    options = options || {};
    this.entryMap = {};
    this.remoteEntries = [];
    this.otherCount = 0;
    this.syncTimer = 0;
    this.syncInterval = options.syncInterval || 0.6;
    this.expireMs = options.expireMs || 8000;
    this.pollTimer = 0;
    this.pollInterval = options.pollInterval || 2.0;
    this.publishEnabled = false;
    this.publishLogged = false;
    this.connected = false;
    this.shouldConnect = false;
    this.client = null;
    this.enabled = false;

    this.options = options;
    this.system = options.system || (typeof system !== "undefined" ? system : null);
    this.alias = options.alias || (user && user.alias ? user.alias : "mystery meat");

    var argCfg = parseArgs(options.argv || []);
    var serviceCfg = defaultServiceConfig();
    this.host = options.host || argCfg.host || serviceCfg.host;
    this.port = options.port || argCfg.port || serviceCfg.port;
    this.dbName = options.db || argCfg.db || "dumbfps";
    this.channel = options.channel || argCfg.channel || "players";
    this.user = options.authUser || argCfg.authUser || null;
    this.pass = options.authPass || argCfg.authPass || null;
    this.key = options.identity || createKey(this.system);

    var enableRequested = options.enabled || argCfg.enabled;
    if (enableRequested) {
        this.setEnabled(true);
    }
}

MultiplayerClient.prototype.setEnabled = function (flag) {
    flag = !!flag;
    this.shouldConnect = flag;
    this.publishLogged = false;
    mpLog("Multiplayer " + (flag ? "enabled" : "disabled"));
    if (!flag) {
        this.disconnect(true);
    } else {
        this.connect();
    }
};

MultiplayerClient.prototype.setPublish = function (flag) {
    this.publishEnabled = !!flag;
    this.publishLogged = false;
    if (!this.publishEnabled && this.client && this.connected) {
        try {
            this.client.write(this.dbName, this.channel + '.' + this.key, null, 2);
            mpLog("Stopped publishing presence for " + this.key);
        } catch (e) {
            mpLog("Error clearing presence while disabling publish: " + e);
        }
    }
    mpLog("Publish " + (this.publishEnabled ? "enabled" : "disabled"));
};

MultiplayerClient.prototype.reconfigure = function (opts) {
    if (!opts) {
        return;
    }
    if (typeof opts.host !== "undefined") {
        this.host = opts.host;
    }
    if (typeof opts.port !== "undefined") {
        this.port = parseInt(opts.port, 10);
    }
    if (typeof opts.db !== "undefined") {
        this.dbName = opts.db;
    }
    if (typeof opts.channel !== "undefined") {
        this.channel = opts.channel;
    }
    if (typeof opts.authUser !== "undefined") {
        this.user = opts.authUser;
    }
    if (typeof opts.authPass !== "undefined") {
        this.pass = opts.authPass;
    }
    if (typeof opts.identity !== "undefined") {
        this.key = opts.identity;
    }
    if (typeof opts.alias !== "undefined") {
        this.alias = opts.alias;
    }
    if (typeof opts.expireMs !== "undefined") {
        this.expireMs = opts.expireMs;
    }
    if (typeof opts.syncInterval !== "undefined") {
        this.syncInterval = opts.syncInterval;
    }
    if (typeof opts.enabled !== "undefined") {
        this.setEnabled(opts.enabled);
    } else if (this.connected) {
        this.disconnect(true);
        if (this.shouldConnect) {
            this.connect();
        }
    }
    this.publishLogged = false;
    mpLog("Reconfigured multiplayer client (host=" + this.host + ", port=" + this.port + ", db=" + this.dbName + ", channel=" + this.channel + ")");
};

MultiplayerClient.prototype.connect = function () {
    if (this.connected) {
        return;
    }
    mpLog(format("Connecting to %s:%d (db=%s, channel=%s)", this.host, this.port, this.dbName, this.channel));
    try {
        this.client = new JSONClient(this.host, this.port, this.user, this.pass);
        var self = this;
        this.client.callback = function (action, db, key, value) {
            self.onUpdate(action, db, key, value);
        };
        this.client.subscribe(this.dbName, this.channel);
        this.connected = true;
        this.enabled = true;
        mpLog("Connection established and subscribed to channel");
        this.loadInitial();
    } catch (err) {
        mpLog("Multiplayer connect failed: " + err);
        this.client = null;
        this.connected = false;
        this.enabled = false;
    }
};

MultiplayerClient.prototype.disconnect = function (clearPresence) {
    if (clearPresence && this.client && this.connected) {
        try {
            this.client.write(this.dbName, this.channel + '.' + this.key, null, 2);
            mpLog("Cleared presence for " + this.key);
        } catch (e) {
            mpLog("Error clearing presence: " + e);
        }
    }
    if (this.client) {
        try {
            this.client.disconnect();
            mpLog("Disconnected multiplayer client");
        } catch (e) {
            mpLog("Error during disconnect: " + e);
        }
    }
    this.client = null;
    this.connected = false;
    this.enabled = false;
    this.entryMap = {};
    this.remoteEntries = [];
    this.otherCount = 0;
    this.publishLogged = false;
};

MultiplayerClient.prototype.shutdown = function () {
    this.disconnect(true);
};

MultiplayerClient.prototype.loadInitial = function () {
    this.entryMap = {};
    if (!this.client) {
        return;
    }
    try {
        var all = this.client.read(this.dbName, this.channel, 1) || {};
        for (var key in all) {
            if (all.hasOwnProperty(key)) {
                var record = all[key];
                if (record && typeof record === "object") {
                    record._key = key;
                }
                this.entryMap[key] = record;
            }
        }
        mpLog("Loaded " + Object.keys(this.entryMap).length + " remote entries");
    } catch (e) {
        mpLog("Error loading initial multiplayer state: " + e);
    }
    this.refreshEntries();
};

MultiplayerClient.prototype.onUpdate = function (action, db, key, value) {
    if (db !== this.dbName) {
        return;
    }
    if (!key || key.indexOf(this.channel) !== 0) {
        return;
    }
    var entryKey = key.length > this.channel.length + 1 ? key.substr(this.channel.length + 1) : null;
    if (!entryKey) {
        return;
    }
    if (action === "write" || action === "update" || action === "push_result") {
        if (value && typeof value === "object") {
            value._key = entryKey;
        }
        this.entryMap[entryKey] = value;
    } else if (action === "delete" || action === "remove") {
        delete this.entryMap[entryKey];
    }
    this.refreshEntries();
};

MultiplayerClient.prototype.refreshEntries = function () {
    var now = Date.now();
    var fresh = [];
    var count = 0;
    for (var key in this.entryMap) {
        if (!this.entryMap.hasOwnProperty(key)) {
            continue;
        }
        if (key === this.key) {
            continue;
        }
        var record = this.entryMap[key];
        if (record && typeof record === "object") {
            record._key = key;
        }
        if (!record || !record.ts || now - record.ts > this.expireMs) {
            delete this.entryMap[key];
            continue;
        }
        fresh.push(record);
        count++;
    }
    this.otherCount = count;
    this.remoteEntries = fresh;
};

MultiplayerClient.prototype.update = function (delta, state) {
    if (!this.shouldConnect) {
        if (this.connected) {
            this.disconnect(true);
        }
        return;
    }
    if (!this.connected) {
        this.connect();
        if (!this.connected) {
            return;
        }
    }
    try {
        this.client.cycle();
    } catch (e) {
        mpLog("Error during JSONClient cycle: " + e);
    }
    this.syncTimer += delta;
    this.pollTimer += delta;
    if (this.syncTimer >= this.syncInterval) {
        this.syncTimer = 0;
        if (this.publishEnabled && state) {
            var now = Date.now();
            var record = {
                ts: now,
                alias: this.alias,
                score: state.score || 0,
                vibe: state.vibe || 0,
                x: state.x || 0,
                y: state.y || 0,
                session: state.session || 0,
                system: this.system ? (this.system.qwk_id || this.system.host_name || this.system.name) : "unknown"
            };
            if (typeof state.npcCount === "number") {
                record.npcCount = state.npcCount;
            }
            try {
                this.client.write(this.dbName, this.channel + '.' + this.key, record, 2);
                this.entryMap[this.key] = record;
                if (!this.publishLogged) {
                    mpLog("Published presence for " + this.key + " (score=" + record.score + ")");
                    this.publishLogged = true;
                }
            } catch (e) {
                mpLog("Error writing presence: " + e);
            }
        }
    }
    if (this.pollTimer >= this.pollInterval) {
        this.pollTimer = 0;
        this.refreshFromServer();
    }
    this.refreshEntries();
};

MultiplayerClient.prototype.peek = function (delta) {
    this.update(delta || 0, null);
};

MultiplayerClient.prototype.refreshFromServer = function () {
    if (!this.client) {
        return;
    }
    try {
        var all = this.client.read(this.dbName, this.channel, 1) || {};
        for (var key in all) {
            if (!all.hasOwnProperty(key)) {
                continue;
            }
            var record = all[key];
            if (record && typeof record === "object") {
                record._key = key;
            }
            this.entryMap[key] = record;
        }
    } catch (e) {
        mpLog("refreshFromServer failed: " + e);
    }
};

function createMultiplayerClient(options) {
    return new MultiplayerClient(options);
}

exports = {
    createMultiplayerClient: createMultiplayerClient,
    defaultServiceConfig: defaultServiceConfig
};
