/* Token Skyline — app.js
   Your AI coding tokens, built into a 3D city. 100% local.
   Two moods: dawn (warm light) and night (glowing amber city).
   Made by LYU Minglei. */

"use strict";

/* ================================ i18n ================================= */

const I18N = {
  en: {
    tagline: "Your AI coding tokens, built into a 3D city — ZCode · Claude Code · Codex CLI",
    metrics: { total: "Total", input: "Input", output: "Output", cache: "Cache read", calls: "Calls" },
    colorHeat: "🎨 Heat", colorTool: "🎨 By tool",
    rotate: "⟳ Rotate",
    themeToDawn: "Switch to dawn", themeToNight: "Switch to night",
    grand: "Grand total", today: "Today", calls: "Model calls", cacheShare: "Cache share",
    updated: "Updated",
    loading: "Building your city…",
    emptyTitle: "No token data found (yet)",
    emptyBody: "Token Skyline auto-detects local logs from ZCode, Claude Code and Codex CLI. " +
      "Chat with any of them, then refresh. You can also point it at a custom path:",
    panel: {
      breakdown: "Breakdown", models: "Models (top)", contexts: "What burned it",
      input: "Input (fresh)", cacheRead: "Cache read", cacheWrite: "Cache write",
      output: "Output", calls: "Model calls", duration: "Model time",
    },
    modal: {
      title: "Export for 3D printing", scale: "Scale", plate: "Add base plate",
      cancel: "Cancel", export: "Download STL",
      estimate: (h, w, d) => `Tallest bar ≈ ${h} · footprint ≈ ${w} × ${d} mm`,
      warn: " — consider a larger scale (fewer tokens per mm) or print month by month.",
    },
    noData: "—",
  },
  zh: {
    tagline: "把你的 AI 编程 token 消耗,盖成一座 3D 城市 — ZCode · Claude Code · Codex CLI",
    metrics: { total: "总消耗", input: "输入", output: "输出", cache: "缓存读", calls: "请求次数" },
    colorHeat: "🎨 热力", colorTool: "🎨 按工具",
    rotate: "⟳ 旋转",
    themeToDawn: "切到黎明模式", themeToNight: "切到夜城模式",
    grand: "累计消耗", today: "今日", calls: "模型调用", cacheShare: "缓存占比",
    updated: "更新于",
    loading: "正在建造你的城市…",
    emptyTitle: "还没有找到 token 数据",
    emptyBody: "Token Skyline 会自动探测 ZCode、Claude Code、Codex CLI 的本地日志。" +
      "先用任意一个工具对话,然后刷新本页。也可以用命令行参数指向自定义路径:",
    panel: {
      breakdown: "构成", models: "模型 Top", contexts: "烧在哪",
      input: "输入(非缓存)", cacheRead: "缓存读", cacheWrite: "缓存写",
      output: "输出", calls: "模型调用", duration: "模型耗时",
    },
    modal: {
      title: "导出 3D 打印文件", scale: "比例尺", plate: "加底板",
      cancel: "取消", export: "下载 STL",
      estimate: (h, w, d) => `最高柱 ≈ ${h} · 底盘 ≈ ${w} × ${d} mm`,
      warn: " —— 建议换更大比例尺(每 mm 对应更多 token),或按月分块打印。",
    },
    noData: "—",
  },
};

const TOOL_COLORS = { zcode: 0x34d399, claude: 0xfb923c, codex: 0x60a5fa };
const TOOL_LABELS = { zcode: "ZCode", claude: "Claude Code", codex: "Codex CLI" };

/* =============================== themes ================================ */

const THEMES = {
  night: {
    skyTop: 0x050914, skyBottom: 0x1c2850, skyGlow: 0xe08a10, glowK: 0.62,
    fog: 0x0d1428, fogDensity: 0.0072,
    ground: 0x151f38, gridMain: 0x2a3860, gridSub: 0x1b2544,
    glowDisc: "rgba(245,158,11,0.22)",
    empty: 0x1e2946,
    stars: 0.85,
    hemiSky: 0x4a5c85, hemiGround: 0x0a0e1a, hemiInt: 1.0,
    sunColor: 0xffd9a0, sunInt: 1.0, rimColor: 0x5f7cff, rimInt: 0.55,
    shadows: false,
    bloom: { strength: 0.85, radius: 0.5, threshold: 0.45 },
    heat: [[0.0, 0x2c3a5c], [0.35, 0x8a4410], [0.7, 0xe08a10], [1.0, 0xffd166]],
    barEmissive: 0.34,
    label: "#8fa2c4",
  },
  dawn: {
    skyTop: 0x9fc0dd, skyBottom: 0xe8cf9f, skyGlow: 0xffd9a8, glowK: 0.32,
    fog: 0xd5c2a0, fogDensity: 0.0028,
    ground: 0xdfcda6, gridMain: 0xc7b896, gridSub: 0xdccfae,
    glowDisc: "rgba(90,66,32,0.18)",
    empty: 0xc3b391,
    stars: 0,
    hemiSky: 0xffffff, hemiGround: 0xcabb97, hemiInt: 0.9,
    sunColor: 0xfff2d8, sunInt: 1.1, rimColor: 0xffffff, rimInt: 0.22,
    shadows: true,
    bloom: null,
    heat: [[0.0, 0x6f2e0c], [0.35, 0xb45309], [0.7, 0xd9820b], [1.0, 0xf2b33d]],
    barEmissive: 0.06,
    label: "#8a795c",
  },
};

