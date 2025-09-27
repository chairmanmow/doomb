load("sbbsdefs.js");

var mpModule = null;
try {
    mpModule = load(js.exec_dir + "multiplayer_client.js");
} catch (mpErr) {
    if (typeof log === "function") {
        log("[DUMBFPS] Failed to load multiplayer_client.js: " + mpErr);
    }
    mpModule = null;
}

var defaultServiceConfig = (mpModule && typeof mpModule.defaultServiceConfig === "function") ? mpModule.defaultServiceConfig : function () {
    return { host: "localhost", port: 10088 };
};

function loadServerConfig() {
    var cfg = defaultServiceConfig();
    try {
        var serverIni = new File(js.exec_dir + "server.ini");
        if (serverIni.open("r")) {
            var host = serverIni.iniGetValue(null, "host");
            var port = serverIni.iniGetValue(null, "port");
            if (host) {
                cfg.host = host;
            }
            if (port) {
                var parsed = parseInt(port, 10);
                if (!isNaN(parsed)) {
                    cfg.port = parsed;
                }
            }
            serverIni.close();
        }
    } catch (err) {
        if (typeof log === "function") {
            log("[DUMBFPS] Failed to read server.ini: " + err);
        }
    }
    return cfg;
}
var mapData = [
    "################",
    "#..............#",
    "#..####........#",
    "#......###.....#",
    "#......#.#.....#",
    "#......#.#.....#",
    "#..##..#.#.....#",
    "#..##..#.#.....#",
    "#......#.#.....#",
    "#......#.#.....#",
    "#......###.....#",
    "#..............#",
    "#..##########..#",
    "#..............#",
    "#..............#",
    "################"
];

var MAP_WIDTH = mapData[0].length;
var MAP_HEIGHT = mapData.length;
var FOV = Math.PI / 3;
var MAX_VIEW_DIST = 24;
var MOVE_SPEED = 4.5;
var STRAFE_SPEED = 3.2;
var ROT_SPEED = 2.6;
var SHOT_RANGE = 18;
var SHOT_STEP = 0.12;
var AIM_TOLERANCE = FOV / 14;
var totalRows = 0;
var HUD_ROWS = 0;
var VIEW_HEIGHT = 0;
var VIEW_WIDTH = 0;
var useWideScreen = false;

var ANSI_RESET = "\x1b[0m";
var wallPalette = [
    { char: ' ', color: "\x1b[0m" },
    { char: '.', color: "\x1b[38;5;236;48;5;232m" },
    { char: ':', color: "\x1b[38;5;244;48;5;233m" },
    { char: '-', color: "\x1b[38;5;247;48;5;234m" },
    { char: '=', color: "\x1b[38;5;250;48;5;235m" },
    { char: '+', color: "\x1b[38;5;253;48;5;236m" },
    { char: '*', color: "\x1b[38;5;255;48;5;237m" },
    { char: '#', color: "\x1b[38;5;255;48;5;238m" },
    { char: '@', color: "\x1b[38;5;255;48;5;239m" }
];
var floorPalette = [
    { char: ' ', color: "\x1b[38;5;233;48;5;232m" },
    { char: '.', color: "\x1b[38;5;235;48;5;233m" },
    { char: ':', color: "\x1b[38;5;236;48;5;234m" },
    { char: '-', color: "\x1b[38;5;237;48;5;235m" },
    { char: '=', color: "\x1b[38;5;240;48;5;236m" },
    { char: '+', color: "\x1b[38;5;244;48;5;237m" },
    { char: '#', color: "\x1b[38;5;248;48;5;238m" }
];
var skyPalette = [
    { char: ' ', color: "\x1b[38;5;111;48;5;17m" },
    { char: '.', color: "\x1b[38;5;147;48;5;18m" },
    { char: '-', color: "\x1b[38;5;153;48;5;19m" },
    { char: '`', color: "\x1b[38;5;189;48;5;20m" },
    { char: ' ', color: "\x1b[38;5;231;48;5;24m" }
];
var defaultLogMessage = "ESC bail | WASD move | Num4/6 turn | Num8/2 tilt | Num5 pew";
var statusPhrases = [
    "budget doom deluxe",
    "cranberry scented RTX off",
    "rent due in 9999 turns",
    "fps: feeling pretty sus",
    "npc tax audit pending",
    "lag powered by dial-up",
    "doomclone.exe but make it memes"
];
var crosshairColor = "\x1b[91;1m";
var muzzleColor = "\x1b[93;1m";
var viewTilt = 0;
var MAX_TILT = 1;

function newPlayer() {
    return {
        x: 3.5,
        y: 3.5,
        angle: Math.PI / 2,
        vibe: 87,
        score: 0,
        shots: 0,
        hits: 0
    };
}

var player = newPlayer();
var localSessionId = 0;
var pendingJoinTarget = null;
var joinSpawnedOnTarget = false;
var pendingJoinLastLog = 0;

var npcTemplates = [
    {
        name: "Rent Goblin",
        char: "@",
        color: "\x1b[93;1m",
        maxHp: 6,
        speed: 0.9,
        quips: [
            "pay rent in vibes",
            "this economy is a horror map",
            "our budget doom slaps"
        ]
    },
    {
        name: "Gamer Mold",
        char: "&",
        color: "\x1b[92;1m",
        maxHp: 5,
        speed: 1.1,
        quips: [
            "touch grass.exe failed",
            "i run on gamer Gatorade",
            "wallpaper by mildew"
        ]
    },
    {
        name: "Crypto Skunk",
        char: "$",
        color: "\x1b[96;1m",
        maxHp: 7,
        speed: 1.3,
        quips: [
            "hodl my deodorant",
            "sniff the blockchain",
            "gas fees? that's me"
        ]
    }
];

var npcSpawnPoints = [
    { x: 4.5, y: 4.5 },
    { x: 8.5, y: 4.5 },
    { x: 11.5, y: 3.5 },
    { x: 12.5, y: 8.5 },
    { x: 6.5, y: 11.5 },
    { x: 3.5, y: 13.5 }
];

var npcs = [];

var serverConfig = loadServerConfig();
var GAME_MODES = ["Deathmatch", "Survival", "Chill"];
var MAP_OPTIONS = ["Default Facility"];
var SPRITE_DENSITY = ["Sparse", "Normal", "Thicc"];

var gameConfig = {
    publishPresence: true,
    mpHost: serverConfig.host,
    mpPort: serverConfig.port,
    mpDb: "dumbfps",
    mpChannel: "players",
    gameModeIndex: 0,
    mapIndex: 0,
    spriteDensityIndex: 1,
    npcCount: npcTemplates.length,
    widescreen: false,
    joinTarget: null
};
gameConfig.npcCount = clampNPCCount(gameConfig.npcCount);
var activeGamesCache = { entries: [], timestamp: 0 };

var multiplayerAvailable = (mpModule && typeof mpModule.createMultiplayerClient === "function");
var multiplayer = multiplayerAvailable
    ? mpModule.createMultiplayerClient({
        system: system,
        host: gameConfig.mpHost,
        port: gameConfig.mpPort,
        db: gameConfig.mpDb,
        channel: gameConfig.mpChannel,
        enabled: true
    })
    : {
        enabled: false,
        otherCount: 0,
        remoteEntries: [],
        key: null,
        update: function () { },
        peek: function () { },
        setPublish: function () { },
        reconfigure: function () { },
        shutdown: function () { }
    };
applyMultiplayerSettings(gameConfig);

