// Variable necesarias
let coverageRadius = 1000;          // metros
let coverage = {};                  // círculos por sitio
let coverageEnabled = true;         // toggle

// ======= Estado persistente =======
const KEY = 'gpon-planner-state-v1';
let state = JSON.parse(localStorage.getItem(KEY) || '{}');
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

/* ====== Sedes: fotos y componentes ====== */

/* Mapa de nombres "bonitos" (mismo orden que usas en el mapa/topología) */
const SITE_LABELS = {
  novena: 'USTA – Novena',
  florida: 'USTA – Florida',
  limonal: 'USTA – Limonal',
  piedecuesta: 'USTA – Piedecuesta',
};


state.siteComponents = state.siteComponents || {
  /* Plantillas por sede (ajústalas si quieres) */
  novena: [
    { nombre: "Nodo central de fibra óptica", valor: "8 puertos GPON", marca: "TP-Link" },
    { nombre: "Splitter 1x16", valor: "Divisor óptico PLC", marca: "Huawei" },
    { nombre: "Cable FO", valor: "Monomodo G.652D", marca: "Huawei" },
  ],
  florida: [
    { nombre: "Splitter 1x8", valor: "Divisor óptico PLC", marca: "Huawei" },
    { nombre: "Patch panel", valor: "SC/APC 16 puertos", marca: "Genérico" },
  ],
  limonal: [
    { nombre: "ONT", valor: "1GE + WiFi", marca: "Ubiquiti/Huawei" },
    { nombre: "ODF", valor: "24F", marca: "FOCC" },
  ],
  piedecuesta: [
    { nombre: "Cierre de empalme", valor: "48F IP68", marca: "Genérico" },
    { nombre: "Patchcord SC/APC", valor: "2 m", marca: "Genérico" },
  ],
};
save();

/* DOM refs */
const siteSelect = document.getElementById('siteSelect');
const photosGrid = document.getElementById('photosGrid');
const siteCompTable = document.querySelector('#siteCompTable tbody');



/* Render componentes por sede */
function renderSiteComponents(siteKey) {
  siteCompTable.innerHTML = '';
  (state.siteComponents[siteKey] || []).forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.nombre || ''}</td>
      <td>${row.valor || ''}</td>
      <td>${row.marca || ''}</td>
    `;
    siteCompTable.appendChild(tr);
  });
}

/* Render general de la sección */
function renderSiteSection() {
  const k = siteSelect.value;
  renderSiteComponents(k);
}

/* Eventos */
if (siteSelect) {
  siteSelect.addEventListener('change', renderSiteSection);
  // primera carga
  renderSiteSection();
}

// ======= Calculadora =======
function calcLossDown(km) {
  const att1490 = parseFloat(document.getElementById('att1490').value || 0);
  const conns = parseInt(document.getElementById('conns').value || 0);
  const splices = parseInt(document.getElementById('splices').value || 0);
  const split = parseFloat(document.getElementById('splitLoss').value || 0);
  const fiber = att1490 * km;
  const connectors = 0.5 * conns;
  const sp = 0.1 * splices;
  return fiber + connectors + sp + split;
}
function checkBudget(loss) {
  const budget = 28; // B+
  const marginTarget = parseFloat(document.getElementById('margin').value || 3);
  const margin = budget - loss;
  const ok = margin >= marginTarget;
  return { margin, ok };
}


const btn = document.getElementById('btnCalc');
if (btn) {
  btn.textContent = 'Restablecer';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // valores de ejemplo
    document.getElementById('km').value = 5;
    document.getElementById('att1490').value = 0.25;
    document.getElementById('conns').value = 4;
    document.getElementById('splices').value = 8;
    document.getElementById('splitLoss').value = 10.5; // 1:8
    document.getElementById('margin').value = 3;
    renderCalc(); // tu función
  });
}

// ======= Equipos =======
const grid = document.getElementById('equiposGrid');
function renderEquipoCard(eq, idx) {
  const isValidUrl = (u) => {
    try { return !!u && /^https?:\/\//i.test(u) && new URL(u); } catch { return false; }
  };
  const hasURL = isValidUrl(eq.datasheet);

  const el = document.createElement('div');
  el.className = 'card-eq'; // <— usa tu estilo de tarjeta

  el.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <input class="input-eq font-semibold text-slate-100"
             value="${eq.nombre || ''}" placeholder="Nombre del equipo"
             oninput="updateEquipo(${idx}, 'nombre', this.value)">
      <button class="text-rose-400 hover:text-rose-300 text-sm ml-2"
              title="Eliminar" onclick="deleteEquipo(${idx})">Eliminar</button>
    </div>

    <div class="flex items-center gap-2 mb-3">
      ${hasURL ? '<span class="badge-ok">datasheet listo</span>'
      : '<span class="badge-miss">falta datasheet</span>'}
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <label>Marca
        <input class="input-eq mt-1" value="${eq.marca || ''}"
               oninput="updateEquipo(${idx}, 'marca', this.value)">
      </label>
      <label>Datasheet (URL)
        <input class="input-eq mt-1" value="${eq.datasheet || ''}" placeholder="https://..."
               oninput="updateEquipo(${idx}, 'datasheet', this.value)">
      </label>
      <label class="col-span-2">Descripción
        <textarea class="input-eq mt-1" rows="3"
                  oninput="updateEquipo(${idx}, 'desc', this.value)">${eq.desc || ''}</textarea>
      </label>
      <label class="col-span-2">Características clave
        <textarea class="input-eq mt-1" rows="3"
                  oninput="updateEquipo(${idx}, 'carac', this.value)">${eq.carac || ''}</textarea>
      </label>
    </div>

    ${hasURL ? `<a class="ds-link-eq mt-2 inline-flex" href="${eq.datasheet}" target="_blank" rel="noopener">
                  Abrir datasheet
                </a>` : ''}
  `;
  return el;
}