/* ================================ state ================================ */

const state = {
  lang: null, theme: null, data: null, metric: "total", colorMode: "heat",
  enabled: new Set(), knownTools: null, selected: null, hoverMesh: null,
  lastRaw: "", barMeshes: [], builtAt: 0,
};

function t(key) {
  const d = I18N[state.lang];
  return key.split(".").reduce((o, k) => (o ? o[k] : undefined), d);
}
function T() { return THEMES[state.theme]; }

/* ============================ number formats =========================== */

function fmtTokens(n, lang) {
  if (n == null) return "—";
  if (lang === "zh") {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + " 万";
    return String(Math.round(n));
  }
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function fmtInt(n) { return (n == null ? "—" : Math.round(n).toLocaleString("en-US")); }
function fmtDur(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + (s % 60) + "s";
  return Math.floor(m / 60) + "h " + (m % 60) + "m";
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hexToCss(h) { return "#" + h.toString(16).padStart(6, "0"); }
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);

/* ============================== three scene ============================ */

let renderer, scene, camera, controls, raycaster, clock, composer, bloomPass;
let cityGroup, labelGroup, skyMat, stars, starsMat;
let groundMesh, glowDisc, gridHelper, hemiLight, sunLight, rimLight;
const MAX_H = 8.2, PITCH = 1.42, BAR_W = 0.92;
const groundGroup = { grid: null };

function initScene() {
  const stage = document.getElementById("stage");
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(T().fog, T().fogDensity);

  camera = new THREE.PerspectiveCamera(46, stage.clientWidth / stage.clientHeight, 0.1, 800);
  camera.position.set(8, 11, 15);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 3;
  controls.maxDistance = 120;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  hemiLight = new THREE.HemisphereLight(T().hemiSky, T().hemiGround, T().hemiInt);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(T().sunColor, T().sunInt);
  sunLight.position.set(14, 22, 8);
  sunLight.shadow.mapSize.set(2048, 2048);
  const sc = sunLight.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.far = 80;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);
  rimLight = new THREE.DirectionalLight(T().rimColor, T().rimInt);
  rimLight.position.set(-16, 12, -14);
  scene.add(rimLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.14));

  // sky dome with vertical gradient + horizon glow band
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(T().skyTop) },
      bottom: { value: new THREE.Color(T().skyBottom) },
      glow: { value: new THREE.Color(T().skyGlow) },
      glowK: { value: T().glowK },
    },
    vertexShader: "varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: [
      "varying vec3 vP;",
      "uniform vec3 top; uniform vec3 bottom; uniform vec3 glow; uniform float glowK;",
      "void main(){",
      "  float h = normalize(vP).y;",
      "  vec3 c = mix(bottom, top, smoothstep(-0.06, 0.55, h));",
      "  c += glow * pow(max(0.0, 1.0 - abs(h + 0.03) * 2.6), 2.2) * glowK;",
      "  gl_FragColor = vec4(c, 1.0);",
      "}",
    ].join("\n"),
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMat));

  // stars (night only)
  {
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.18 + Math.random() * 0.8;
      const r = Math.sqrt(1 - y * y) * 380;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y * 380;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    starsMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false,
      transparent: true, opacity: T().stars, fog: false, depthWrite: false,
    });
    stars = new THREE.Points(g, starsMat);
    scene.add(stars);
  }

  cityGroup = new THREE.Group();
  labelGroup = new THREE.Group();
  scene.add(cityGroup, labelGroup);

  buildGround();

  // bloom post-processing (night)
  composer = new THREE.EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(stage.clientWidth, stage.clientHeight);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(stage.clientWidth, stage.clientHeight),
    T().bloom ? T().bloom.strength : 0,
    T().bloom ? T().bloom.radius : 0.5,
    T().bloom ? T().bloom.threshold : 1.0);
  bloomPass.enabled = !!T().bloom;
  composer.addPass(bloomPass);

  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  window.addEventListener("resize", () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  bindPointer();
  animate();
}