function cloneTemplate(tpl) {
    var copy = {};
    for (var k in tpl) {
        if (tpl.hasOwnProperty(k)) {
            var val = tpl[k];
            if (val && typeof val === "object" && val.length !== undefined) {
                copy[k] = val.slice();
            } else {
                copy[k] = val;
            }
        }
    }
    copy.alive = true;
    copy.respawn = 0;
    copy.brainTimer = 0;
    copy.heading = Math.random() * Math.PI * 2;
    copy.hp = tpl.maxHp || 5;
    copy.maxHp = tpl.maxHp || 5;
    return copy;
}

function chooseSpawn() {
    for (var attempt = 0; attempt < npcSpawnPoints.length * 2; attempt++) {
        var spot = npcSpawnPoints[Math.floor(Math.random() * npcSpawnPoints.length)];
        if (!spot) {
            continue;
        }
        if (isWall(spot.x, spot.y)) {
            continue;
        }
        if (distanceSq(spot.x, spot.y, player.x, player.y) < 2.25) {
            continue;
        }
        var blocked = false;
        for (var i = 0; i < npcs.length; i++) {
            if (npcs[i].alive && distanceSq(spot.x, spot.y, npcs[i].x, npcs[i].y) < 1) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            return { x: spot.x, y: spot.y };
        }
    }
    return { x: player.x + Math.cos(player.angle) * 2, y: player.y + Math.sin(player.angle) * 2 };
}

function seedNPCs(count) {
    npcs.length = 0;
    var total = (typeof count === "number") ? count : npcTemplates.length;
    if (total <= 0) {
        return;
    }
    for (var i = 0; i < total; i++) {
        var tpl = npcTemplates[i % npcTemplates.length];
        var npc = cloneTemplate(tpl);
        var spawn = npcSpawnPoints[i % npcSpawnPoints.length];
        if (!spawn || isWall(spawn.x, spawn.y)) {
            spawn = chooseSpawn();
        }
        npc.x = spawn.x;
        npc.y = spawn.y;
        npcs.push(npc);
    }
}

function distanceSq(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
}

var logMessage = defaultLogMessage;
var logTimer = 0;
var pewTimer = 0;
var vibeDecay = 0;
var statusTimer = 0;
var statusText = statusPhrases[0];

var rows = [];
var colorRows = [];
var remoteDebugTimer = 0;

function debugLog(message) {
    if (typeof log === "function") {
        try {
            log("[DUMBFPS] " + message);
        } catch (ignore) { }
    }
}

function normalizeAngle(a) {
    while (a < 0) {
        a += Math.PI * 2;
    }
    while (a >= Math.PI * 2) {
        a -= Math.PI * 2;
    }
    return a;
}

function angleDifference(a, b) {
    var diff = normalizeAngle(a - b);
    if (diff > Math.PI) {
        diff -= Math.PI * 2;
    }
    if (diff < -Math.PI) {
        diff += Math.PI * 2;
    }
    return diff;
}

function isWall(x, y) {
    var ix = x | 0;
    var iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= MAP_WIDTH || iy >= MAP_HEIGHT) {
        return true;
    }
    return mapData[iy].charAt(ix) === '#';
}

function hasLineOfSight(x0, y0, x1, y1, dist) {
    var steps = dist / SHOT_STEP;
    if (steps < 1) {
        steps = 1;
    }
    var stepX = (x1 - x0) / steps;
    var stepY = (y1 - y0) / steps;
    var x = x0;
    var y = y0;
    for (var i = 0; i < steps; i++) {
        x += stepX;
        y += stepY;
        if (isWall(x, y)) {
            return false;
        }
    }
    return true;
}

function castRay(angle) {
    angle = normalizeAngle(angle);
    var sinA = Math.sin(angle);
    var cosA = Math.cos(angle);
    var mapX = player.x | 0;
    var mapY = player.y | 0;
    var deltaDistX = cosA === 0 ? 1e6 : Math.abs(1 / cosA);
    var deltaDistY = sinA === 0 ? 1e6 : Math.abs(1 / sinA);
    var stepX = cosA < 0 ? -1 : 1;
    var stepY = sinA < 0 ? -1 : 1;
    var sideDistX = cosA < 0 ? (player.x - mapX) * deltaDistX : (mapX + 1.0 - player.x) * deltaDistX;
    var sideDistY = sinA < 0 ? (player.y - mapY) * deltaDistY : (mapY + 1.0 - player.y) * deltaDistY;
    var side = 0;

    for (; ;) {
        if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
        } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
        }
        if (mapX < 0 || mapY < 0 || mapX >= MAP_WIDTH || mapY >= MAP_HEIGHT) {
            break;
        }
        if (mapData[mapY].charAt(mapX) === '#') {
            break;
        }
        if (sideDistX > MAX_VIEW_DIST && sideDistY > MAX_VIEW_DIST) {
            break;
        }
    }

    var distance;
    if (side === 0) {
        distance = (mapX - player.x + (1 - stepX) / 2) / cosA;
    } else {
        distance = (mapY - player.y + (1 - stepY) / 2) / sinA;
    }
    if (!distance || distance < 0.0001) {
        distance = 0.0001;
    }
    return { dist: distance, side: side };
}

function tryMove(dx, dy) {
    var nx = player.x + dx;
    var ny = player.y + dy;
    if (!isWall(nx, player.y)) {
        player.x = nx;
    }
    if (!isWall(player.x, ny)) {
        player.y = ny;
    }
}

function fireGun() {
    player.shots++;
    pewTimer = 0.18;
    var bestTarget = null;
    var bestDist = SHOT_RANGE;

    for (var i = 0; i < npcs.length; i++) {
        var npc = npcs[i];
        if (!npc.alive || npc.hp <= 0) {
            continue;
        }
        var dx = npc.x - player.x;
        var dy = npc.y - player.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > SHOT_RANGE) {
            continue;
        }
        var angleToNPC = Math.atan2(dy, dx);
        if (Math.abs(angleDifference(angleToNPC, player.angle)) > AIM_TOLERANCE) {
            continue;
        }
        if (!hasLineOfSight(player.x, player.y, npc.x, npc.y, dist)) {
            continue;
        }
        if (dist < bestDist) {
            bestDist = dist;
            bestTarget = npc;
        }
    }

    if (bestTarget) {
        bestTarget.hp -= 2 + Math.floor(Math.random() * 2);
        player.hits++;
        if (bestTarget.hp <= 0) {
            bestTarget.alive = false;
            bestTarget.respawn = 6 + Math.random() * 6;
            player.score += 111;
            player.vibe = Math.min(200, player.vibe + 12);
            logMessage = bestTarget.name + " yeets into Goo Lagoon.";
            logTimer = 2.5;
        } else {
            player.vibe = Math.min(200, player.vibe + 3);
            logMessage = bestTarget.name + " now smells like ozone (" + bestTarget.hp + "hp).";
            logTimer = 1.6;
        }
        return;
    }

    var remoteHit = null;
    if (multiplayer && multiplayer.remoteEntries) {
        for (var r = 0; r < multiplayer.remoteEntries.length; r++) {
            var entry = multiplayer.remoteEntries[r];
            if (!entry || typeof entry.x !== "number" || typeof entry.y !== "number") {
                continue;
            }
            if (entry._key && multiplayer.key && entry._key === multiplayer.key) {
                continue;
            }
            var rdx = entry.x - player.x;
            var rdy = entry.y - player.y;
            var rdist = Math.sqrt(rdx * rdx + rdy * rdy);
            if (rdist > SHOT_RANGE) {
                continue;
            }
            var angleToRemote = Math.atan2(rdy, rdx);
            if (Math.abs(angleDifference(angleToRemote, player.angle)) > AIM_TOLERANCE) {
                continue;
            }
            if (!hasLineOfSight(player.x, player.y, entry.x, entry.y, rdist)) {
                continue;
            }
            remoteHit = entry;
            break;
        }
    }
    if (remoteHit) {
        player.hits++;
        player.vibe = Math.min(200, player.vibe + 5);
        logMessage = (remoteHit.alias || "remote") + " feels your presence.";
        logTimer = 1.6;
        return;
    }

    var missRay = player.angle;
    var missX = player.x;
    var missY = player.y;
    for (var step = SHOT_STEP; step < 3; step += SHOT_STEP) {
        missX += Math.cos(missRay) * SHOT_STEP;
        missY += Math.sin(missRay) * SHOT_STEP;
        if (isWall(missX, missY)) {
            player.vibe = Math.max(5, player.vibe - 7);
            logMessage = "You griefed a wall. Wall 1, you 0.";
            logTimer = 1.6;
            return;
        }
    }
    player.vibe = Math.max(0, player.vibe - 3);
    logMessage = "Air got clapped. Carbon credits -1.";
    logTimer = 1.2;
}