function renderEquipos() {
  grid.innerHTML = '';
  (state.equipos || []).forEach((eq, i) => grid.appendChild(renderEquipoCard(eq, i)));
}

// refresca la card cuando pegan/borrran un datasheet para mostrar/ocultar el link y el pill
function updateEquipo(i, key, val) {
  state.equipos[i][key] = val;
  save();
  if (key === 'datasheet') renderEquipos();
}


function deleteEquipo(i) { state.equipos.splice(i, 1); save(); renderEquipos(); }
function addEquipo() { state.equipos = state.equipos || []; state.equipos.push({}); save(); renderEquipos(); }
window.updateEquipo = updateEquipo; window.deleteEquipo = deleteEquipo;
document.getElementById('addEquipo').addEventListener('click', addEquipo);

// ===== Seed/Merge de equipos (4 definitivos con datasheets) =====
(function seedEquipos() {
  const DEFAULTS = [
    {
      nombre: 'OLT GPON (clase B+)',
      marca: 'Ubiquiti / Huawei / ZTE',
      datasheet: 'https://dl.ubnt.com/ds/uf_gpon.pdf',
      desc: 'Terminal de línea óptica para central, punto de inicio de la red GPON.',
      carac: '8x PON, Clase B+, Presupuesto 28 dB'
    },
    {
      nombre: 'ONT/ONU CPE',
      marca: 'Ubiquiti / Huawei / ZTE',
      datasheet: 'https://dl.ubnt.com/ds/uf_gpon.pdf',
      desc: 'Equipo de usuario final (sede/cliente) que recibe la señal óptica.',
      carac: '1GE/4GE, WiFi integrado, Clase B+'
    },
    {
      nombre: 'Splitter PLC 1:8',
      marca: 'Precision OT',
      datasheet: 'https://www.precisionot.com/wp-content/uploads/PLC-Splitter-Datasheet-100424-1.pdf',
      desc: 'Divisor óptico pasivo para distribuir la señal de la OLT hacia múltiples ONTs.',
      carac: 'Relación 1:8, SC/APC, IL ≤ 10.5 dB'
    },
    {
      nombre: 'ODF 24F',
      marca: 'LANPRO',
      datasheet: 'https://www.lanpro.com/documents/en/cablingsys/LPF194BBKXX_SS_ENB01W.pdf',
      desc: 'Panel de distribución óptica con adaptadores y pigtails.',
      carac: '24 fibras, SC/APC, montaje en rack'
    }
  ];

  state.equipos = Array.isArray(state.equipos) ? state.equipos : [];
  const index = new Map(state.equipos.map(e => [(e?.nombre || '').toLowerCase().trim(), e]));

  DEFAULTS.forEach(d => {
    const k = d.nombre.toLowerCase().trim();
    if (index.has(k)) {
      const t = index.get(k);
      ['marca', 'datasheet', 'desc', 'carac'].forEach(f => { if (!t[f]) t[f] = d[f]; });
    } else {
      state.equipos.push(d);
    }
  });

  save();
  renderEquipos();
})();