function buildGround() {
  if (groundMesh) { scene.remove(groundMesh); groundMesh.material.dispose(); }
  if (glowDisc) { scene.remove(glowDisc); glowDisc.material.dispose(); }
  if (groundGroup.grid) { scene.remove(groundGroup.grid); }

  groundMesh = new THREE.Mesh(
    new THREE.BoxGeometry(90, 0.2, 60),
    new THREE.MeshStandardMaterial({ color: T().ground, roughness: 0.95, metalness: 0.05 }));
  groundMesh.position.y = -0.1;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // soft radial glow / AO disc under the city
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, T().glowDisc);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  glowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 18),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
      blending: state.theme === "night" ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
  glowDisc.rotation.x = -Math.PI / 2;
  glowDisc.position.y = 0.012;
  scene.add(glowDisc);

  groundGroup.grid = new THREE.GridHelper(60, 42, T().gridMain, T().gridSub);
  groundGroup.grid.position.y = 0.006;
  groundGroup.grid.material.transparent = true;
  groundGroup.grid.material.opacity = 0.55;
  scene.add(groundGroup.grid);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now() / 1000;
  controls.update();

  const pulse = state.selected == null ? 0.5 + 0.5 * Math.sin(now * 2.6) : 0;
  for (let i = 0; i < state.barMeshes.length; i++) {
    const m = state.barMeshes[i];
    const ud = m.userData;
    // grow-in
    const gt = Math.max(0, Math.min(1, (now - state.builtAt - ud.delay) / 0.7));
    const grow = easeOutCubic(gt);
    // hover / selection lift + glow
    const isHot = m === state.hoverMesh || m === state.selected;
    ud.lift += ((isHot ? 1 : 0) - ud.lift) * Math.min(1, dt * 10);
    let h = ud.h * grow * (1 + 0.055 * ud.lift);
    if (ud.isToday && state.selected == null) h *= 1 + 0.02 * pulse;
    m.scale.y = Math.max(h, 0.02);
    const emK = Math.min(1, ud.h * 18); // empty lots stay matte
    m.material.emissiveIntensity =
      (T().barEmissive * 0.25 + ud.lift * 0.38 + (ud.isToday ? pulse * 0.22 : 0)) * emK;
  }

  if (bloomPass && bloomPass.enabled) composer.render();
  else composer.render();
}

/* text label sprite, theme-colored */
function makeLabel(text, worldH) {
  const fs = 46, pad = 10;
  const c = document.createElement("canvas");
  let ctx = c.getContext("2d");
  ctx.font = `600 ${fs}px -apple-system,'Segoe UI','PingFang SC',sans-serif`;
  c.width = Math.ceil(ctx.measureText(text).width) + pad * 2;
  c.height = fs + pad * 2;
  ctx = c.getContext("2d");
  ctx.font = `600 ${fs}px -apple-system,'Segoe UI','PingFang SC',sans-serif`;
  ctx.fillStyle = T().label;
  ctx.textBaseline = "middle";
  ctx.fillText(text, pad, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set((c.width / c.height) * worldH, worldH, 1);
  return sp;
}

/* =============================== data ================================== */

const METRIC_KEYS = {
  total: d => d.total,
  input: d => d.input,
  output: d => d.output,
  cache: d => d.cache_read,
  calls: d => d.requests,
};

/* aggregate a day over the enabled tools */
function aggDay(day) {
  const out = {
    requests: 0, input: 0, cache_read: 0, cache_write: 0, output: 0,
    total: 0, duration_ms: 0, models: new Map(), contexts: [], tools: {},
  };
  for (const [tool, d] of Object.entries(day.tools || {})) {
    if (!state.enabled.has(tool)) continue;
    out.requests += d.requests;
    out.input += d.input;
    out.cache_read += d.cache_read;
    out.cache_write += d.cache_write;
    out.output += d.output;
    out.total += d.total;
    out.duration_ms += d.duration_ms || 0;
    out.tools[tool] = d.total;
    for (const m of d.models || []) {
      const r = out.models.get(m.name) || { requests: 0, total: 0 };
      r.requests += m.requests; r.total += m.total;
      out.models.set(m.name, r);
    }
    for (const c of d.contexts || []) out.contexts.push({ ...c, tool });
  }
  out.models = [...out.models.entries()]
    .map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 8);
  out.contexts.sort((a, b) => b.tokens - a.tokens);
  out.contexts = out.contexts.slice(0, 8);
  return out;
}