function updateNPCs(dt) {
    for (var i = 0; i < npcs.length; i++) {
        var npc = npcs[i];
        if (!npc.alive) {
            npc.respawn -= dt;
            if (npc.respawn <= 0) {
                var spawn = chooseSpawn();
                npc.x = spawn.x;
                npc.y = spawn.y;
                npc.alive = true;
                npc.heading = Math.random() * Math.PI * 2;
                npc.brainTimer = 0;
                npc.hp = npc.maxHp;
                if (Math.random() < 0.7) {
                    logMessage = npc.name + " respawns smelling like keyboard cleaner.";
                    logTimer = 2.0;
                }
            }
            continue;
        }

        npc.brainTimer -= dt;
        if (npc.brainTimer <= 0) {
            npc.brainTimer = 1.5 + Math.random() * 2.5;
            var bias = Math.atan2(player.y - npc.y, player.x - npc.x);
            npc.heading = bias + (Math.random() - 0.5);
            if (Math.random() < 0.25) {
                var quip = npc.quips[Math.floor(Math.random() * npc.quips.length)];
                logMessage = npc.name + ": " + quip;
                logTimer = 2.0;
            }
        }

        var speed = npc.speed || 1;
        var nx = npc.x + Math.cos(npc.heading) * speed * dt;
        var ny = npc.y + Math.sin(npc.heading) * speed * dt;
        if (!isWall(nx, npc.y)) {
            npc.x = nx;
        } else {
            npc.heading = Math.random() * Math.PI * 2;
        }
        if (!isWall(npc.x, ny)) {
            npc.y = ny;
        } else {
            npc.heading = Math.random() * Math.PI * 2;
        }

        if (distanceSq(npc.x, npc.y, player.x, player.y) < 1.1) {
            player.vibe = Math.max(0, player.vibe - dt * 9);
            if (Math.random() < dt * 2) {
                logMessage = npc.name + " steals your personal space.";
                logTimer = 1.4;
            }
        }
    }
}

function updateStatus(dt) {
    statusTimer -= dt;
    if (statusTimer <= 0) {
        statusText = statusPhrases[Math.floor(Math.random() * statusPhrases.length)];
        statusTimer = 3 + Math.random() * 3;
    }
}

function renderFrame() {
    var centerY = Math.floor(VIEW_HEIGHT / 2) + viewTilt;
    if (centerY < 1) {
        centerY = 1;
    } else if (centerY > VIEW_HEIGHT - 2) {
        centerY = VIEW_HEIGHT - 2;
    }

    var skyDenom = centerY <= 1 ? 1 : (centerY - 1);
    var floorDenom = VIEW_HEIGHT - centerY <= 1 ? 1 : (VIEW_HEIGHT - centerY - 1);

    for (var y = 0; y < VIEW_HEIGHT; y++) {
        var row = rows[y];
        var colorRow = colorRows[y];
        var fillChar;
        var fillColor;
        if (y < centerY) {
            var skyRatio = skyDenom === 0 ? 0 : y / skyDenom;
            var skyIndex = Math.min(skyPalette.length - 1, Math.floor(skyRatio * skyPalette.length));
            var skyEntry = skyPalette[skyIndex];
            fillChar = skyEntry.char;
            fillColor = skyEntry.color;
        } else {
            var floorRatioBase = floorDenom === 0 ? 0 : (y - centerY) / floorDenom;
            if (floorRatioBase < 0) {
                floorRatioBase = 0;
            }
            if (floorRatioBase > 1) {
                floorRatioBase = 1;
            }
            var floorIndex = Math.min(floorPalette.length - 1, Math.floor(floorRatioBase * floorPalette.length));
            var floorEntry = floorPalette[floorIndex];
            fillChar = floorEntry.char;
            fillColor = floorEntry.color;
        }
        for (var x = 0; x < VIEW_WIDTH; x++) {
            row[x] = fillChar;
            colorRow[x] = fillColor;
        }
    }

    var depth = new Array(VIEW_WIDTH);
    for (var column = 0; column < VIEW_WIDTH; column++) {
        var rayAngle = player.angle - (FOV / 2) + (column / VIEW_WIDTH) * FOV;
        var hit = castRay(rayAngle);
        var dist = hit.dist;
        if (dist > MAX_VIEW_DIST) {
            dist = MAX_VIEW_DIST;
        }
        depth[column] = dist;
        var correctedDist = dist * Math.cos(rayAngle - player.angle);
        if (correctedDist < 0.0001) {
            correctedDist = 0.0001;
        }
        var lineHeight = Math.floor(VIEW_HEIGHT / correctedDist);
        if (lineHeight < 1) {
            lineHeight = 1;
        }
        var drawStart = Math.floor(-lineHeight / 2 + centerY);
        if (drawStart < 0) {
            drawStart = 0;
        }
        var drawEnd = Math.floor(lineHeight / 2 + centerY);
        if (drawEnd >= VIEW_HEIGHT) {
            drawEnd = VIEW_HEIGHT - 1;
        }
        var shadeIndex = wallPalette.length - 1 - Math.min(wallPalette.length - 1, Math.floor(correctedDist * 0.7));
        if (shadeIndex < 0) {
            shadeIndex = 0;
        }
        if (hit.side === 1 && shadeIndex > 0) {
            shadeIndex--;
        }
        var wallEntry = wallPalette[shadeIndex];
        var wallChar = wallEntry.char;
        var wallColor = wallEntry.color;
        for (var drawY = drawStart; drawY <= drawEnd; drawY++) {
            rows[drawY][column] = wallChar;
            colorRows[drawY][column] = wallColor;
        }
        for (var floorY = drawEnd + 1; floorY < VIEW_HEIGHT; floorY++) {
            var floorSpread = floorDenom === 0 ? 1 : floorDenom;
            var floorRatio = (floorY - centerY) / floorSpread;
            if (floorRatio < 0) {
                floorRatio = 0;
            }
            if (floorRatio > 1) {
                floorRatio = 1;
            }
            var floorIdx = Math.min(floorPalette.length - 1, Math.floor(floorRatio * floorPalette.length));
            var floorPix = floorPalette[floorIdx];
            rows[floorY][column] = floorPix.char;
            colorRows[floorY][column] = floorPix.color;
        }
    }

    for (var i = 0; i < npcs.length; i++) {
        var npc = npcs[i];
        if (!npc.alive) {
            continue;
        }
        var spriteDX = npc.x - player.x;
        var spriteDY = npc.y - player.y;
        var distance = Math.sqrt(spriteDX * spriteDX + spriteDY * spriteDY);
        if (distance < 0.2) {
            distance = 0.2;
        }
        var spriteAngle = Math.atan2(spriteDY, spriteDX) - player.angle;
        while (spriteAngle < -Math.PI) {
            spriteAngle += Math.PI * 2;
        }
        while (spriteAngle > Math.PI) {
            spriteAngle -= Math.PI * 2;
        }
        if (Math.abs(spriteAngle) > FOV) {
            continue;
        }
        var spriteScreenX = Math.floor((VIEW_WIDTH / 2) * (1 + Math.tan(spriteAngle) / Math.tan(FOV / 2)));
        var spriteHeight = Math.floor(VIEW_HEIGHT / distance);
        var spriteWidth = spriteHeight;
        var drawStartY = Math.floor(-spriteHeight / 2 + centerY);
        if (drawStartY < 0) {
            drawStartY = 0;
        }
        var drawEndY = Math.floor(spriteHeight / 2 + centerY);
        if (drawEndY >= VIEW_HEIGHT) {
            drawEndY = VIEW_HEIGHT - 1;
        }
        var drawStartX = Math.floor(spriteScreenX - spriteWidth / 2);
        var drawEndX = Math.floor(spriteScreenX + spriteWidth / 2);
        for (var stripe = drawStartX; stripe <= drawEndX; stripe++) {
            if (stripe < 0 || stripe >= VIEW_WIDTH) {
                continue;
            }
            if (depth[stripe] < distance) {
                continue;
            }
            var bodyChar = npc.char;
            var bodyColor = npc.color;
            for (var spriteY = drawStartY; spriteY <= drawEndY; spriteY++) {
                rows[spriteY][stripe] = bodyChar;
                colorRows[spriteY][stripe] = bodyColor;
            }
        }
        drawNPCOverlay(drawStartX, drawEndX, drawStartY, drawEndY, npc);
    }

    renderRemotePlayers(depth, centerY);

    var cx = Math.floor(VIEW_WIDTH / 2);
    var cy = centerY;
    if (cx > 1 && cx < VIEW_WIDTH - 2 && cy > 1 && cy < VIEW_HEIGHT - 2) {
        rows[cy][cx - 1] = '-';
        rows[cy][cx] = pewTimer > 0 ? '*' : '+';
        rows[cy][cx + 1] = '-';
        rows[cy - 1][cx] = '|';
        rows[cy + 1][cx] = '|';
        colorRows[cy][cx - 1] = crosshairColor;
        colorRows[cy][cx + 1] = crosshairColor;
        colorRows[cy - 1][cx] = crosshairColor;
        colorRows[cy + 1][cx] = crosshairColor;
        colorRows[cy][cx] = pewTimer > 0 ? muzzleColor : crosshairColor;
    }

    var lines = new Array(VIEW_HEIGHT + HUD_ROWS);
    for (var yOut = 0; yOut < VIEW_HEIGHT; yOut++) {
        lines[yOut] = buildColoredLine(rows[yOut], colorRows[yOut]);
    }

    var hudIndex = VIEW_HEIGHT;
    var accuracy = player.shots > 0 ? Math.floor((player.hits / player.shots) * 100) : 0;
    var angleDeg = Math.floor(normalizeAngle(player.angle) * 180 / Math.PI);
    if (HUD_ROWS > 0) {
        lines[hudIndex++] = padLine("Score:" + player.score + " | Vibe:" + player.vibe + " | Accuracy:" + accuracy + "% | Angle:" + angleDeg + "°");
    }
    if (HUD_ROWS > 1) {
        var statusLine = "X:" + player.x.toFixed(2) + " Y:" + player.y.toFixed(2) + " :: " + statusText;
        if (multiplayer.enabled) {
            statusLine += " | MP:" + multiplayer.otherCount;
        }
        lines[hudIndex++] = padLine(statusLine);
    }
    if (HUD_ROWS > 2) {
        lines[hudIndex++] = padLine(logMessage);
    }
    while (hudIndex < lines.length) {
        lines[hudIndex++] = padLine("");
    }

    console.gotoxy(1, 1);
    console.write(lines.join("\r\n") + ANSI_RESET);
}

