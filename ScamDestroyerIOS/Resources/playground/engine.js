// Playground engine v3 (Android v1.29 / iOS v1.0.1): Three.js world +
// Lua scripting with a Roblox-style API shim (Instance / Vector3 /
// Color3 / workspace).
//
// What v3 fixes over v2:
//   * The Wasmoon WASM path is now RELATIVE ('glue.wasm') so it
//     resolves against the page URL on both platforms — v2 hardcoded
//     https://playground.local/glue.wasm, which can never load on iOS
//     (the iOS page lives on the playground:// scheme).
//   * Boot logs mirror to BOTH native bridges (Android's
//     AndroidBridge and iOS's webkit.messageHandlers.log).
//   * Rendering is self-healing: WebGL is probed at boot and watched
//     by a frame watchdog. If the GL context is lost, stalls, or
//     never paints, the world switches to a built-in 2D canvas
//     renderer instead of sitting on a black/white void — and Lua
//     keeps working in every mode.
//
// Dual Lua runtime, in order:
//   1. Wasmoon — the standard Lua VM compiled to WebAssembly.
//   2. Fengari — the Lua VM implemented in JavaScript (fallback).
// Language core is standard Lua (5.4 / 5.3), not full Luau.

(function () {
    'use strict';

    var consoleEl = document.getElementById('console');
    var statusEl = document.getElementById('status');
    var runBtn = document.getElementById('runBtn');
    var clearBtn = document.getElementById('clearBtn');
    var codeEl = document.getElementById('code');
    var viewEl = document.getElementById('view');

    function log(text, cls) {
        var line = document.createElement('div');
        line.className = cls || 'log';
        line.textContent = String(text);
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
        try {
            if (window.AndroidBridge) window.AndroidBridge.log(String(text));
            else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.log)
                window.webkit.messageHandlers.log.postMessage(String(text));
        } catch (e) { /* native mirror is best-effort */ }
    }

    window.addEventListener('error', function (ev) {
        log('Page error: ' + (ev.message || ev.type), 'err');
    });

    log('boot: page loaded (engine v3)', 'sys');

    // ----------------------------------------------------------------
    // Part registry — renderer-independent. Lua talks to this; the
    // active renderer (WebGL or 2D) draws from it.
    // ----------------------------------------------------------------
    var parts = {};   // id -> {cls, size, pos, rot, color, opacity, neon}
    var nextId = 1;

    var orbit = { theta: 0.7, phi: 0.95, radius: 26, target: { x: 0, y: 3, z: 0 } };

    // ----------------------------------------------------------------
    // WebGL renderer (Three.js) — attempted first
    // ----------------------------------------------------------------
    var renderMode = 'none';           // 'webgl' | '2d' | 'none'
    var scene = null, camera = null, renderer = null;
    var glMeshes = {};
    var framesRendered = 0;
    var glContextLost = false;

    function makeGLMesh(cls) {
        var geo;
        if (cls === 'SpherePart') geo = new THREE.SphereGeometry(0.5, 24, 18);
        else if (cls === 'CylinderPart') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
        else geo = new THREE.BoxGeometry(1, 1, 1);
        var mat = new THREE.MeshStandardMaterial({
            color: 0xa3a1a5, roughness: 0.6, metalness: 0.05
        });
        var mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        return mesh;
    }

    function applyGLProp(id) {
        var mesh = glMeshes[id], p = parts[id];
        if (!mesh || !p) return;
        mesh.scale.set(p.size[0], p.size[1], p.size[2]);
        mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
        mesh.rotation.set(
            p.rot[0] * Math.PI / 180, p.rot[1] * Math.PI / 180, p.rot[2] * Math.PI / 180);
        mesh.material.color.setRGB(p.color[0], p.color[1], p.color[2]);
        mesh.material.transparent = p.opacity < 0.999;
        mesh.material.opacity = p.opacity;
        if (p.neon) {
            mesh.material.emissive.copy(mesh.material.color);
            mesh.material.emissiveIntensity = 0.85;
        }
    }

    function applyCameraGL() {
        camera.position.set(
            orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
            orbit.target.y + orbit.radius * Math.cos(orbit.phi),
            orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
        );
        camera.lookAt(orbit.target.x, orbit.target.y, orbit.target.z);
    }

    function initWebGL() {
        if (!window.THREE) { log('Three.js library missing', 'err'); return false; }
        try {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x0b0b0c);
            camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
            renderer = new THREE.WebGLRenderer({ antialias: true });
        } catch (e) {
            log('WebGL renderer failed: ' + (e && e.message ? e.message : e), 'err');
            return false;
        }
        renderer.domElement.addEventListener('webglcontextlost', function (ev) {
            ev.preventDefault();
            glContextLost = true;
            log('WebGL context lost — switching to 2D renderer', 'err');
            switchTo2D();
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        viewEl.appendChild(renderer.domElement);
        applyCameraGL();

        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1c20, 0.9));
        var sun = new THREE.DirectionalLight(0xffffff, 1.1);
        sun.position.set(18, 30, 12);
        scene.add(sun);
        var baseplate = new THREE.Mesh(
            new THREE.BoxGeometry(64, 1, 64),
            new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.95 })
        );
        baseplate.position.y = -0.5;
        scene.add(baseplate);
        var grid = new THREE.GridHelper(64, 64, 0x2c313a, 0x22262e);
        grid.position.y = 0.01;
        scene.add(grid);

        Object.keys(parts).forEach(function (id) {
            glMeshes[id] = makeGLMesh(parts[id].cls);
            applyGLProp(id);
        });
        renderMode = 'webgl';
        resize();
        log('boot: WebGL renderer live', 'sys');
        return true;
    }

    // ----------------------------------------------------------------
    // 2D canvas fallback renderer — simple perspective painter.
    // Boxes are drawn as shaded cuboids, spheres as circles; drag to
    // orbit works the same. Not pretty — but it always paints.
    // ----------------------------------------------------------------
    var canvas2d = null, ctx2d = null;

    function start2D() {
        if (renderer && renderer.domElement && renderer.domElement.parentNode)
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer = null;
        if (!canvas2d) {
            canvas2d = document.createElement('canvas');
            canvas2d.style.display = 'block';
            viewEl.appendChild(canvas2d);
            ctx2d = canvas2d.getContext('2d');
        }
        renderMode = '2d';
        resize();
    }

    function switchTo2D() {
        if (renderMode === '2d') return;
        start2D();
        log('boot: 2D fallback renderer active (Lua unaffected)', 'sys');
    }

    function project(p, w, h) {
        var ex = orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
        var ey = orbit.target.y + orbit.radius * Math.cos(orbit.phi);
        var ez = orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
        var fx = orbit.target.x - ex, fy = orbit.target.y - ey, fz = orbit.target.z - ez;
        var fl = Math.sqrt(fx * fx + fy * fy + fz * fz); fx /= fl; fy /= fl; fz /= fl;
        var rx = -fz, ry = 0, rz = fx;               // right = forward x up(0,1,0), simplified
        var rl = Math.sqrt(rx * rx + rz * rz) || 1; rx /= rl; rz /= rl;
        var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
        var dx = p[0] - ex, dy = p[1] - ey, dz = p[2] - ez;
        var cx = dx * rx + dy * ry + dz * rz;
        var cy = dx * ux + dy * uy + dz * uz;
        var cz = dx * fx + dy * fy + dz * fz;
        if (cz < 0.5) return null;
        var scale = (h / 2) / Math.tan(55 * Math.PI / 360) / cz;
        return { x: w / 2 + cx * scale, y: h / 2 - cy * scale, z: cz, s: scale };
    }

    function shade(color, f) {
        var r = Math.min(255, Math.round(color[0] * 255 * f));
        var g = Math.min(255, Math.round(color[1] * 255 * f));
        var b = Math.min(255, Math.round(color[2] * 255 * f));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function draw2D() {
        var w = viewEl.clientWidth, h = viewEl.clientHeight;
        if (!w || !h) return;
        if (canvas2d.width !== w || canvas2d.height !== h) { canvas2d.width = w; canvas2d.height = h; }
        ctx2d.fillStyle = '#0b0b0c';
        ctx2d.fillRect(0, 0, w, h);
        // ground plate
        var plate = [[-32, 0, -32], [32, 0, -32], [32, 0, 32], [-32, 0, 32]].map(function (c) { return project(c, w, h); });
        if (plate.every(Boolean)) {
            ctx2d.beginPath();
            plate.forEach(function (pt, i) { i ? ctx2d.lineTo(pt.x, pt.y) : ctx2d.moveTo(pt.x, pt.y); });
            ctx2d.closePath();
            ctx2d.fillStyle = '#17191d';
            ctx2d.fill();
        }
        // faces of all parts, painter-sorted far -> near
        var faces = [];
        Object.keys(parts).forEach(function (id) {
            var p = parts[id];
            if (p.cls === 'SpherePart') { faces.push({ sphere: p }); return; }
            var hx = p.size[0] / 2, hy = p.size[1] / 2, hz = p.size[2] / 2;
            var c = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
                     [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]
                .map(function (o) { return [p.pos[0] + o[0], p.pos[1] + o[1], p.pos[2] + o[2]]; });
            var F = [[0, 1, 2, 3, 0.55], [5, 4, 7, 6, 0.55], [3, 2, 6, 7, 1.0],
                     [4, 5, 1, 0, 0.4], [1, 5, 6, 2, 0.8], [4, 0, 3, 7, 0.8]];
            F.forEach(function (f) {
                var pts = [c[f[0]], c[f[1]], c[f[2]], c[f[3]]].map(function (v) { return project(v, w, h); });
                if (pts.some(function (q) { return !q; })) return;
                var depth = (pts[0].z + pts[1].z + pts[2].z + pts[3].z) / 4;
                faces.push({ pts: pts, depth: depth, color: p.color, f: f[4], opacity: p.opacity });
            });
        });
        faces.sort(function (a, b) {
            var da = a.sphere ? (project(a.sphere.pos, w, h) || { z: 1e9 }).z : a.depth;
            var db = b.sphere ? (project(b.sphere.pos, w, h) || { z: 1e9 }).z : b.depth;
            return db - da;
        });
        faces.forEach(function (f) {
            if (f.sphere) {
                var c = project(f.sphere.pos, w, h);
                if (!c) return;
                var r = Math.max(2, f.sphere.size[0] / 2 * c.s);
                ctx2d.globalAlpha = f.sphere.opacity;
                ctx2d.beginPath();
                ctx2d.arc(c.x, c.y, r, 0, Math.PI * 2);
                ctx2d.fillStyle = shade(f.sphere.color, 0.9);
                ctx2d.fill();
                ctx2d.globalAlpha = 1;
                return;
            }
            ctx2d.globalAlpha = f.opacity;
            ctx2d.beginPath();
            f.pts.forEach(function (pt, i) { i ? ctx2d.lineTo(pt.x, pt.y) : ctx2d.moveTo(pt.x, pt.y); });
            ctx2d.closePath();
            ctx2d.fillStyle = shade(f.color, f.f);
            ctx2d.fill();
            ctx2d.globalAlpha = 1;
        });
    }

    // ----------------------------------------------------------------
    // Shared view plumbing: sizing, orbit drag, frame loop, watchdog
    // ----------------------------------------------------------------
    function resize() {
        var w = viewEl.clientWidth, h = viewEl.clientHeight;
        if (w === 0 || h === 0) return;
        if (renderMode === 'webgl' && renderer) {
            renderer.setSize(w, h);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        } else if (renderMode === '2d' && canvas2d) {
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas2d.style.width = w + 'px';
            canvas2d.style.height = h + 'px';
            canvas2d.width = w * dpr; canvas2d.height = h * dpr;
            ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }
    window.addEventListener('resize', resize);

    var dragging = false, lastX = 0, lastY = 0;
    viewEl.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('pointerup', function () { dragging = false; });
    window.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        orbit.theta -= (e.clientX - lastX) * 0.008;
        orbit.phi = Math.max(0.15, Math.min(1.45, orbit.phi - (e.clientY - lastY) * 0.008));
        lastX = e.clientX; lastY = e.clientY;
        if (renderMode === 'webgl') applyCameraGL();
    });

    (function animate() {
        requestAnimationFrame(animate);
        if (renderMode === 'webgl' && renderer && scene) {
            try { renderer.render(scene, camera); framesRendered++; }
            catch (e) { /* watchdog below handles a dead renderer */ }
        } else if (renderMode === '2d') {
            draw2D();
        }
    })();

    if (!initWebGL()) {
        log('boot: WebGL unavailable — using 2D renderer', 'err');
        switchTo2D();
    } else {
        // Frame watchdog: a GL canvas that never actually paints (the
        // black-screen failure) shows up as ~0 rendered frames.
        setTimeout(function () {
            if (renderMode === 'webgl' && (glContextLost || framesRendered < 3)) {
                log('boot: WebGL watchdog — only ' + framesRendered +
                    ' frames in 3s, switching to 2D renderer', 'err');
                switchTo2D();
            } else if (renderMode === 'webgl') {
                log('boot: world rendering (drag to orbit)', 'sys');
            }
        }, 3000);
    }
    resize();

    // ----------------------------------------------------------------
    // Host primitives (shared by both Lua runtimes)
    // ----------------------------------------------------------------
    function makeMesh(className) {
        var id = nextId++;
        parts[id] = {
            cls: String(className),
            size: [1, 1, 1], pos: [0, 0, 0], rot: [0, 0, 0],
            color: [0.639, 0.635, 0.647], opacity: 1, neon: false
        };
        if (renderMode === 'webgl') {
            glMeshes[id] = makeGLMesh(parts[id].cls);
            applyGLProp(id);
        }
        return id;
    }

    function setProp(id, key, json) {
        var p = parts[id];
        if (!p) return;
        var v = JSON.parse(json);
        if (key === 'Size') p.size = [v[0], v[1], v[2]];
        else if (key === 'Position') p.pos = [v[0], v[1], v[2]];
        else if (key === 'Rotation') p.rot = [v[0], v[1], v[2]];
        else if (key === 'Color') p.color = [v[0], v[1], v[2]];
        else if (key === 'Transparency') p.opacity = 1 - v;
        else if (key === 'Material') {
            if (v === 'Neon') p.neon = true;
            else if (v === 'Glass') p.opacity = 0.35;
        }
        if (renderMode === 'webgl') applyGLProp(id);
    }

    function destroyMesh(id) {
        if (renderMode === 'webgl' && glMeshes[id]) {
            scene.remove(glMeshes[id]);
            glMeshes[id].geometry.dispose();
            glMeshes[id].material.dispose();
            delete glMeshes[id];
        }
        delete parts[id];
    }

    function clearWorld() {
        Object.keys(parts).forEach(function (id) { destroyMesh(Number(id)); });
    }

    // ----------------------------------------------------------------
    // Lua bootstrap: the Roblox-style API (runtime-agnostic)
    // ----------------------------------------------------------------
    var BOOTSTRAP = [
        'Vector3 = {}',
        'Vector3.__index = Vector3',
        'function Vector3.new(x, y, z)',
        '  return setmetatable({_t = "Vector3", X = x or 0, Y = y or 0, Z = z or 0}, Vector3)',
        'end',
        'function Vector3.__add(a, b) return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end',
        'function Vector3.__sub(a, b) return Vector3.new(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end',
        'function Vector3.__mul(a, b)',
        '  if type(b) == "number" then return Vector3.new(a.X * b, a.Y * b, a.Z * b) end',
        '  return a',
        'end',
        'function Vector3.__tostring(v) return string.format("%g, %g, %g", v.X, v.Y, v.Z) end',
        '',
        'Color3 = {}',
        'function Color3.new(r, g, b)',
        '  return {_t = "Color3", R = r or 1, G = g or 1, B = b or 1}',
        'end',
        'function Color3.fromRGB(r, g, b) return Color3.new(r / 255, g / 255, b / 255) end',
        'function Color3.fromHSV(h, s, v)',
        '  h = h % 1',
        '  local i = math.floor(h * 6)',
        '  local f = h * 6 - i',
        '  local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)',
        '  local m = i % 6',
        '  if m == 0 then return Color3.new(v, t, p)',
        '  elseif m == 1 then return Color3.new(q, v, p)',
        '  elseif m == 2 then return Color3.new(p, v, t)',
        '  elseif m == 3 then return Color3.new(p, v, t)',
        '  elseif m == 4 then return Color3.new(t, p, v)',
        '  else return Color3.new(v, p, q) end',
        'end',
        '',
        'workspace = {_t = "Workspace", Name = "Workspace"}',
        'game = {Workspace = workspace}',
        '',
        'local VISUAL = {Size = true, Position = true, Rotation = true, Color = true, Transparency = true, Material = true}',
        'local function encode(prop, value)',
        '  if prop == "Size" or prop == "Position" or prop == "Rotation" then',
        '    return string.format("[%g,%g,%g]", value.X, value.Y, value.Z)',
        '  elseif prop == "Color" then',
        '    return string.format("[%g,%g,%g]", value.R, value.G, value.B)',
        '  elseif prop == "Transparency" then',
        '    return tostring(value)',
        '  else',
        '    return string.format("%q", tostring(value))',
        '  end',
        'end',
        '',
        'local InstanceMT = {}',
        'InstanceMT.__index = function(self, key)',
        '  if key == "Destroy" then',
        '    return function(s) __hostDestroy(rawget(s, "__id")) end',
        '  end',
        '  return rawget(self, "__props")[key]',
        'end',
        'InstanceMT.__newindex = function(self, key, value)',
        '  rawget(self, "__props")[key] = value',
        '  if VISUAL[key] then __hostSet(rawget(self, "__id"), key, encode(key, value)) end',
        'end',
        'InstanceMT.__tostring = function(self)',
        '  return tostring(rawget(self, "__props").Name or rawget(self, "__class"))',
        'end',
        '',
        'Instance = {}',
        'function Instance.new(className, parent)',
        '  local id = __hostCreate(className)',
        '  local obj = {__id = id, __class = className, __props = {}}',
        '  local props = obj.__props',
        '  props.Name = className',
        '  props.ClassName = className',
        '  props.Size = Vector3.new(4, 1, 2)',
        '  props.Position = Vector3.new(0, 2, 0)',
        '  props.Rotation = Vector3.new(0, 0, 0)',
        '  props.Color = Color3.new(0.639, 0.635, 0.647)',
        '  props.Transparency = 0',
        '  props.Anchored = false',
        '  props.Material = "SmoothPlastic"',
        '  setmetatable(obj, InstanceMT)',
        '  __hostSet(id, "Size", encode("Size", props.Size))',
        '  __hostSet(id, "Position", encode("Position", props.Position))',
        '  __hostSet(id, "Color", encode("Color", props.Color))',
        '  if parent ~= nil then props.Parent = parent end',
        '  return obj',
        'end',
        '',
        'function print(...)',
        '  local parts = {}',
        '  for i = 1, select("#", ...) do parts[#parts + 1] = tostring(select(i, ...)) end',
        '  __hostLog(table.concat(parts, "  "))',
        'end',
        'function warn(...)',
        '  local parts = {}',
        '  for i = 1, select("#", ...) do parts[#parts + 1] = tostring(select(i, ...)) end',
        '  __hostLog("[warn] " .. table.concat(parts, "  "))',
        'end'
    ].join('\n');

    // ----------------------------------------------------------------
    // Runtime selection: Wasmoon (WASM) first, Fengari (JS) fallback
    // ----------------------------------------------------------------
    var runLua = null;

    function withTimeout(promise, ms, label) {
        return Promise.race([
            promise,
            new Promise(function (_, reject) {
                setTimeout(function () { reject(new Error(label + ' timed out after ' + ms + 'ms')); }, ms);
            })
        ]);
    }

    async function initWasmoon() {
        log('boot: starting Wasmoon (Lua on WebAssembly)…', 'sys');
        // RELATIVE path — resolves against the page URL on both
        // platforms (https://playground.local/… on Android,
        // playground://local/… on iOS). v2's hardcoded https:// URL
        // could never load on iOS.
        var factory = new wasmoon.LuaFactory('glue.wasm');
        var engine = await withTimeout(factory.createEngine(), 9000, 'Wasmoon init');
        engine.global.set('__hostCreate', function (className) { return makeMesh(String(className)); });
        engine.global.set('__hostSet', function (id, key, json) { setProp(Number(id), String(key), String(json)); });
        engine.global.set('__hostDestroy', function (id) { destroyMesh(Number(id)); });
        engine.global.set('__hostLog', function (text) { log(text, 'log'); });
        await engine.doString(BOOTSTRAP);
        runLua = function (code) { return engine.doString(code); };
        statusEl.textContent = 'Lua (WASM) ready';
        log('boot: Wasmoon ready', 'sys');
    }

    function initFengari() {
        log('boot: starting Fengari (Lua in JavaScript)…', 'sys');
        var f = window.fengari;
        var lua = f.lua, lauxlib = f.lauxlib, lualib = f.lualib;
        var L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        function argStr(idx) {
            var raw = lua.lua_tostring(L, idx);
            return raw === null ? '' : f.to_jsstring(raw);
        }
        function def(name, fn) {
            lua.lua_pushjsfunction(L, fn);
            lua.lua_setglobal(L, f.to_luastring(name));
        }
        def('__hostCreate', function () {
            var id = makeMesh(argStr(1));
            lua.lua_pushnumber(L, id);
            return 1;
        });
        def('__hostSet', function () {
            setProp(Number(argStr(1)), argStr(2), argStr(3));
            return 0;
        });
        def('__hostDestroy', function () {
            destroyMesh(Number(argStr(1)));
            return 0;
        });
        def('__hostLog', function () {
            log(argStr(1), 'log');
            return 0;
        });
        function exec(code) {
            var rc = lauxlib.luaL_dostring(L, f.to_luastring(code));
            if (rc !== lua.LUA_OK) {
                var raw = lua.lua_tostring(L, -1);
                var msg = raw === null ? 'unknown Lua error' : f.to_jsstring(raw);
                lua.lua_settop(L, 0);
                throw new Error(msg);
            }
            lua.lua_settop(L, 0);
        }
        exec(BOOTSTRAP);
        runLua = function (code) { exec(code); return Promise.resolve(); };
        statusEl.textContent = 'Lua (JS fallback) ready';
        log('boot: Fengari ready', 'sys');
    }

    async function initEngine() {
        try {
            await initWasmoon();
        } catch (e1) {
            log('Wasmoon failed: ' + (e1 && e1.message ? e1.message : e1), 'err');
            try {
                initFengari();
            } catch (e2) {
                statusEl.textContent = 'engine failed';
                log('Fengari also failed: ' + (e2 && e2.message ? e2.message : e2), 'err');
                return;
            }
        }
        runBtn.disabled = false;
        log('Playground ready. API: Instance.new("Part" | "SpherePart" | "CylinderPart"), Vector3, Color3, workspace, print', 'sys');
    }

    runBtn.addEventListener('click', async function () {
        if (!runLua) return;
        clearWorld();
        try {
            await runLua(codeEl.value);
        } catch (e) {
            log('Error: ' + (e && e.message ? e.message : e), 'err');
        }
    });

    clearBtn.addEventListener('click', function () {
        consoleEl.innerHTML = '';
        clearWorld();
    });

    initEngine();
})();