async function fetchData(first) {
  const res = await fetch("/api/data");
  const data = await res.json();
  const sig = JSON.stringify([data.sources, data.days]);
  const changed = first || sig !== state.lastRaw;
  state.lastRaw = sig;
  state.data = data;
  const okTools = data.sources.filter(s => s.status === "ok").map(s => s.tool);
  if (!state.knownTools) {
    state.knownTools = new Set(okTools);
    state.enabled = new Set(okTools);
  }
  for (const tool of okTools) {
    if (!state.knownTools.has(tool)) {
      state.knownTools.add(tool);
      state.enabled.add(tool);
    }
  }
  renderSources();
  renderStats();
  if (changed) buildCity(); // don't wreck an open panel when nothing changed
  document.getElementById("loading").style.display = "none";
  const anyData = data.days.length > 0;
  document.getElementById("emptyState").hidden = anyData;
  if (!anyData) {
    const paths = data.sources.map(s =>
      `${s.status === "ok" ? "[x]" : "[ ]"} ${TOOL_LABELS[s.tool]}: ${s.path}`).join("\n");
    document.getElementById("emptyPaths").textContent = paths;
  }
  scheduleRefresh();
}

function scheduleRefresh() {
  clearTimeout(scheduleRefresh._id);
  scheduleRefresh._id = setTimeout(() => fetchData(false), 30000);
}

/* =============================== build ================================= */

const heatStops = [];
function setHeatStops() {
  heatStops.length = 0;
  for (const [x, hex] of T().heat) heatStops.push([x, new THREE.Color(hex)]);
}
function heatColor(x) {
  x = Math.max(0, Math.min(1, x));
  for (let i = 1; i < heatStops.length; i++) {
    if (x <= heatStops[i][0]) {
      const [x0, c0] = heatStops[i - 1], [x1, c1] = heatStops[i];
      return c0.clone().lerp(c1, (x - x0) / (x1 - x0 || 1));
    }
  }
  return heatStops[heatStops.length - 1][1].clone();
}

function buildCity() {
  for (const m of state.barMeshes) {
    cityGroup.remove(m);
    m.material.dispose();
  }
  state.barMeshes = [];
  cityGroup.clear();
  labelGroup.clear();
  closePanel();
  if (!state.data || !state.data.days.length) return;

  setHeatStops();
  const days = state.data.days;
  const byDate = new Map(days.map(d => [d.date, d]));
  const todayStr = new Date().toLocaleDateString("sv-SE");
  const first = new Date(days[0].date + "T00:00:00");
  const pad = first.getDay(); // 0 = Sunday, GitHub style
  const cells = pad + days.length;
  const weeks = Math.ceil(cells / 7);
  const maxV = Math.max(...days.map(d => {
    const a = aggDay(d); const v = METRIC_KEYS[state.metric](a);
    return v || 0;
  }), 1);

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  state.builtAt = performance.now() / 1000;

  const x0 = -((weeks - 1) / 2) * PITCH;
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const cellIdx = pad + i;
    const week = Math.floor(cellIdx / 7);
    const dow = cellIdx % 7;
    const a = aggDay(day);
    const v = METRIC_KEYS[state.metric](a) || 0;
    const h = Math.max(v > 0 ? 0.2 : 0.035, (v / maxV) * MAX_H);

    let color;
    if (v <= 0) {
      color = new THREE.Color(T().empty); // empty lot: quiet tile, not a colored stub
    } else if (state.colorMode === "tool") {
      const entries = Object.entries(a.tools);
      if (!entries.length) color = new THREE.Color(T().heat[0][1]);
      else {
        const [domTool] = entries.sort((x, y) => y[1] - x[1])[0];
        color = new THREE.Color(TOOL_COLORS[domTool] || 0x8fa1b8);
        const lum = state.theme === "night" ? (0.5 + 0.5 * (v / maxV)) : (0.62 + 0.38 * (v / maxV));
        color.multiplyScalar(lum);
      }
    } else {
      color = heatColor(v / maxV);
    }

    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.5, metalness: 0.18,
      emissive: color.clone(), emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = v > 0;
    mesh.scale.set(BAR_W, 0.02, BAR_W);
    mesh.position.set(x0 + week * PITCH, 0, (dow - 3) * PITCH);
    mesh.userData = {
      day, agg: a, date: day.date, h: v > 0 ? h : 0.035,
      delay: i * 0.016, lift: 0,
      isToday: day.date === todayStr && v > 0,
    };
    cityGroup.add(mesh);
    state.barMeshes.push(mesh);
  }

  // month + weekday labels
  let lastMonth = null;
  for (let i = 0; i < days.length; i++) {
    const d = new Date(days[i].date + "T00:00:00");
    const mkey = d.getFullYear() + "-" + d.getMonth();
    if (mkey !== lastMonth && d.getDate() <= 10) {
      lastMonth = mkey;
      const cellIdx = pad + i;
      const week = Math.floor(cellIdx / 7);
      const lblText = state.lang === "zh"
        ? (d.getMonth() + 1) + "月"
        : d.toLocaleString("en-US", { month: "short" });
      const sp = makeLabel(lblText, 0.62);
      sp.position.set(x0 + week * PITCH, 0.35, -3 * PITCH - 2.3);
      labelGroup.add(sp);
    }
  }
  const wdEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const wdZh = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  for (const dow of [1, 3, 5]) {
    const sp = makeLabel(state.lang === "zh" ? wdZh[dow] : wdEn[dow], 0.5);
    sp.position.set(x0 - 2.1, 0.3, (dow - 3) * PITCH);
    labelGroup.add(sp);
  }

  // fit camera the first time
  if (buildCity._first !== false) {
    buildCity._first = false;
    const dist = Math.max(weeks * PITCH * 1.85, 16);
    camera.position.set(dist * 0.5, dist * 0.62, dist * 0.86);
    controls.target.set(0, 2.0, 0);
  }
}