function renderRemotePlayers(depth, centerY) {
    if (!multiplayer || !multiplayer.remoteEntries) {
        return;
    }
    for (var i = 0; i < multiplayer.remoteEntries.length; i++) {
        var entry = multiplayer.remoteEntries[i];
        if (!entry) {
            continue;
        }
        if (entry._key && multiplayer.key && entry._key === multiplayer.key) {
            continue;
        }
        if (typeof entry.x !== "number" || typeof entry.y !== "number") {
            continue;
        }
        var dx = entry.x - player.x;
        var dy = entry.y - player.y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (!isFinite(distance) || distance < 0.2) {
            distance = 0.2;
        }
        var spriteAngle = Math.atan2(dy, dx) - player.angle;
        while (spriteAngle < -Math.PI) {
            spriteAngle += Math.PI * 2;
        }
        while (spriteAngle > Math.PI) {
            spriteAngle -= Math.PI * 2;
        }
        if (Math.abs(spriteAngle) > FOV) {
            continue;
        }
        var spriteScreenX = Math.floor((VIEW_WIDTH / 2) * (1 + Math.tan(spriteAngle) / Math.tan(FOV / 2)));
        var spriteHeight = Math.floor(VIEW_HEIGHT / distance);
        var spriteWidth = spriteHeight;
        var drawStartY = Math.floor(-spriteHeight / 2 + centerY);
        if (drawStartY < 0) {
            drawStartY = 0;
        }
        var drawEndY = Math.floor(spriteHeight / 2 + centerY);
        if (drawEndY >= VIEW_HEIGHT) {
            drawEndY = VIEW_HEIGHT - 1;
        }
        var drawStartX = Math.floor(spriteScreenX - spriteWidth / 2);
        var drawEndX = Math.floor(spriteScreenX + spriteWidth / 2);
        for (var stripe = drawStartX; stripe <= drawEndX; stripe++) {
            if (stripe < 0 || stripe >= VIEW_WIDTH) {
                continue;
            }
            if (depth[stripe] < distance) {
                continue;
            }
            for (var spriteY = drawStartY; spriteY <= drawEndY; spriteY++) {
                rows[spriteY][stripe] = '@';
                colorRows[spriteY][stripe] = "\x1b[94;1m";
            }
        }
        drawNPCOverlay(drawStartX, drawEndX, drawStartY, drawEndY, {
            name: entry.alias || "remote",
            hp: entry.vibe !== undefined ? Math.max(0, entry.vibe) : 0,
            maxHp: 200
        });
    }
}

function padLine(text) {
    if (text.length > VIEW_WIDTH) {
        return text.substr(0, VIEW_WIDTH);
    }
    if (text.length < VIEW_WIDTH) {
        return text + new Array(VIEW_WIDTH - text.length + 1).join(" ");
    }
    return text;
}

function drawNPCOverlay(leftX, rightX, topY, bottomY, npc) {
    if (bottomY <= topY || rightX < leftX) {
        return;
    }
    var midY = Math.floor((topY + bottomY) / 2);
    var nameY = Math.max(topY, midY - 1);
    var hpY = Math.min(bottomY, midY + 1);
    var name = npc.name.toUpperCase();
    var hpRatio = npc.maxHp > 0 ? npc.hp / npc.maxHp : 0;
    if (hpRatio < 0) {
        hpRatio = 0;
    }
    var span = rightX - leftX + 1;
    var filled = Math.max(0, Math.round(span * hpRatio));

    for (var x = leftX; x <= rightX; x++) {
        if (x < 0 || x >= VIEW_WIDTH) {
            continue;
        }
        if (name.length > 0) {
            rows[nameY][x] = name.charAt((x - leftX) % name.length);
            colorRows[nameY][x] = "\x1b[97;44m";
        }
        rows[hpY][x] = (x - leftX) < filled ? '#' : ':';
        colorRows[hpY][x] = (x - leftX) < filled ? "\x1b[92;40m" : "\x1b[91;40m";
    }
}

