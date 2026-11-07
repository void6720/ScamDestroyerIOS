// Playground engine v2 (v1.25): Three.js world + Lua scripting with
// a Roblox-style API shim (Instance / Vector3 / Color3 / workspace).
//
// Dual runtime, in order:
//   1. Wasmoon — the standard Lua VM compiled to WebAssembly.
//   2. Fengari — the Lua VM implemented in JavaScript (fallback).
// Both run the identical bootstrap + user scripts. Every boot step is
// logged to the on-page console AND mirrored to the native side via
// the AndroidBridge, so a failure names its stage instead of a blank
// screen. Language core is standard Lua (5.4 / 5.3), not full Luau.

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
        } catch (e) { /* native mirror is best-effort */ }
    }

    window.addEventListener('error', function (ev) {
        log('Page error: ' + (ev.message || ev.type), 'err');
    });

    log('boot: page loaded', 'sys');

    // ----------------------------------------------------------------
    // Three.js scene
    // ----------------------------------------------------------------
    var scene, camera, renderer;
    try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0b0b0c);
        camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        log('boot: Three.js scene created', 'sys');
    } catch (e) {
        log('Three.js failed to start: ' + (e && e.message ? e.message : e), 'err');
        statusEl.textContent = '3D failed';
        return;
    }

    var orbit = { theta: 0.7, phi: 0.95, radius: 26, target: new THREE.Vector3(0, 3, 0) };
    function applyCamera() {
        camera.position.set(
            orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
            orbit.target.y + orbit.radius * Math.cos(orbit.phi),
            orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
        );
        camera.lookAt(orbit.target);
    }
    applyCamera();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    viewEl.appendChild(renderer.domElement);

    function resize() {
        var w = viewEl.clientWidth, h = viewEl.clientHeight;
        if (w === 0 || h === 0) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

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

    var dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('pointerup', function () { dragging = false; });
    window.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        orbit.theta -= (e.clientX - lastX) * 0.008;
        orbit.phi = Math.max(0.15, Math.min(1.45, orbit.phi - (e.clientY - lastY) * 0.008));
        lastX = e.clientX; lastY = e.clientY;
        applyCamera();
    });

    (function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    })();
    log('boot: world rendering (drag to orbit)', 'sys');

    // ----------------------------------------------------------------
    // Host primitives (shared by both Lua runtimes)
    // ----------------------------------------------------------------
    var meshes = {};
    var nextId = 1;

    function makeMesh(className) {
        var geo;
        if (className === 'SpherePart') geo = new THREE.SphereGeometry(0.5, 24, 18);
        else if (className === 'CylinderPart') geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
        else geo = new THREE.BoxGeometry(1, 1, 1);
        var mat = new THREE.MeshStandardMaterial({
            color: 0xa3a1a5, roughness: 0.6, metalness: 0.05
        });
        var mesh = new THREE.Mesh(geo, mat);
        scene.add(mesh);
        var id = nextId++;
        meshes[id] = mesh;
        return id;
    }

    function setProp(id, key, json) {
        var mesh = meshes[id];
        if (!mesh) return;
        var v = JSON.parse(json);
        if (key === 'Size') mesh.scale.set(v[0], v[1], v[2]);
        else if (key === 'Position') mesh.position.set(v[0], v[1], v[2]);
        else if (key === 'Rotation') mesh.rotation.set(
            v[0] * Math.PI / 180, v[1] * Math.PI / 180, v[2] * Math.PI / 180);
        else if (key === 'Color') mesh.material.color.setRGB(v[0], v[1], v[2]);
        else if (key === 'Transparency') {
            mesh.material.transparent = v > 0.001;
            mesh.material.opacity = 1 - v;
        } else if (key === 'Material') {
            if (v === 'Neon') { mesh.material.emissive.copy(mesh.material.color); mesh.material.emissiveIntensity = 0.85; }
            else if (v === 'Metal') { mesh.material.metalness = 0.85; mesh.material.roughness = 0.3; }
            else if (v === 'Glass') { mesh.material.transparent = true; mesh.material.opacity = 0.35; }
        }
    }

    function destroyMesh(id) {
        var mesh = meshes[id];
        if (!mesh) return;
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        delete meshes[id];
    }

    function clearWorld() {
        Object.keys(meshes).forEach(function (id) { destroyMesh(Number(id)); });
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
        '  elseif m == 3 then return Color3.new(p, q, v)',
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
        var factory = new wasmoon.LuaFactory('https://playground.local/glue.wasm');
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