/* ============================ interaction ============================== */

function bindPointer() {
  const el = renderer.domElement;
  const tooltip = document.getElementById("tooltip");
  const ndc = new THREE.Vector2();
  let downXY = null;

  el.addEventListener("pointermove", e => {
    const r = el.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(state.barMeshes, false);
    el.style.cursor = hits.length ? "pointer" : "default";
    state.hoverMesh = hits.length ? hits[0].object : null;
    if (hits.length) showTooltip(hits[0].object, e.clientX, e.clientY);
    else tooltip.hidden = true;
  });

  el.addEventListener("pointerdown", e => { downXY = [e.clientX, e.clientY]; });
  el.addEventListener("pointerup", e => {
    if (!downXY) return;
    const dx = e.clientX - downXY[0], dy = e.clientY - downXY[1];
    downXY = null;
    if (dx * dx + dy * dy > 25) return; // was a drag
    const r = el.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(state.barMeshes, false);
    if (hits.length) selectBar(hits[0].object);
    else closePanel();
  });
  el.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    state.hoverMesh = null;
  });
}

function showTooltip(mesh, cx, cy) {
  const { agg, date } = mesh.userData;
  const tt = document.getElementById("tooltip");
  const L = I18N[state.lang];
  const metricName = L.metrics[state.metric];
  const v = METRIC_KEYS[state.metric](agg);
  const dur = fmtDur(agg.duration_ms);
  const tools = Object.keys(agg.tools)
    .map(x => `<span class="tt-chip" style="color:${hexToCss(TOOL_COLORS[x] || 0x8fa1b8)}">${esc(TOOL_LABELS[x] || x)}</span>`).join("");
  tt.innerHTML =
    `<div class="tt-date">${esc(date)}</div>` +
    `<div class="tt-big" style="color:var(--accent)">${esc(fmtTokens(v, state.lang))}<span class="u">${esc(metricName)}</span></div>` +
    `<div class="tt-row"><span>${esc(L.panel.calls)}</span><b>${fmtInt(agg.requests)}</b></div>` +
    `<div class="tt-row"><span>${esc(L.panel.output)}</span><b>${esc(fmtTokens(agg.output, state.lang))}</b></div>` +
    `<div class="tt-row"><span>${esc(L.panel.cacheRead)}</span><b>${esc(fmtTokens(agg.cache_read, state.lang))}</b></div>` +
    (dur ? `<div class="tt-row"><span>${esc(L.panel.duration)}</span><b>${esc(dur)}</b></div>` : "") +
    (tools ? `<div class="tt-chips">${tools}</div>` : "");
  tt.hidden = false;
  const pad = 14;
  let x = cx + pad, y = cy + pad;
  const rect = tt.getBoundingClientRect();
  if (x + rect.width > window.innerWidth - 8) x = cx - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = cy - rect.height - pad;
  tt.style.left = x + "px";
  tt.style.top = y + "px";
}