function adjustTilt(step) {
    viewTilt += step;
    if (viewTilt > MAX_TILT) {
        viewTilt = MAX_TILT;
    } else if (viewTilt < -MAX_TILT) {
        viewTilt = -MAX_TILT;
    }
}

function buildColoredLine(chars, colors) {
    var out = "";
    var lastColor = "";
    for (var i = 0; i < chars.length; i++) {
        var color = colors[i] || "";
        if (color !== lastColor) {
            out += color;
            lastColor = color;
        }
        out += chars[i];
    }
    if (lastColor !== ANSI_RESET) {
        out += ANSI_RESET;
    }
    return out;
}

function setupDimensions() {
    totalRows = console.screen_rows;
    HUD_ROWS = Math.min(5, Math.max(3, Math.floor(totalRows / 5)));
    if (totalRows - HUD_ROWS < 12) {
        HUD_ROWS = Math.max(0, totalRows - 12);
    }
    VIEW_HEIGHT = totalRows - HUD_ROWS;
    if (VIEW_HEIGHT < 8) {
        VIEW_HEIGHT = totalRows;
        HUD_ROWS = 0;
    }
    var targetWidth = useWideScreen ? 132 : 80;
    VIEW_WIDTH = Math.min(targetWidth, console.screen_columns);
    if (VIEW_WIDTH < 40 && console.screen_columns >= 40) {
        VIEW_WIDTH = 40;
    }
    MAX_TILT = Math.max(1, Math.floor(VIEW_HEIGHT / 6));
}

function setupBuffers() {
    rows = new Array(VIEW_HEIGHT);
    colorRows = new Array(VIEW_HEIGHT);
    for (var y = 0; y < VIEW_HEIGHT; y++) {
        rows[y] = new Array(VIEW_WIDTH);
        colorRows[y] = new Array(VIEW_WIDTH);
    }
}

function resetGameState(config) {
    localSessionId++;
    player = newPlayer();
    logMessage = defaultLogMessage;
    logTimer = 0;
    pewTimer = 0;
    vibeDecay = 0;
    statusTimer = 0;
    statusText = statusPhrases[Math.floor(Math.random() * statusPhrases.length)];
    viewTilt = 0;
    if (config.joinTarget && typeof config.joinTarget.npcCount === "number") {
        config.npcCount = clampNPCCount(config.joinTarget.npcCount);
    }
    var npcCount = (typeof config.npcCount === "number") ? config.npcCount : npcTemplates.length;
    npcCount = clampNPCCount(npcCount);
    if (npcCount === 0) {
        npcs.length = 0;
    } else {
        seedNPCs(npcCount);
    }
    pendingJoinTarget = config.joinTarget ? cloneRemoteEntry(config.joinTarget) : null;
    joinSpawnedOnTarget = false;
    pendingJoinLastLog = 0;
    if (pendingJoinTarget && typeof pendingJoinTarget.x === "number" && typeof pendingJoinTarget.y === "number") {
        player.x = pendingJoinTarget.x + 0.5;
        player.y = pendingJoinTarget.y + 0.5;
        player.angle = normalizeAngle(Math.atan2(pendingJoinTarget.y - player.y, pendingJoinTarget.x - player.x));
        joinSpawnedOnTarget = true;
        debugLog("Spawned at remote lobby coords immediately (key=" + (pendingJoinTarget._key || "") + ")");
    } else if (pendingJoinTarget) {
        debugLog("Pending remote lobby without coords yet (key=" + (pendingJoinTarget._key || "") + ")");
    }
    config.joinTarget = null;
}

function applyMultiplayerSettings(config) {
    useWideScreen = !!config.widescreen;
    if (!multiplayerAvailable || !multiplayer || typeof multiplayer.reconfigure !== "function") {
        if (config.publishPresence && typeof log === "function") {
            log("[DUMBFPS] Multiplayer requested but JSON client unavailable");
        }
        return;
    }
    multiplayer.reconfigure({
        host: config.mpHost,
        port: config.mpPort,
        db: config.mpDb,
        channel: config.mpChannel,
        enabled: true
    });
    if (multiplayer.setPublish) {
        multiplayer.setPublish(config.publishPresence);
    }
}