// ======= Presupuesto =======
const bodyBudget = document.querySelector('#tablaBudget tbody');
const totalUSD = document.getElementById('totalUSD');
function fmt(n) { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0); }
function rowTpl(r, i) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="p-2"><input class="w-full" value="${r.nombre || ''}" oninput="updRow(${i},'nombre',this.value)"></td>
    <td class="p-2"><input class="w-full" value="${r.marca || ''}" oninput="updRow(${i},'marca',this.value)"></td>
    <td class="p-2"><input type="number" step="0.01" class="w-28" value="${r.valor || 0}" oninput="updRow(${i},'valor',parseFloat(this.value)||0)"></td>
    <td class="p-2"><input type="number" class="w-20" value="${r.cant || 1}" oninput="updRow(${i},'cant',parseInt(this.value)||0)"></td>
    <td class="p-2"><input class="w-full" value="${r.desc || ''}" oninput="updRow(${i},'desc',this.value)"></td>
    <td class="p-2"><input class="w-full" value="${r.carac || ''}" oninput="updRow(${i},'carac',this.value)"></td>
    <td class="p-2" id="sub_${i}">${fmt((r.valor || 0) * (r.cant || 0))}</td>
    <td class="p-2"><button class="text-rose-600" onclick="delRow(${i})">Eliminar</button></td>`;
  return tr;
}
function renderBudget() {
  bodyBudget.innerHTML = ''; let total = 0;
  (state.budget || []).forEach((r, i) => { bodyBudget.appendChild(rowTpl(r, i)); total += (r.valor || 0) * (r.cant || 0); });
  totalUSD.textContent = fmt(total);
}
function updRow(i, k, v) { state.budget[i][k] = v; save(); renderBudget(); }
function delRow(i) { state.budget.splice(i, 1); save(); renderBudget(); }
function addRow() { state.budget = state.budget || []; state.budget.push({ cant: 1 }); save(); renderBudget(); }
window.updRow = updRow; window.delRow = delRow;
document.getElementById('addRow').addEventListener('click', addRow);
document.getElementById('resetRows').addEventListener('click', () => {
  state.budget = [
    { nombre: 'OLT 8 puertos GPON', marca: 'Huawei/ZTE', valor: 1800, cant: 1, desc: 'OLT con fuentes duales y SFPs B+', carac: 'PON 2.5G/1.25G' },
    { nombre: 'Splitters 1:8 PLC', marca: 'Genérico', valor: 18, cant: 4, desc: 'Divisor óptico PLC 1x8', carac: 'SC/APC, caja LGX' },
    { nombre: 'ODF 24F + pigtails', marca: 'Genérico', valor: 220, cant: 1, desc: 'Bandeja distribución óptica', carac: 'SC/APC' },
    { nombre: 'Cierre de empalme 48F', marca: 'Genérico', valor: 65, cant: 4, desc: 'Cierre para planta externa', carac: 'IP68' },
    { nombre: 'Cable troncal 24F (km)', marca: 'DRAKA/Corning', valor: 350, cant: 8, desc: 'FO monomodo G.652D', carac: '0.35 dB/km (1310)' },
    { nombre: 'Patchcord SC/APC', marca: 'Genérico', valor: 3, cant: 20, desc: '2 m', carac: 'IL ≤0.3 dB' },
    { nombre: 'ONTs GPON (CPE)', marca: 'Varias', valor: 35, cant: 32, desc: 'ONU/ONT 1GE+WiFi', carac: 'Clase B+' },
  ]; save(); renderBudget();
});

// ======= Mapa =======
let map = L.map('map').setView([7.119349, -73.122741], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);

// Sitios
const SITES = [
  { key: 'central', nombre: 'Telebucaramanga (Diag 15 con Calle 36)', color: '#0f172a' },
  { key: 'novena', nombre: 'USTA – Novena', color: '#2563eb' },
  { key: 'piedecuesta', nombre: 'USTA – Piedecuesta', color: '#16a34a' },
  { key: 'florida', nombre: 'USTA – Florida', color: '#ea580c' },
  { key: 'limonal', nombre: 'USTA – Limonal', color: '#9333ea' }
];

// --- PRESET: coordenadas conocidas ---
const PRESET_COORDS = {
  // Central (Telebucaramanga – Diag 15 con Calle 36)
  central: { lat: 7.118339758981666, lng: -73.12667624967796 },


  // Sedes USTA
  piedecuesta: { lat: 7.02276231867564, lng: -73.05961269126745 },
  limonal: { lat: 7.0083911612184835, lng: -73.0513592604595 },
  florida: { lat: 7.064373745979681, lng: -73.09516568929476 },
  novena: { lat: 7.137006089842637, lng: -73.12806717157879 } // USTA Bucaramanga (Novena)
};


// Coloca los puntos al cargar si no hay nada guardado
function preloadSites() {
  Object.entries(PRESET_COORDS).forEach(([k, ll]) => placeSite(k, ll));
}

state.sites = state.sites || {};
const sitesList = document.getElementById('sitesList');
let markers = {}; let lines = [];

function renderSiteControls() {
  sitesList.innerHTML = '';
  SITES.forEach(s => {
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';
    const has = !!state.sites[s.key];
    row.innerHTML = `
      <div class="w-3 h-3 rounded-full" style="background:${s.color}"></div>
      <div class="flex-1">${s.nombre}</div>
      ${has ? `<span class='text-xs text-slate-500'>(${state.sites[s.key].lat.toFixed(5)}, ${state.sites[s.key].lng.toFixed(5)})</span>` : '<span class="text-xs text-rose-600">sin punto</span>'}
      ${has ? `<button class="text-rose-600 text-xs" onclick="removeSite('${s.key}')">Quitar</button>` : ''}
    `;
    sitesList.appendChild(row);
  });
}
window.removeSite = (k) => { if (markers[k]) { map.removeLayer(markers[k]); delete markers[k]; } delete state.sites[k]; save(); updateLines(); renderSiteControls(); };

// selector de asignación
let currentSiteKey = 'central';
const selector = document.createElement('select');
selector.className = 'input w-auto inline-block';
SITES.forEach(s => { const o = document.createElement('option'); o.value = s.key; o.textContent = s.nombre; selector.appendChild(o); });
const assignBox = document.getElementById('assignBox');
assignBox.innerHTML = 'Asignar marcador para: ';
assignBox.appendChild(selector);
selector.addEventListener('change', e => currentSiteKey = e.target.value);

// --- Controles de cobertura (checkbox + slider) ---
const covSlider = document.getElementById('covRadius');
const covLabel = document.getElementById('covRadiusLabel');
const covChk = document.getElementById('covEnabled');

// estado inicial del UI (por si recargas)
if (covSlider) covSlider.value = coverageRadius;
if (covLabel) covLabel.textContent = `${coverageRadius} m`;
if (covChk) covChk.checked = coverageEnabled;

// eventos
if (covSlider && covLabel) {
  covSlider.addEventListener('input', (e) => {
    coverageRadius = parseInt(e.target.value, 10) || 1000;
    covLabel.textContent = `${coverageRadius} m`;
    drawCoverage();     // redibuja círculos con el nuevo radio
  });
}
if (covChk) {
  covChk.addEventListener('change', (e) => {
    coverageEnabled = !!e.target.checked;
    drawCoverage();     // muestra/oculta los círculos
  });
}


map.on('dblclick', (e) => { placeSite(currentSiteKey, e.latlng); });

function placeSite(key, latlng) {
  const meta = SITES.find(s => s.key === key);
  if (markers[key]) map.removeLayer(markers[key]);
  const m = L.marker(latlng, { draggable: true }).addTo(map).bindTooltip(meta.nombre, { permanent: true, offset: [0, -16] }).openTooltip();
  m.on('dragend', () => { state.sites[key] = m.getLatLng(); save(); updateLines(); renderSiteControls(); });
  markers[key] = m; state.sites[key] = latlng; save(); updateLines(); renderSiteControls(); drawCoverage();

}


// restaurar marcadores o precargar si está vacío
// if (Object.keys(state.sites || {}).length > 0) {
//   for (const k in state.sites) { placeSite(k, state.sites[k]); }
// } else {
//   preloadSites();
// }
// renderSiteControls();

// --- Siempre cargar los PRESET_COORDS al iniciar ---
function loadPresetSites() {
  // 1) Estado interno = presets (ignora lo que hubiera en localStorage)
  state.sites = { ...PRESET_COORDS };
  save();

  // 2) Limpia marcadores existentes
  for (const k in markers) { map.removeLayer(markers[k]); }
  markers = {};

  // 3) Coloca los presets
  Object.entries(state.sites).forEach(([k, ll]) => placeSite(k, ll));

  // 4) UI
  renderSiteControls();
  updateLines();
  drawCoverage();

}
loadPresetSites();



// distancias
function haversine(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat); const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function updateLines() {
  lines.forEach(l => map.removeLayer(l)); lines = [];
  const tbody = document.querySelector('#distTable tbody');
  tbody.innerHTML = '';
  if (!state.sites['central']) return;
  const c = state.sites['central'];
  ['novena', 'piedecuesta', 'florida', 'limonal'].forEach(k => {
    if (state.sites[k]) {
      const latlngs = [c, state.sites[k]];
      const line = L.polyline(latlngs, { color: '#64748b', weight: 3, dashArray: '6 6' }).addTo(map);
      lines.push(line);
      const dist = haversine(c, state.sites[k]);
      const loss = calcLossDown(dist);
      const chk = checkBudget(loss);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="py-1">Central → ${SITES.find(s => s.key === k).nombre}</td><td>${dist.toFixed(2)}</td><td>${loss.toFixed(2)}</td><td>${chk.ok ? '<span class="text-green-700">✔</span>' : '<span class="text-rose-700">✖</span>'}</td>`;
      tbody.appendChild(tr);
    }
  });
  drawCoverage();

}
document.getElementById('clearAll').addEventListener('click', () => {
  for (const k in markers) { map.removeLayer(markers[k]); }
  markers = {}; state.sites = {}; save(); updateLines(); renderSiteControls();
});