function selectBar(mesh) {
  if (state.selected === mesh) { closePanel(); return; }
  state.selected = mesh;
  controls.autoRotate = false;
  document.getElementById("rotateBtn").classList.remove("on");
  renderPanel(mesh.userData);
}

function closePanel() {
  state.selected = null;
  document.getElementById("panel").hidden = true;
}

function renderPanel({ agg, date }) {
  const L = I18N[state.lang];
  const P = L.panel;
  const d = new Date(date + "T00:00:00");
  const wd = state.lang === "zh"
    ? "周" + "日一二三四五六"[d.getDay()]
    : d.toLocaleString("en-US", { weekday: "long" });
  const rows = [
    [P.input, agg.input], [P.cacheRead, agg.cache_read],
    [P.cacheWrite, agg.cache_write], [P.output, agg.output],
  ];
  const maxRow = Math.max(...rows.map(r => r[1]), 1);
  const dur = fmtDur(agg.duration_ms);

  const html = [];
  html.push(`<h2>${esc(date)}</h2><div class="sub">${esc(wd)}</div>`);
  html.push(`<div class="total-line"><b>${esc(fmtTokens(agg.total, state.lang))}</b><span>${esc(L.metrics.total)}</span></div>`);
  html.push(`<h3>${esc(P.breakdown)}</h3>`);
  for (const [label, v] of rows) {
    html.push(
      `<div class="prow"><div class="pl"><span>${esc(label)}</span><b>${esc(fmtTokens(v, state.lang))}</b></div>` +
      `<div class="track"><div class="fill" style="width:${(v / maxRow) * 100}%"></div></div></div>`);
  }
  html.push(`<div class="prow"><div class="pl"><span>${esc(P.calls)}</span><b>${fmtInt(agg.requests)}</b></div></div>`);
  if (dur) html.push(`<div class="prow"><div class="pl"><span>${esc(P.duration)}</span><b>${esc(dur)}</b></div></div>`);

  if (agg.models.length) {
    html.push(`<h3>${esc(P.models)}</h3>`);
    for (const m of agg.models) {
      html.push(`<div class="item"><span class="il" title="${esc(m.name)}">${esc(m.name)}</span>` +
        `<span class="iv">${esc(fmtTokens(m.total, state.lang))} · ${m.requests}</span></div>`);
    }
  }
  if (agg.contexts.length) {
    html.push(`<h3>${esc(P.contexts)}</h3>`);
    for (const c of agg.contexts) {
      const dot = TOOL_COLORS[c.tool] ? hexToCss(TOOL_COLORS[c.tool]) : "#8fa1b8";
      html.push(`<div class="item"><span class="it" style="color:${dot};border-color:${dot}44">●</span>` +
        `<span class="il" title="${esc(c.label)}">${esc(c.label)}</span>` +
        `<span class="iv">${esc(fmtTokens(c.tokens, state.lang))}</span></div>`);
    }
  }
  document.getElementById("panelBody").innerHTML = html.join("");
  document.getElementById("panel").hidden = false;
}

/* ============================== chrome UI ============================== */

function renderSources() {
  const box = document.getElementById("sourceChips");
  box.innerHTML = "";
  for (const s of state.data.sources) {
    const chip = document.createElement("span");
    chip.className = "chip";
    if (s.status !== "ok") {
      chip.classList.add("missing");
      chip.title = s.path;
      chip.innerHTML = `<span class="dot" style="background:#6b7690;color:#6b7690"></span>${esc(TOOL_LABELS[s.tool])}`;
    } else {
      chip.title = s.path;
      if (!state.enabled.has(s.tool)) chip.classList.add("off");
      const on = state.enabled.has(s.tool);
      const cc = hexToCss(TOOL_COLORS[s.tool] || 0x8fa1b8);
      chip.innerHTML =
        `<span class="dot" style="background:${cc};color:${cc}"></span>` +
        `${esc(TOOL_LABELS[s.tool])} <span class="n">${on ? esc(fmtTokens(s.total_tokens, state.lang)) : ""}</span>`;
      chip.addEventListener("click", () => {
        if (state.enabled.has(s.tool)) state.enabled.delete(s.tool);
        else state.enabled.add(s.tool);
        if (state.enabled.size === 0) state.enabled.add(s.tool); // never blank out
        renderSources(); renderStats(); buildCity();
      });
    }
    box.appendChild(chip);
  }
}