function runGame(config) {
    applyMultiplayerSettings(config);
    setupDimensions();
    setupBuffers();
    resetGameState(config);
    console.clear();

    var oldCtrlKey = console.ctrlkey_passthru;
    var oldNoyield = console.noyield;
    console.ctrlkey_passthru = -1;
    console.noyield = true;

    var lastTick = Date.now();
    var startTime = lastTick;
    var running = true;
    var reason = "player_exit";

    try {
        while (running && !console.aborted && !js.terminated) {
            var now = Date.now();
            var delta = (now - lastTick) / 1000;
            if (delta > 0.3) {
                delta = 0.3;
            }
            lastTick = now;

            var key;
            do {
                key = console.inkey(0, 0);
                if (!key) {
                    break;
                }
                if (key === KEY_ESC) {
                    running = false;
                    reason = "player_exit";
                    break;
                }
                if (key === ' ') {
                    fireGun();
                } else if (typeof key === "string" && key.length === 1) {
                    var lower = key.toLowerCase();
                    if (lower === 'w') {
                        tryMove(Math.cos(player.angle) * MOVE_SPEED * delta, Math.sin(player.angle) * MOVE_SPEED * delta);
                    } else if (lower === 's') {
                        tryMove(-Math.cos(player.angle) * MOVE_SPEED * delta, -Math.sin(player.angle) * MOVE_SPEED * delta);
                    } else if (lower === 'a') {
                        tryMove(-Math.sin(player.angle) * STRAFE_SPEED * delta, Math.cos(player.angle) * STRAFE_SPEED * delta);
                    } else if (lower === 'd') {
                        tryMove(Math.sin(player.angle) * STRAFE_SPEED * delta, -Math.cos(player.angle) * STRAFE_SPEED * delta);
                    } else if (lower === '4') {
                        player.angle = normalizeAngle(player.angle - ROT_SPEED * delta);
                    } else if (lower === '6') {
                        player.angle = normalizeAngle(player.angle + ROT_SPEED * delta);
                    } else if (lower === '8') {
                        adjustTilt(-1);
                    } else if (lower === '2') {
                        adjustTilt(1);
                    } else if (lower === '5') {
                        fireGun();
                    } else if (lower === '7') {
                        adjustTilt(-1);
                        player.angle = normalizeAngle(player.angle - ROT_SPEED * delta);
                    } else if (lower === '9') {
                        adjustTilt(-1);
                        player.angle = normalizeAngle(player.angle + ROT_SPEED * delta);
                    } else if (lower === '1') {
                        adjustTilt(1);
                        player.angle = normalizeAngle(player.angle - ROT_SPEED * delta);
                    } else if (lower === '3') {
                        adjustTilt(1);
                        player.angle = normalizeAngle(player.angle + ROT_SPEED * delta);
                    }
                }
                if (key === KEY_LEFT) {
                    player.angle = normalizeAngle(player.angle - ROT_SPEED * delta * 2);
                } else if (key === KEY_RIGHT) {
                    player.angle = normalizeAngle(player.angle + ROT_SPEED * delta * 2);
                } else if (key === KEY_UP) {
                    tryMove(Math.cos(player.angle) * MOVE_SPEED * delta, Math.sin(player.angle) * MOVE_SPEED * delta);
                } else if (key === KEY_DOWN) {
                    tryMove(-Math.cos(player.angle) * MOVE_SPEED * delta, -Math.sin(player.angle) * MOVE_SPEED * delta);
                }
            } while (key);

            if (!running) {
                break;
            }

            if (pewTimer > 0) {
                pewTimer -= delta;
                if (pewTimer < 0) {
                    pewTimer = 0;
                }
            }
            if (logTimer > 0) {
                logTimer -= delta;
                if (logTimer <= 0) {
                    logTimer = 0;
                    logMessage = defaultLogMessage;
                }
            }
            vibeDecay += delta;
            if (vibeDecay > 5) {
                vibeDecay = 0;
                player.vibe = Math.max(0, player.vibe - 1);
            }

            updateStatus(delta);
            updateNPCs(delta);
            if (multiplayer.update) {
                multiplayer.update(delta, config.publishPresence ? {
                    score: player.score,
                    vibe: player.vibe,
                    x: player.x,
                    y: player.y,
                    session: localSessionId,
                    npcCount: config.npcCount
                } : null);
            }
            remoteDebugTimer -= delta;
            if (remoteDebugTimer <= 0) {
                remoteDebugTimer = 1.5;
                if (multiplayer && multiplayer.remoteEntries && multiplayer.remoteEntries.length) {
                    var summaries = [];
                    for (var rd = 0; rd < multiplayer.remoteEntries.length; rd++) {
                        var entry = multiplayer.remoteEntries[rd];
                        if (!entry) {
                            continue;
                        }
                        var age = entry.ts ? (Date.now() - entry.ts) : 0;
                        summaries.push((entry.alias || "?") + " x=" + (typeof entry.x === "number" ? entry.x.toFixed(2) : "?") + " y=" + (typeof entry.y === "number" ? entry.y.toFixed(2) : "?") + " age=" + Math.round(age) + "ms");
                    }
                    debugLog("Remote state sample: " + summaries.join(" | "));
                } else {
                    debugLog("Remote state sample: none");
                }
            }

            if (pendingJoinTarget && multiplayer && multiplayer.remoteEntries && multiplayer.remoteEntries.length) {
                var matched = false;
                for (var mj = 0; mj < multiplayer.remoteEntries.length; mj++) {
                    var remoteEntry = multiplayer.remoteEntries[mj];
                    if (!remoteEntry) {
                        continue;
                    }
                    if (!entriesMatch(pendingJoinTarget, remoteEntry)) {
                        continue;
                    }
                    matched = true;
                    var latest = cloneRemoteEntry(remoteEntry) || remoteEntry;
                    pendingJoinTarget = latest;
                    if (!joinSpawnedOnTarget && typeof latest.x === "number" && typeof latest.y === "number") {
                        player.x = latest.x + 0.5;
                        player.y = latest.y + 0.5;
                        player.angle = normalizeAngle(Math.atan2(latest.y - player.y, latest.x - player.x));
                        joinSpawnedOnTarget = true;
                        logMessage = "Linked to " + (latest.alias || "remote player") + ".";
                        logTimer = 2.5;
                        debugLog("Joined remote position (key=" + (latest._key || "") + ", x=" + latest.x.toFixed(2) + ", y=" + latest.y.toFixed(2) + ")");
                    }
                    break;
                }
                var now = Date.now();
                if (!joinSpawnedOnTarget) {
                    if (matched) {
                        if (now - pendingJoinLastLog > 1500) {
                            debugLog("Matched lobby without coords yet (key=" + (pendingJoinTarget._key || "") + ")");
                            pendingJoinLastLog = now;
                        }
                    } else {
                        if (now - pendingJoinLastLog > 1500) {
                            debugLog("Waiting for selected lobby to publish (key=" + (pendingJoinTarget._key || "") + ")");
                            pendingJoinLastLog = now;
                        }
                    }
                }
            }

            renderFrame();
            mswait(20);
        }
    } finally {
        if (multiplayer.setPublish) {
            multiplayer.setPublish(config.publishPresence);
        }
        console.ctrlkey_passthru = oldCtrlKey;
        console.noyield = oldNoyield;
    }
    if (pendingJoinTarget && !joinSpawnedOnTarget) {
        debugLog("Game end with unresolved join target (key=" + (pendingJoinTarget._key || "") + ")");
    }
    pendingJoinTarget = null;
    joinSpawnedOnTarget = false;

    if (console.aborted || js.terminated) {
        reason = "abort";
    }

    console.gotoxy(1, console.screen_rows);
    return {
        score: player.score,
        vibe: player.vibe,
        shots: player.shots,
        hits: player.hits,
        duration: (Date.now() - startTime) / 1000,
        reason: reason
    };
}

function showSplash() {
    console.clear();
    console.print("\r\n\r\n");
    printCentered("=== D U M B F P S ===");
    console.print("\r\n");
    printCentered("budget doom deluxe for your terminal");
    console.print("\r\n\r\n");
    printCentered("Press any key to continue");
    var start = Date.now();
    while (!console.aborted && !js.terminated) {
        var key = console.inkey(0, 500);
        if (key) {
            break;
        }
        if (Date.now() - start > 2500) {
            break;
        }
    }
}

function clampNPCCount(value) {
    var max = npcSpawnPoints.length;
    if (value < 0) {
        return 0;
    }
    if (value > max) {
        return max;
    }
    return value;
}

function printCentered(text) {
    var width = console.screen_columns || 80;
    if (!text) {
        console.print("\r\n");
        return;
    }
    var spaces = Math.max(0, Math.floor((width - text.length) / 2));
    var padding = spaces > 0 ? new Array(spaces + 1).join(' ') : "";
    console.print(padding + text + "\r\n");
}

function cloneRemoteEntry(entry) {
    if (!entry || typeof entry !== "object") {
        return null;
    }
    var copy = {};
    for (var key in entry) {
        if (entry.hasOwnProperty(key)) {
            var val = entry[key];
            if ((key === "x" || key === "y") && val !== null && val !== undefined) {
                var num = parseFloat(val);
                if (!isNaN(num)) {
                    copy[key] = num;
                    continue;
                }
            }
            if ((key === "score" || key === "vibe" || key === "session") && val !== null && val !== undefined) {
                var intVal = parseInt(val, 10);
                if (!isNaN(intVal)) {
                    copy[key] = intVal;
                    continue;
                }
            }
            if (key === "npcCount" && val !== null && val !== undefined) {
                var npcVal = parseInt(val, 10);
                if (!isNaN(npcVal)) {
                    copy[key] = npcVal;
                    continue;
                }
            }
            if (key === "ts") {
                copy[key] = coerceTimestamp(val);
                continue;
            }
            copy[key] = val;
        }
    }
    return copy;
}

function ensurePresenceSnapshot(state) {
    if (!multiplayer || typeof multiplayer.update !== "function") {
        return;
    }
    if (state && typeof state.npcCount !== "number") {
        state.npcCount = gameConfig.npcCount;
    }
    var delta = (typeof multiplayer.syncInterval === "number" && multiplayer.syncInterval > 0) ? multiplayer.syncInterval : 0.6;
    try {
        multiplayer.syncTimer = delta;
        multiplayer.update(delta, state || {
            score: player.score,
            vibe: player.vibe,
            x: player.x,
            y: player.y,
            session: localSessionId,
            npcCount: typeof state === "object" && state && typeof state.npcCount === "number" ? state.npcCount : gameConfig.npcCount
        });
        debugLog("Forced presence snapshot (session=" + (state && state.session !== undefined ? state.session : localSessionId) + ", x=" + player.x.toFixed(2) + ", y=" + player.y.toFixed(2) + ")");
    } catch (err) {
        debugLog("ensurePresenceSnapshot failed: " + err);
    }
}