// exportar estado
// document.getElementById('btnExport').addEventListener('click', () => {
//   const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
//   const url = URL.createObjectURL(blob);
//   const a = document.createElement('a'); a.href = url; a.download = 'gpon-planner.json'; a.click(); URL.revokeObjectURL(url);
// });

// // ======= Datos por defecto =======
// if (!state.equipos) {
//   state.equipos = [
//     { nombre: 'OLT GPON (clase B+)', marca: 'Huawei/ZTE/Nokia', datasheet: '', desc: 'Terminal de línea óptica para central', carac: '8x PON, 2x uplink 10G' },
//     { nombre: 'ONT/ONU CPE', marca: 'Huawei/ZTE/Nokia', datasheet: '', desc: 'Equipo de usuario final para cada sede', carac: '1GE/4GE + WiFi' },
//     { nombre: 'Splitter PLC 1:8', marca: 'Genérico', datasheet: '', desc: 'Divisor óptico pasivo', carac: 'SC/APC, IL≤10.5 dB' },
//     { nombre: 'ODF 24F', marca: 'Genérico', datasheet: '', desc: 'Panel de distribución óptica', carac: 'Bandeja + pigtails SC/APC' },
//   ]; save();
// }
// if (!state.budget) { state.budget = []; save(); }

// ====== Datos por defecto (equipos definitivos) =======
if (!state.equipos) {
  state.equipos = [
    {
      nombre: 'OLT GPON (clase B+)',
      marca: 'Ubiquiti / Huawei / ZTE',
      datasheet: 'https://dl.ubnt.com/ds/uf_gpon.pdf',
      desc: 'Terminal de línea óptica para central, punto de inicio de la red GPON.',
      carac: '8x PON, Clase B+, Presupuesto 28 dB'
    },
    {
      nombre: 'ONT/ONU CPE',
      marca: 'Ubiquiti / Huawei / ZTE',
      datasheet: 'https://dl.ubnt.com/ds/uf_gpon.pdf',
      desc: 'Equipo de usuario final (sede/cliente) que recibe la señal óptica.',
      carac: '1GE/4GE, WiFi integrado, Clase B+'
    },
    {
      nombre: 'Splitter PLC 1:8',
      marca: 'Precision OT',
      datasheet: 'https://www.precisionot.com/wp-content/uploads/PLC-Splitter-Datasheet-100424-1.pdf',
      desc: 'Divisor óptico pasivo para distribuir la señal de la OLT hacia múltiples ONTs.',
      carac: 'Relación 1:8, SC/APC, IL ≤ 10.5 dB'
    },
    {
      nombre: 'ODF 24F',
      marca: 'LANPRO',
      datasheet: 'https://www.lanpro.com/documents/en/cablingsys/LPF194BBKXX_SS_ENB01W.pdf',
      desc: 'Panel de distribución óptica con adaptadores y pigtails.',
      carac: '24 fibras, SC/APC, montaje en rack'
    }
  ];
  save();
}
renderEquipos();