function renderStats() {
  const days = state.data.days;
  let g = { requests: 0, input: 0, cache_read: 0, cache_write: 0, output: 0, total: 0 };
  for (const d of days) {
    const a = aggDay(d);
    g.requests += a.requests; g.input += a.input; g.cache_read += a.cache_read;
    g.cache_write += a.cache_write; g.output += a.output; g.total += a.total;
  }
  document.getElementById("grandTotal").textContent = fmtTokens(g.total, state.lang);
  const todayStr = new Date().toLocaleDateString("sv-SE"); // local YYYY-MM-DD
  const todayDay = days.find(d => d.date === todayStr);
  document.getElementById("todayTotal").textContent =
    todayDay ? fmtTokens(aggDay(todayDay).total, state.lang) : I18N[state.lang].noData;
  document.getElementById("grandReq").textContent = fmtInt(g.requests);
  document.getElementById("cacheShare").textContent =
    g.total > 0 ? Math.round((g.cache_read / g.total) * 100) + "%" : "—";
  document.getElementById("updatedAt").textContent =
    I18N[state.lang].updated + " " + new Date(state.data.generated_at).toLocaleTimeString();
}

function renderMetricButtons() {
  const box = document.getElementById("metricButtons");
  box.innerHTML = "";
  for (const key of ["total", "input", "output", "cache", "calls"]) {
    const b = document.createElement("button");
    b.textContent = t("metrics." + key);
    b.classList.toggle("on", state.metric === key);
    b.addEventListener("click", () => {
      state.metric = key;
      renderMetricButtons();
      buildCity();
      if (state.selected) renderPanel(state.selected.userData);
    });
    box.appendChild(b);
  }
}

/* ================================ i18n ================================= */

function applyLang() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  localStorage.setItem("ts-lang", state.lang);
  document.getElementById("tagline").textContent = t("tagline");
  document.getElementById("colorModeBtn").textContent =
    state.colorMode === "heat" ? t("colorHeat") : t("colorTool");
  document.getElementById("rotateBtn").textContent = t("rotate");
  document.getElementById("themeBtn").title =
    state.theme === "night" ? t("themeToDawn") : t("themeToNight");
  document.getElementById("lblGrand").textContent = t("grand");
  document.getElementById("lblToday").textContent = t("today");
  document.getElementById("lblCalls").textContent = t("calls");
  document.getElementById("lblCache").textContent = t("cacheShare");
  document.getElementById("loadingText").textContent = t("loading");
  document.getElementById("emptyTitle").textContent = t("emptyTitle");
  document.getElementById("emptyBody").textContent = t("emptyBody");
  document.getElementById("mTitle").textContent = t("modal.title");
  document.getElementById("mScaleLabel").textContent = t("modal.scale");
  document.getElementById("mPlateLabel").textContent = t("modal.plate");
  document.getElementById("mCancel").textContent = t("modal.cancel");
  document.getElementById("mExport").textContent = t("modal.export");
  document.getElementById("footCopy").textContent =
    "© 2026 · " + (state.lang === "zh" ? "所有数据只在本机,不上传任何服务器" : "All data stays on your machine");
  renderMetricButtons();
  if (state.data) { renderSources(); renderStats(); buildCity(); }
}

/* ================================ theme ================================ */

function applyTheme(name) {
  state.theme = name;
  localStorage.setItem("ts-theme", name);
  document.documentElement.setAttribute("data-theme", name);
  document.getElementById("themeBtn").textContent = name === "night" ? "☀️" : "🌙";
  document.getElementById("themeBtn").title =
    name === "night" ? t("themeToDawn") : t("themeToNight");

  const th = T();
  skyMat.uniforms.top.value.setHex(th.skyTop);
  skyMat.uniforms.bottom.value.setHex(th.skyBottom);
  skyMat.uniforms.glow.value.setHex(th.skyGlow);
  skyMat.uniforms.glowK.value = th.glowK;
  scene.fog.color.setHex(th.fog);
  scene.fog.density = th.fogDensity;
  starsMat.opacity = th.stars;
  hemiLight.color.setHex(th.hemiSky);
  hemiLight.groundColor.setHex(th.hemiGround);
  hemiLight.intensity = th.hemiInt;
  sunLight.color.setHex(th.sunColor);
  sunLight.intensity = th.sunInt;
  sunLight.castShadow = th.shadows;
  rimLight.color.setHex(th.rimColor);
  rimLight.intensity = th.rimInt;
  bloomPass.enabled = !!th.bloom;
  if (th.bloom) {
    bloomPass.strength = th.bloom.strength;
    bloomPass.radius = th.bloom.radius;
    bloomPass.threshold = th.bloom.threshold;
  }
  buildGround();
  if (state.data) buildCity(); // bars regrow in the new palette
}