function entriesMatch(target, remote) {
    if (!target || !remote) {
        return false;
    }
    if (target._key && remote._key && target._key === remote._key) {
        return true;
    }
    if (target.session !== undefined && remote.session !== undefined && target.session === remote.session) {
        if (!target.system || !remote.system || target.system === remote.system) {
            return true;
        }
    }
    if (target.alias && remote.alias && target.alias === remote.alias) {
        return true;
    }
    return false;
}

function coerceTimestamp(value) {
    if (typeof value === "number" && isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.length) {
        var parsed = parseInt(value, 10);
        if (!isNaN(parsed)) {
            return parsed;
        }
    }
    return null;
}

function collectRemoteEntries() {
    var results = [];
    if (!multiplayer || !multiplayer.remoteEntries) {
        return results;
    }
    for (var i = 0; i < multiplayer.remoteEntries.length; i++) {
        var entry = multiplayer.remoteEntries[i];
        if (!entry) {
            continue;
        }
        if (entry._key && multiplayer.key && entry._key === multiplayer.key) {
            continue;
        }
        results.push(entry);
    }
    if (results.length > 1) {
        results.sort(function (a, b) {
            var nameA = (a.alias || "").toLowerCase();
            var nameB = (b.alias || "").toLowerCase();
            if (nameA < nameB) {
                return -1;
            }
            if (nameA > nameB) {
                return 1;
            }
            var tsA = coerceTimestamp(a.ts);
            var tsB = coerceTimestamp(b.ts);
            if (tsA === null && tsB === null) {
                return 0;
            }
            if (tsA === null) {
                return 1;
            }
            if (tsB === null) {
                return -1;
            }
            return tsB - tsA;
        });
    }
    return results;
}

function getRemoteGameCount(config) {
    var remote = (multiplayer && typeof multiplayer.otherCount === "number") ? multiplayer.otherCount : 0;
    if (remote === 0 && activeGamesCache.entries.length) {
        var delta = Date.now() - activeGamesCache.timestamp;
        if (delta >= 0 && delta < 2500) {
            remote = activeGamesCache.entries.length;
        }
    }
    return remote;
}

function showActiveGames(config) {
    var selection = 0;
    var running = true;
    var lastLoggedCount = -1;
    while (running && !console.aborted && !js.terminated) {
        var now = Date.now();
        if (multiplayer && typeof multiplayer.update === "function") {
            multiplayer.update(0.2, config && config.publishPresence ? {
                score: player.score,
                vibe: player.vibe,
                x: player.x,
                y: player.y,
                session: localSessionId
            } : null);
        }
        var rawEntries = collectRemoteEntries();
        var entries = [];
        if (rawEntries.length) {
            for (var r = 0; r < rawEntries.length; r++) {
                var snapshot = cloneRemoteEntry(rawEntries[r]);
                if (snapshot) {
                    entries.push(snapshot);
                }
            }
            if (entries.length) {
                activeGamesCache.entries = entries.slice();
                activeGamesCache.timestamp = now;
            }
        } else if (activeGamesCache.entries.length && now - activeGamesCache.timestamp < 2500) {
            for (var c = 0; c < activeGamesCache.entries.length; c++) {
                var cached = cloneRemoteEntry(activeGamesCache.entries[c]);
                if (cached) {
                    entries.push(cached);
                }
            }
        }

        if (!entries.length) {
            console.clear();
            printCentered("Active Games");
            console.print("\r\n");
            printCentered("No published games available right now.");
            console.print("\r\n");
            printCentered("Press any key to return");
            console.getkey(K_NONE);
            console.clear();
            debugLog("ActiveGames view: no entries (cached=" + activeGamesCache.entries.length + ")");
            return null;
        }
        if (entries.length !== lastLoggedCount) {
            lastLoggedCount = entries.length;
            var preview = [];
            for (var li = 0; li < entries.length; li++) {
                var e = entries[li];
                preview.push((e.alias || "?") + "[#" + (e._key || "?") + "] coords=" + (typeof e.x === "number" ? e.x.toFixed(2) : "?") + "," + (typeof e.y === "number" ? e.y.toFixed(2) : "?"));
            }
            debugLog("ActiveGames view: listing " + entries.length + " -> " + preview.join(" | "));
        }
        if (selection >= entries.length) {
            debugLog("ActiveGames selection index adjusted down (prev=" + selection + ", len=" + entries.length + ")");
            selection = entries.length - 1;
        }
        if (selection < 0) {
            debugLog("ActiveGames selection index adjusted up (len=" + entries.length + ")");
            selection = 0;
        }

        console.clear();
        printCentered("Active Games");
        console.print("\r\n");
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var prefix = (i === selection) ? "> " : "  ";
            var alias = entry.alias || "mystery";
            var label = (i + 1) + ". " + alias;
            var tsValue = coerceTimestamp(entry.ts);
            if (tsValue !== null) {
                var ago = now - tsValue;
                if (isFinite(ago) && ago >= 0) {
                    label += " | seen " + Math.floor(ago / 1000) + "s ago";
                }
            }
            if (entry.system) {
                label += " | " + entry.system;
            }
            if (typeof entry.npcCount === "number") {
                label += " | NPCs " + entry.npcCount;
            }
            if (entry.score !== undefined) {
                label += " | score " + entry.score;
            }
            if (entry.vibe !== undefined) {
                label += " | vibe " + entry.vibe;
            }
            if (entry.session !== undefined) {
                label += " | session " + entry.session;
            }
            if (typeof entry.x !== "number" || typeof entry.y !== "number" || !isFinite(entry.x) || !isFinite(entry.y)) {
                label += " | waiting for coords";
            }
            console.print(prefix + label + "\r\n");
        }
        console.print("\r\nUse UP/DOWN or W/S to move, digits jump to a row. ENTER joins the highlighted game. ESC cancels.\r\n");

        var key = console.getkey(K_NOECHO);
        if (!key) {
            debugLog("ActiveGames getkey returned falsy: " + key);
            continue;
        }
        if (typeof key === "string" && key.length) {
            debugLog("ActiveGames key read: '" + key.replace(/\r/g, "\\r").replace(/\n/g, "\\n") + "' (code=" + key.charCodeAt(0) + ")");
        } else {
            debugLog("ActiveGames key read (non-string): " + key);
        }
        if (key === KEY_UP || key === 'w' || key === 'W') {
            selection = (selection - 1 + entries.length) % entries.length;
            continue;
        }
        if (key === KEY_DOWN || key === 's' || key === 'S') {
            selection = (selection + 1) % entries.length;
            continue;
        }
        if (key === KEY_HOME) {
            selection = 0;
            continue;
        }
        if (key === KEY_END) {
            selection = entries.length - 1;
            continue;
        }
        if (key === KEY_ESC || key === 'q' || key === 'Q') {
            debugLog("ActiveGames cancelled (key=" + key + ")");
            console.clear();
            return null;
        }
        if (typeof key === "string") {
            if (key === '\r' || key === '\n' || key === ' ') {
                var chosenEntry = entries[selection];
                if (!chosenEntry) {
                    debugLog("ActiveGames ENTER pressed but entry missing (index=" + selection + ", len=" + entries.length + ")");
                    continue;
                }
                var chosen = cloneRemoteEntry(chosenEntry);
                console.clear();
                if (chosen) {
                    debugLog("ActiveGames selection confirmed (key=" + (chosen._key || "") + ", alias=" + (chosen.alias || "?") + ", coords=" + chosen.x + "," + chosen.y + ")");
                } else {
                    debugLog("ActiveGames selection clone failed (index=" + selection + ")");
                }
                return chosen;
            }
            var digit = parseInt(key, 10);
            if (!isNaN(digit) && digit >= 1 && digit <= entries.length) {
                selection = digit - 1;
                var quickEntry = entries[selection];
                if (!quickEntry) {
                    debugLog("ActiveGames digit pressed but entry missing (digit=" + digit + ")");
                    continue;
                }
                var quick = cloneRemoteEntry(quickEntry);
                console.clear();
                if (quick) {
                    debugLog("ActiveGames digit selection (key=" + (quick._key || "") + ", alias=" + (quick.alias || "?") + ", coords=" + quick.x + "," + quick.y + ")");
                } else {
                    debugLog("ActiveGames digit clone failed (digit=" + digit + ")");
                }
                return quick;
            }
            debugLog("ActiveGames key ignored (code=" + key + ")");
        }
    }
    console.clear();
    return null;
}