// ====== Zona de cobertura =======
function drawCoverage() {
  // elimina círculos anteriores
  Object.values(coverage).forEach(c => map.removeLayer(c));
  coverage = {};

  if (!coverageEnabled) return;

  // dibuja un círculo por cada marcador existente
  Object.keys(markers).forEach(k => {
    const circle = L.circle(markers[k].getLatLng(), {
      radius: coverageRadius,
      color: '#16a34a',
      weight: 2,
      fillColor: '#16a34a',
      fillOpacity: 0.08
    }).addTo(map);
    coverage[k] = circle;
  });
}
// ================ Animación suave al entrar en viewport (neon-cards) =========================
const neonCards = document.querySelectorAll('.neon-card');
const obs = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.transition = 'transform .6s ease, box-shadow .6s ease';
      e.target.style.transform = 'translateY(0)';
      e.target.style.boxShadow += ', 0 0 24px rgba(124, 58, 237, .12)';
    }
  })
}, { threshold: 0.15 });

neonCards.forEach(c => {
  c.style.transform = 'translateY(8px)';
  obs.observe(c);
});


renderEquipos();
renderBudget();
updateLines();


/* ======= Diagrama de topología en estrella ======= */
function renderStarTopology() {
  const svg = document.getElementById('starTopoSvg');
  if (!svg) return;

  const ns = svg.namespaceURI || 'http://www.w3.org/2000/svg';

  // Asegura un viewBox razonable si no existe
  if (!svg.getAttribute('viewBox')) {
    svg.setAttribute('viewBox', '0 0 700 340');
  }

  // Limpia todo
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // Tamaño lógico del diagrama a partir del viewBox
  const vb = svg.viewBox.baseVal;
  const W = vb && vb.width ? vb.width : 700;
  const H = vb && vb.height ? vb.height : 340;

  // ======= Defs: gradiente y punta de flecha =======
  const defs = document.createElementNS(ns, 'defs');

  const grad = document.createElementNS(ns, 'linearGradient');
  grad.setAttribute('id', 'panelGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('x2', '0');
  grad.setAttribute('y1', '0'); grad.setAttribute('y2', '1');

  const s1 = document.createElementNS(ns, 'stop');
  s1.setAttribute('offset', '0%');
  s1.setAttribute('stop-color', '#0f172a');

  const s2 = document.createElementNS(ns, 'stop');
  s2.setAttribute('offset', '100%');
  s2.setAttribute('stop-color', '#0b1220');

  grad.append(s1, s2);

  const marker = document.createElementNS(ns, 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '4');
  marker.setAttribute('orient', 'auto');

  const tip = document.createElementNS(ns, 'path');
  tip.setAttribute('d', 'M0,0 L10,4 L0,8 Z');
  tip.setAttribute('fill', '#93c5fd');

  marker.appendChild(tip);
  defs.append(grad, marker);
  svg.appendChild(defs);

  // ======= Helpers =======
  const g = (cls) => {
    const el = document.createElementNS(ns, 'g');
    if (cls) el.setAttribute('class', cls);
    return el;
  };

  const rect = (x, y, w, h) => {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', h);
    return r;
  };

  const text = (x, y, cls, content) => {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    if (cls) t.setAttribute('class', cls);
    t.setAttribute('text-anchor', 'middle');
    t.textContent = content;
    return t;
  };

  // (todo lo dibujado va a este contenedor para poder hacer zoom luego)
  const content = g('content');

  const edge = (x1, y1, x2, y2, withArrow = true) => {
    const p = document.createElementNS(ns, 'path');
    // Curva suave hacia arriba
    const cx = (x1 + x2) / 2, cy = y1 - 60;
    p.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`);
    p.setAttribute('class', `edge${withArrow ? ' arrow' : ''}`);
    content.appendChild(p);
  };

  // ======= Datos =======
  const centralName = 'OLT';
  const sitesMap = {
    novena: 'USTA – Novena',
    florida: 'USTA – Florida',
    limonal: 'USTA – Limonal',
    piedecuesta: 'USTA – Piedecuesta'
  };

  // ======= Posiciones =======
  const center = { x: W * 0.35, y: H * 0.50 };
  const targets = [
    { key: 'novena', x: W * 0.78, y: H * 0.18 },
    { key: 'florida', x: W * 0.72, y: H * 0.35 },
    { key: 'limonal', x: W * 0.82, y: H * 0.48 },
    { key: 'piedecuesta', x: W * 0.72, y: H * 0.66 },
  ];

  // ======= Nodo central (OLT + Splitter) =======
  const w = 160, h = 64;
  const nOLT = g('node');
  nOLT.appendChild(rect(center.x - w / 2, center.y - h / 2, w, h));
  nOLT.appendChild(text(center.x, center.y - 6, 'title', centralName));
  nOLT.appendChild(text(center.x, center.y + 18, 'sub', 'Splitter 1:N'));
  content.appendChild(nOLT);

  // ======= Aristas + nodos ONT =======
  targets.forEach(t => {
    edge(center.x + w / 2, center.y, t.x - 90, t.y, true);

    const node = g('node');
    node.appendChild(rect(t.x - 100, t.y - 26, 200, 52));
    node.appendChild(text(t.x, t.y - 4, 'title', 'ONT'));
    node.appendChild(text(t.x, t.y + 16, 'sub', sitesMap[t.key] || t.key));
    content.appendChild(node);
  });

  // ======= Wrapper de zoom (al final) =======
  let zoom = svg.querySelector('g.svg-zoom');
  if (!zoom) {
    zoom = document.createElementNS(ns, 'g');
    zoom.setAttribute('class', 'svg-zoom');
    svg.appendChild(zoom);
  }
  zoom.appendChild(content);
}


(function scaleStarTopo() {
  const svg = document.getElementById('starTopoSvg');
  if (!svg) return;

  // Evita duplicar el wrapper si ya existe
  if (svg.querySelector('g.svg-zoom')) return;

  // wrapper
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'svg-zoom');

  // mueve todo lo que ya dibujaste dentro del <g>
  const frag = document.createDocumentFragment();
  while (svg.firstChild) frag.appendChild(svg.firstChild);
  g.appendChild(frag);
  svg.appendChild(g);
})();

// Render inicial y cuando cambie algo relevante
renderStarTopology();
window.addEventListener('resize', () => renderStarTopology());

// Si tu flujo actual recalcula líneas/tabla, vuelve a invocar:
const _oldUpdateLines = updateLines;
updateLines = function () {
  _oldUpdateLines.apply(this, arguments);
  renderStarTopology();
};
// === Auto-cálculo + salida en #calcOut ===
function readNum(id, def = 0) {
  const el = document.getElementById(id);
  if (!el) return def;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : def;
}

function renderCalc() {
  const km = readNum('km', 0);
  const loss = calcLossDown(km);          // usa tu función existente
  const { margin, ok } = checkBudget(loss); // usa tu función existente

  const out = document.getElementById('calcOut');
  if (!out) return;

  out.innerHTML = `
    <div class="calc-line"><span>Distancia</span><b>${km.toFixed(2)} km</b></div>
    <div class="calc-line"><span>Pérdida ↓</span><b>${loss.toFixed(2)} dB</b></div>
    <div class="calc-line"><span>Margen</span><b>${margin.toFixed(2)} dB</b></div>
    <div class="calc-status ${ok ? 'ok' : 'fail'}">
      ${ok ? '✔ Cumple presupuesto B+' : '✖ No cumple presupuesto B+'}
    </div>`;
}

// Recalcular al escribir/cambiar
['km', 'att1490', 'conns', 'splices', 'splitLoss', 'margin'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  const ev = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(ev, renderCalc);
});

// Si mantienes el botón, que también dispare el cálculo
document.getElementById('btnCalc')?.addEventListener('click', e => {
  e.preventDefault();
  renderCalc();
});

// Primer render
renderCalc();
// Sedes fijas y sus imágenes locales (ajusta las rutas a tu carpeta)
const SEDE_FOTOS = [
  { key: 'novena', name: 'USTA - Novena', src: './assets/sedes/novena.jpg' },
  { key: 'florida', name: 'USTA - Florida', src: './assets/sedes/florida.jpg' },
  { key: 'limonal', name: 'USTA - Limonal', src: './assets/sedes/limonal.jpg' },
  { key: 'piedecuesta', name: 'USTA - Piedecuesta', src: './assets/sedes/piedecuesta.jpg' }
];

// Helper: marca una tarjeta como activa y sincroniza select + estado
function setSedeActiva(key, { syncSelect = true } = {}) {
  // resalta tarjeta
  document.querySelectorAll('.sede-card').forEach(card => {
    card.classList.toggle('is-active', card.dataset.key === key);
  });

  // guarda la selección
  state.sedeActiva = key;
  if (typeof save === 'function') save();

  // sincroniza selector de sede si está presente
  if (syncSelect) {
    const sel = document.getElementById('siteSelect') || document.querySelector('#siteSelect, #sedeSelect');
    if (sel) {
      sel.value = key;
      // dispara change para que lo demás (mapa, etc.) reaccione
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

// Render de la galería
function renderSedeGallery() {
  const wrap = document.getElementById('sedeGallery');
  if (!wrap) return;

  wrap.innerHTML = '';
  SEDE_FOTOS.forEach(s => {
    const card = document.createElement('div');
    card.className = 'sede-card';
    card.dataset.key = s.key;
    card.innerHTML = `
      <img src="${s.src}" alt="${s.name}">
      <span class="sede-name">${s.name}</span>
    `;
    card.addEventListener('click', () => setSedeActiva(s.key, { syncSelect: true }));
    wrap.appendChild(card);
  });

  // Estado inicial: lo que haya en state o el valor del select o primera sede
  const initial =
    state?.sedeActiva ||
    (document.getElementById('siteSelect') && document.getElementById('siteSelect').value) ||
    SEDE_FOTOS[0].key;

  setSedeActiva(initial, { syncSelect: true });
}

// Mantener la selección cuando el usuario cambia el selector manualmente
(function syncFromSelect() {
  const sel = document.getElementById('siteSelect') || document.querySelector('#siteSelect, #sedeSelect');
  if (!sel) return;
  sel.addEventListener('change', e => {
    const key = e.target.value;
    setSedeActiva(key, { syncSelect: false });
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  renderSedeGallery();
});
// // ===== Menú móvil toggle =====
// const hamb = document.getElementById('hamb');
// const mobileNav = document.getElementById('mobileNav');
// if (hamb && mobileNav) {
//   hamb.addEventListener('click', () => {
//     mobileNav.classList.toggle('open');
//   });
// }

// // ===== Link activo según el scroll =====
// const links = [...document.querySelectorAll('.main-nav .nav-link, .mobile-nav .nav-link')];
// const sections = links
//   .map(a => document.querySelector(a.getAttribute('href')))
//   .filter(Boolean);

// function setActiveLink() {
//   const y = window.scrollY + 100; // margen
//   let current = null;
//   for (const sec of sections) {
//     if (sec.offsetTop <= y) current = sec;
//   }
//   links.forEach(a => a.classList.remove('active'));
//   if (current) {
//     links
//       .filter(a => a.getAttribute('href') === `#${current.id}`)
//       .forEach(a => a.classList.add('active'));
//   }
// }
// window.addEventListener('scroll', setActiveLink);
// window.addEventListener('load', setActiveLink);

// // ===== Header compacto al hacer scroll =====
// const header = document.querySelector('.site-header');
// window.addEventListener('scroll', () => {
//   header.classList.toggle('scrolled', window.scrollY > 12);
// });

// // ===== Scroll suave para los links del header (por si tu CSS no lo tiene) =====
// document.querySelectorAll('.nav-link[href^="#"]').forEach(a => {
//   a.addEventListener('click', e => {
//     const id = a.getAttribute('href');
//     const sec = document.querySelector(id);
//     if (!sec) return;
//     e.preventDefault();
//     mobileNav?.classList.remove('open');
//     sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
//   });
// });

// ===== Mobile menu toggle =====
const hamb = document.getElementById('hamb');
const mobileNav = document.getElementById('mobileNav');

if (hamb && mobileNav) {
  hamb.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    hamb.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

// ===== Links (desktop + mobile) =====
const navLinks = Array.from(
  document.querySelectorAll('header .nav-link[href^="#"]')
);

// Cerrar menú móvil al elegir opción + scroll suave
navLinks.forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const sec = document.querySelector(id);
    if (!sec) return;
    e.preventDefault();
    mobileNav?.classList.remove('open');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ===== Resaltar link activo con IntersectionObserver =====
const sections = navLinks
  .map(a => document.querySelector(a.getAttribute('href')))
  .filter(Boolean);

if (sections.length) {
  const io = new IntersectionObserver(
    entries => {
      // el que esté visible (cerca del centro) activa su link
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = '#' + entry.target.id;
          navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === id));
        }
      });
    },
    {
      root: null,
      // centrado: 40% arriba y 55% abajo
      rootMargin: '-40% 0px -55% 0px',
      threshold: 0.01
    }
  );
  sections.forEach(s => io.observe(s));
}

// ===== Header compacto al hacer scroll (opcional) =====
const header = document.querySelector('.site-header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 12);
  });
}

// --- Render de la topología (usa tu función ya creada) ---
if (typeof renderStarTopology === 'function') {
  // dibuja al cargar
  renderStarTopology();

  // vuelve a dibujar en resize (con un pequeño debounce)
  let topoT;
  window.addEventListener('resize', () => {
    clearTimeout(topoT);
    topoT = setTimeout(renderStarTopology, 120);
  });
} else {
  console.warn('⚠️ No encuentro renderStarTopology().');
}