/* ============================== STL export ============================= */

function openModal() {
  if (!state.barMeshes.length) return;
  document.getElementById("modal").hidden = false;
  updateEstimate();
}
function closeModal() { document.getElementById("modal").hidden = true; }

function currentMmPerWorld() {
  const days = state.data.days;
  const maxV = Math.max(...days.map(d => METRIC_KEYS[state.metric](aggDay(d)) || 0), 1);
  const tokensPerMm = parseFloat(document.getElementById("mScale").value);
  return (maxV / MAX_H) / tokensPerMm;
}

function updateEstimate() {
  const s = currentMmPerWorld();
  const weeks = Math.ceil((state.data.days.length + new Date(state.data.days[0].date + "T00:00:00").getDay()) / 7);
  const hMm = MAX_H * s, wMm = weeks * PITCH * s, dMm = 7 * PITCH * s;
  const f = I18N[state.lang].modal.estimate;
  const fmt = x => x >= 1000 ? (x / 10).toFixed(1) + " cm" : x.toFixed(1) + " mm";
  const est = document.getElementById("mEstimate");
  const tooBig = Math.max(wMm, dMm) > 220;
  est.textContent = f(fmt(hMm), fmt(wMm), fmt(dMm)) + (tooBig ? I18N[state.lang].modal.warn : "");
  est.classList.toggle("warn", tooBig);
}

function exportSTL() {
  const s = currentMmPerWorld();
  const withPlate = document.getElementById("mPlate").checked;
  const group = new THREE.Group();

  for (const m of state.barMeshes) {
    const h = m.userData.h * s;
    if (h <= 0.02) continue; // skip zero bars
    const w = BAR_W * s;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial());
    box.position.set(m.position.x * s, h / 2, m.position.z * s);
    group.add(box);
  }
  if (withPlate && group.children.length) {
    const box3 = new THREE.Box3().setFromObject(group);
    const size = box3.getSize(new THREE.Vector3());
    const pw = size.x + 6, pd = size.z + 6, ph = 3;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pd), new THREE.MeshStandardMaterial());
    plate.position.set((box3.min.x + box3.max.x) / 2, ph / 2, (box3.min.z + box3.max.z) / 2);
    group.add(plate);
    for (const c of group.children) if (c !== plate) c.position.y += ph;
  }
  // Y-up (three.js) -> Z-up (slicer convention); right-handed throughout, no mirroring
  group.rotation.x = Math.PI / 2;
  group.updateMatrixWorld(true);

  const exporter = new THREE.STLExporter();
  const result = exporter.parse(group, { binary: true });
  const blob = new Blob([result], { type: "model/stl" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `token-skyline-${state.metric}-${state.data.days[0].date}_to_${state.data.days[state.data.days.length - 1].date}.stl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  closeModal();
}

/* ================================ boot ================================= */

function boot() {
  state.lang = localStorage.getItem("ts-lang") ||
    ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
  state.theme = localStorage.getItem("ts-theme") || "dawn";
  document.documentElement.setAttribute("data-theme", state.theme);
  initScene();
  applyLang();
  applyTheme(state.theme); // sync button label + 3D palette with stored theme

  document.getElementById("themeBtn").addEventListener("click", () => {
    applyTheme(state.theme === "night" ? "dawn" : "night");
  });
  document.getElementById("colorModeBtn").addEventListener("click", () => {
    state.colorMode = state.colorMode === "heat" ? "tool" : "heat";
    applyLang(); // re-renders button label + city colors
  });
  document.getElementById("rotateBtn").addEventListener("click", e => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.classList.toggle("on", controls.autoRotate);
  });
  document.getElementById("langBtn").addEventListener("click", () => {
    state.lang = state.lang === "zh" ? "en" : "zh";
    applyLang();
  });
  document.getElementById("stlBtn").addEventListener("click", openModal);
  document.getElementById("mCancel").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", e => {
    if (e.target.id === "modal") closeModal();
  });
  document.getElementById("mScale").addEventListener("change", updateEstimate);
  document.getElementById("mPlate").addEventListener("change", updateEstimate);
  document.getElementById("mExport").addEventListener("click", exportSTL);
  document.getElementById("panelClose").addEventListener("click", closePanel);

  fetchData(true);
  window.__tsDebug = {
    get bloom() { return bloomPass && bloomPass.enabled; },
    get bars() { return state.barMeshes.length; },
    get theme() { return state.theme; },
  };
}

boot();