function promptInput(prompt, initial, max) {
    console.print("\r\n" + prompt + " [" + initial + "]: ");
    var value = console.getstr(initial, max || 40, K_EDIT);
    console.print("\r\n");
    if (value === null) {
        return undefined;
    }
    return value;
}

function menuError(message) {
    console.print("\1h\1rERROR:\1n " + message + "\r\n");
    mswait(800);
}

function showMenu(config) {
    var menuItems = [
        {
            id: "start",
            label: "~S~tart New Game",
            handler: function () {
                config.publishPresence = true;
                config.joinTarget = null;
                applyMultiplayerSettings(config);
                ensurePresenceSnapshot({
                    score: player.score,
                    vibe: player.vibe,
                    x: player.x,
                    y: player.y,
                    session: localSessionId + 1,
                    npcCount: config.npcCount
                });
                debugLog("Menu: starting new game (next session=" + (localSessionId + 1) + ")");
                return "start";
            }
        },
        {
            id: "join",
            label: function () {
                return "~J~oin Published Game (" + getRemoteGameCount(config) + ")";
            },
            handler: function () {
                var target = showActiveGames(config);
                if (target) {
                    if (typeof target.npcCount === "number") {
                        config.npcCount = clampNPCCount(target.npcCount);
                    }
                    config.joinTarget = target;
                    config.publishPresence = true;
                    applyMultiplayerSettings(config);
                    ensurePresenceSnapshot({
                        score: player.score,
                        vibe: player.vibe,
                        x: player.x,
                        y: player.y,
                        session: localSessionId + 1,
                        npcCount: config.npcCount
                    });
                    debugLog("Menu: joining published game (key=" + (target._key || "") + ", alias=" + (target.alias || "?") + ", coords=" + target.x + "," + target.y + ")");
                    return "start";
                }
            }
        },
        {
            id: "widescreen",
            label: function () {
                return "~W~idescreen (132 cols): " + (config.widescreen ? "On" : "Off");
            },
            handler: function () {
                config.widescreen = !config.widescreen;
            }
        },
        {
            id: "mode",
            label: function () {
                return "Game ~M~ode: " + GAME_MODES[config.gameModeIndex];
            },
            handler: function () {
                config.gameModeIndex = (config.gameModeIndex + 1) % GAME_MODES.length;
            }
        },
        {
            id: "map",
            label: function () {
                return "~A~rena: " + MAP_OPTIONS[config.mapIndex];
            },
            handler: function () {
                console.print("\r\nOnly one map available right now. More soon.\r\n");
                mswait(800);
            }
        },
        {
            id: "density",
            label: function () {
                return "Sprite ~D~ensity: " + SPRITE_DENSITY[config.spriteDensityIndex];
            },
            handler: function () {
                config.spriteDensityIndex = (config.spriteDensityIndex + 1) % SPRITE_DENSITY.length;
            }
        },
        {
            id: "npc",
            label: function () {
                return "~N~PC Count: " + config.npcCount;
            },
            handler: function () {
                var npcInput = promptInput("NPC Count", String(config.npcCount), 3);
                if (npcInput !== undefined) {
                    var num = parseInt(npcInput, 10);
                    if (!isNaN(num)) {
                        config.npcCount = clampNPCCount(num);
                    }
                }
            }
        },
        {
            id: "quit",
            label: "~Q~uit",
            handler: function () {
                return "quit";
            }
        }
    ];

    function resolveLabel(item) {
        if (typeof item.label === "function") {
            return item.label();
        }
        return item.label;
    }

    function resolveHotkey(label) {
        var idx = label.indexOf('~');
        if (idx >= 0 && idx + 1 < label.length) {
            return label.charAt(idx + 1).toLowerCase();
        }
        return null;
    }

    var selected = 0;
    var running = true;
    var action = "quit";

    while (running && !js.terminated) {
        console.clear();
        printCentered("=== D U M B F P S ===");
        console.print("\r\n");
        if (multiplayer && typeof multiplayer.update === "function") {
            multiplayer.update(0.1, config.publishPresence ? {
                score: player.score,
                vibe: player.vibe,
                x: player.x,
                y: player.y,
                session: localSessionId
            } : null);
        }
        for (var i = 0; i < menuItems.length; i++) {
            var label = resolveLabel(menuItems[i]);
            var prefix = (i === selected) ? "> " : "  ";
            console.print(prefix);
            console.mnemonics(label);
            console.print("\r\n");
        }
        console.print("\r\nUse ↑/↓ or W/S to move, Enter to select, Q to quit\r\n");
        var key = console.getkey(K_NONE);
        if (!key) {
            continue;
        }
        if (key === KEY_UP || key === 'w' || key === 'W') {
            selected = (selected - 1 + menuItems.length) % menuItems.length;
            continue;
        }
        if (key === KEY_DOWN || key === 's' || key === 'S') {
            selected = (selected + 1) % menuItems.length;
            continue;
        }
        if (key === KEY_HOME) {
            selected = 0;
            continue;
        }
        if (key === KEY_END) {
            selected = menuItems.length - 1;
            continue;
        }
        if (key === KEY_ESC || key === 'q' || key === 'Q') {
            action = "quit";
            running = false;
            break;
        }

        var handledHotkey = false;
        if (typeof key === "string" && key.length === 1) {
            var lowered = key.toLowerCase();
            for (var h = 0; h < menuItems.length; h++) {
                var label = resolveLabel(menuItems[h]);
                var hotkey = resolveHotkey(label);
                if (hotkey && hotkey === lowered) {
                    selected = h;
                    handledHotkey = true;
                    break;
                }
            }
        }

        if (handledHotkey || key === '\r' || key === '\n' || key === ' ') {
            var item = menuItems[selected];
            if (!item.handler) {
                menuError("No handler for menu option: " + item.id);
                continue;
            }
            var result = item.handler();
            if (result === "start" || result === "quit") {
                action = result;
                running = false;
            }
        }
    }

    console.clear();
    return { action: action };
}

function showGameOver(result) {
    console.clear();
    console.print("\r\n\r\n");
    printCentered("Game Over");
    console.print("\r\n\r\n");
    printCentered("Score: " + result.score + " | Vibe: " + result.vibe);
    printCentered("Shots: " + result.shots + " | Hits: " + result.hits);
    console.print("\r\n");
    printCentered("Press any key to return to menu");
    while (!console.aborted && !js.terminated) {
        var key = console.inkey(0, 500);
        if (key) {
            break;
        }
    }
}

function mainLoop() {
    showSplash();
    var running = true;
    while (running && !js.terminated) {
        var menuResult = showMenu(gameConfig);
        if (menuResult.action === "quit") {
            running = false;
            break;
        }
        if (menuResult.action === "start") {
            var result = runGame(gameConfig);
            showGameOver(result);
        }
    }
    if (multiplayer && typeof multiplayer.shutdown === "function") {
        multiplayer.shutdown();
    }
    console.clear();
    console.print("Thanks for lowering expectations.\r\n");
}

mainLoop();
