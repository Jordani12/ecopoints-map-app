/* ============================================================
   app.js — Mapa de Ecopontos Santos-SP
   Geocodificação automática via Nominatim + cache localStorage
   ============================================================ */

const CORES = {
  pilhas_baterias:     { cor: "#e5a800", bg: "#fff8e0", label: "Pilhas e Baterias" },
  eletronico:          { cor: "#d85a30", bg: "#faecea", label: "Eletrônicos" },
  vidro:               { cor: "#534ab7", bg: "#eeedfe", label: "Vidro" },
  lampadas:            { cor: "#378add", bg: "#e6f1fb", label: "Lâmpadas" },
  oleo:                { cor: "#639922", bg: "#eaf3de", label: "Óleo de Cozinha" },
  remedios:            { cor: "#e24b4a", bg: "#fcebeb", label: "Remédios" },
  pneus:               { cor: "#444444", bg: "#e8e8e8", label: "Pneus" },
  filmes_radiologicos: { cor: "#185fa5", bg: "#e6f1fb", label: "Filmes Radiológicos" },
  parafina:            { cor: "#ba7517", bg: "#faeeda", label: "Parafina" },
  capsulas_cafe:       { cor: "#7f4e1e", bg: "#f5ece4", label: "Cápsulas de Café" },
};

const COORDS_BAIRRO = {
  "Paquetá":            [-23.9241, -46.3298],
  "Chico de Paula":     [-23.9220, -46.3440],
  "Areia Branca":       [-23.9215, -46.3575],
  "Aparecida":          [-23.9628, -46.3185],
  "Boqueirão":          [-23.9580, -46.3120],
  "Gonzaga":            [-23.9613, -46.3330],
  "Vila Mathias":       [-23.9495, -46.3265],
  "Centro":             [-23.9345, -46.3295],
  "Embaré":             [-23.9550, -46.3350],
  "Campo Grande":       [-23.9450, -46.3070],
  "Encruzilhada":       [-23.9400, -46.3145],
  "Marapé":             [-23.9535, -46.3415],
  "Ponta da Praia":     [-23.9860, -46.3040],
  "Valongo":            [-23.9270, -46.3265],
  "Jardim Santa Maria": [-23.9372, -46.3525],
  "Rádio Clube":        [-23.9332, -46.3480],
  "Vila São Jorge":     [-23.9358, -46.3185],
  "Jardim Castelo":     [-23.9303, -46.3438],
  "Macuco":             [-23.9415, -46.3198],
  "Jabaquara":          [-23.9228, -46.3388],
  "Nova Cintra":        [-23.9558, -46.3528],
  "São Manoel":         [-23.9349, -46.3223],
  "Caneleira":          [-23.9418, -46.3488],
  "Saboó":              [-23.9238, -46.3380],
  "Piratininga":        [-23.9490, -46.3558],
  "José Menino":        [-23.9748, -46.3228],
  "Orla":               [-23.9710, -46.3315],
  "Área Continental":   [-23.8902, -46.4010],
  "Diversos":           [-23.9500, -46.3300],
};

// ============================================================
// ESTADO GLOBAL
// ============================================================
let map;
let todosOsMarcadores = [];
let filtroAtivo       = "todos";
let termoBusca        = "";
let marcadorFoco      = null;
let clicandoMarcador  = false;

const CACHE_KEY = "ecopontos_coords_v1";

// ============================================================
// CACHE DE COORDENADAS (localStorage)
// ============================================================
function carregarCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function salvarCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// ============================================================
// GEOCODIFICAÇÃO — Nominatim
// ============================================================
async function geocodificarNominatim(endereco, bairro) {
  const tentativas = [
    `${endereco}, ${bairro || ""}, Santos, SP, Brasil`,
    `${endereco}, Santos, SP, Brasil`,
  ];
  for (const query of tentativas) {
    try {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
        encodeURIComponent(query);
      const resp = await fetch(url, {
        headers: { "User-Agent": "EcopontosSantosSP/1.0 (trabalho escolar)" },
      });
      const data = await resp.json();
      if (data && data.length > 0)
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch { /* tenta próxima */ }
  }
  return null;
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ============================================================
// AVISO NA TELA
// ============================================================
function mostrarAviso(msg, autoFechar = 0) {
  let el = document.getElementById("aviso-geo");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-geo";
    el.style.cssText = `
      position:fixed; bottom:20px; right:20px;
      background:#1a5c2a; color:white;
      padding:10px 16px; border-radius:10px;
      font-size:13px; z-index:2000;
      box-shadow:0 4px 14px rgba(0,0,0,.25);
      transition:opacity .3s;
    `;
    document.body.appendChild(el);
  }
  el.textContent  = msg;
  el.style.opacity = "1";
  el.style.display = "block";
  if (autoFechar > 0) setTimeout(esconderAviso, autoFechar);
}
function esconderAviso() {
  const el = document.getElementById("aviso-geo");
  if (!el) return;
  el.style.opacity = "0";
  setTimeout(() => { el.style.display = "none"; }, 300);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
fetch("ecopontos.json")
  .then((r) => { if (!r.ok) throw new Error("JSON não encontrado"); return r.json(); })
  .then((d)  => inicializar(d.ecopontos))
  .catch((e) => {
    console.error(e);
    document.getElementById("contagem-header").textContent = "Erro ao carregar dados";
  });

async function inicializar(ecopontos) {
  map = L.map("map").setView([-23.95, -46.33], 13);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // Plota todos com posição provisória (por bairro) para aparecer imediatamente
  ecopontos.forEach((ep) => {
    const coords = coordProvisoria(ep);
    const marker = L.marker(coords, { icon: criarIcone(ep.materiais) })
      .addTo(map)
      .on("click", () => {
        clicandoMarcador = true;
        setTimeout(() => { clicandoMarcador = false; }, 200);
        ativarFoco(ep.id);
        mostrarPopup(ep);
      });
    todosOsMarcadores.push({ marker, dados: ep, coords });
  });

  renderizarLista(ecopontos);

  document.getElementById("busca").addEventListener("input", (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    aplicarFiltros();
  });

  map.on("click", () => { if (!clicandoMarcador) fecharFoco(); });

  // Conta quantos precisam de geocodificação (não estão no cache nem no JSON)
  const cache = carregarCache();
  const precisamGeo = ecopontos.filter((ep) => {
    if (ep.latitude && ep.longitude) return false;
    if (!ep.endereco || ep.endereco.toLowerCase().includes("todas as")) return false;
    const chave = `${ep.endereco}|${ep.bairro || ""}`;
    return !cache[chave];
  });

  if (precisamGeo.length > 0) {
    mostrarAviso(`📍 Localizando ${precisamGeo.length} endereços... aguarde`);
  }

  // Geocodifica em background, atualizando os marcadores em tempo real
  await geocodificarTodos(ecopontos);

  if (precisamGeo.length > 0) {
    esconderAviso();
    mostrarAviso("✅ Todos os endereços localizados!", 3000);
  }
}

// ============================================================
// COORDENADA PROVISÓRIA (bairro + jitter)
// ============================================================
function coordProvisoria(ep) {
  if (ep.latitude && ep.longitude) return [ep.latitude, ep.longitude];
  const base = COORDS_BAIRRO[ep.bairro] || [-23.95, -46.33];
  return [jitter(base[0]), jitter(base[1])];
}
function jitter(c) { return c + (Math.random() - 0.5) * 0.0015; }

// ============================================================
// GEOCODIFICAR TODOS EM SEQUÊNCIA
// ============================================================
async function geocodificarTodos(ecopontos) {
  const cache = carregarCache();

  for (const ep of ecopontos) {
    // Já tem coordenada real no JSON
    if (ep.latitude && ep.longitude) continue;

    // Endereço genérico — não tenta geocodificar
    if (!ep.endereco || ep.endereco.toLowerCase().includes("todas as")) continue;

    const chave = `${ep.endereco}|${ep.bairro || ""}`;

    let coords;
    if (cache[chave]) {
      // Usa cache
      coords = cache[chave];
    } else {
      // Consulta Nominatim
      coords = await geocodificarNominatim(ep.endereco, ep.bairro || "");
      if (coords) {
        cache[chave] = coords;
        salvarCache(cache);
      } else {
        // Fallback por bairro
        const base = COORDS_BAIRRO[ep.bairro] || [-23.95, -46.33];
        coords = [jitter(base[0]), jitter(base[1])];
      }
      await delay(1100); // respeita 1 req/s do Nominatim
    }

    // Move o marcador para a posição correta
    const item = todosOsMarcadores.find((m) => m.dados.id === ep.id);
    if (item) {
      item.marker.setLatLng(coords);
      item.coords = coords;
    }
  }
}

// ============================================================
// ÍCONE
// ============================================================
function criarIcone(materiais, destacado = false) {
  const info = CORES[materiais[0]] || { cor: "#1a5c2a", bg: "#e8f5eb" };
  const tam  = destacado ? 34 : 26;
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${tam}px;height:${tam}px;border-radius:50%;
      background:${destacado ? info.cor : info.bg};
      border:2px solid ${info.cor};
      display:flex;align-items:center;justify-content:center;
      font-size:${destacado ? 16 : 12}px;
      box-shadow:0 2px ${destacado ? 10 : 6}px rgba(0,0,0,${destacado ? .4 : .22});
    "><span style="color:${destacado ? "white" : info.cor};">♻</span></div>`,
    iconSize:    [tam, tam],
    iconAnchor:  [tam / 2, tam / 2],
    popupAnchor: [0, -tam / 2 - 4],
  });
}

// ============================================================
// FOCO
// ============================================================
function ativarFoco(id) {
  marcadorFoco = id;
  atualizarVisualizacaoMarcadores();
  document.querySelectorAll(".card-eco").forEach((c) => c.classList.remove("selecionado"));
  const card = document.getElementById("card-" + id);
  if (card) { card.classList.add("selecionado"); card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}
function fecharFoco() {
  marcadorFoco = null;
  atualizarVisualizacaoMarcadores();
  fecharPopup();
  document.querySelectorAll(".card-eco").forEach((c) => c.classList.remove("selecionado"));
}
function atualizarVisualizacaoMarcadores() {
  todosOsMarcadores.forEach(({ marker, dados }) => {
    if (marcadorFoco === null) { marker.setIcon(criarIcone(dados.materiais, false)); marker.setOpacity(1); }
    else if (dados.id === marcadorFoco) { marker.setIcon(criarIcone(dados.materiais, true)); marker.setOpacity(1); }
    else { marker.setIcon(criarIcone(dados.materiais, false)); marker.setOpacity(0.3); }
  });
}

// ============================================================
// LISTA LATERAL
// ============================================================
function renderizarLista(lista) {
  const elLista          = document.getElementById("lista-ecopontos");
  const elSemRes         = document.getElementById("sem-resultados");
  const elContagem       = document.getElementById("contagem");
  const elContagemHeader = document.getElementById("contagem-header");

  elContagem.textContent       = lista.length;
  elContagemHeader.textContent = `${lista.length} ecoponto${lista.length !== 1 ? "s" : ""}`;

  if (!lista.length) { elLista.innerHTML = ""; elSemRes.style.display = "block"; return; }
  elSemRes.style.display = "none";

  elLista.innerHTML = lista.map((ep) => {
    const tags = ep.materiais.map((m) => {
      const c = CORES[m] || { cor: "#1a5c2a", bg: "#e8f5eb", label: m };
      return `<span class="tag" style="background:${c.bg};color:${c.cor};">${c.label}</span>`;
    }).join("");
    return `<div class="card-eco" id="card-${ep.id}" onclick="selecionarCard(${ep.id})">
      <div class="card-nome">${ep.nome}</div>
      <div class="card-bairro">📍 ${ep.bairro || "—"} &mdash; ${ep.endereco}</div>
      <div class="card-tags">${tags}</div>
    </div>`;
  }).join("");
}

function selecionarCard(id) {
  const item = todosOsMarcadores.find((m) => m.dados.id === id);
  if (!item) return;
  ativarFoco(id);
  map.setView(item.coords, 16, { animate: true });
  mostrarPopup(item.dados);
}

// ============================================================
// POPUP
// ============================================================
function mostrarPopup(ep) {
  const popup = document.getElementById("info-popup");
  popup.classList.remove("entrando");
  popup.style.display = "none";

  document.getElementById("pop-nome").textContent = ep.nome;
  document.getElementById("pop-end").textContent  = ep.endereco + (ep.bairro ? ` — ${ep.bairro}` : "");
  document.getElementById("pop-tags").innerHTML = ep.materiais.map((m) => {
    const c = CORES[m] || { cor: "#1a5c2a", bg: "#e8f5eb", label: m };
    return `<span class="tag" style="background:${c.bg};color:${c.cor};font-size:12px;padding:3px 10px;">${c.label}</span>`;
  }).join("");

  preencherLinha("pop-horario", ep.horario);
  preencherLinha("pop-tel",     ep.telefone);
  preencherLinha("pop-obs",     ep.observacoes);

  popup.style.display = "block";
  void popup.offsetWidth;
  popup.classList.add("entrando");
}
function preencherLinha(id, valor) {
  const el = document.getElementById(id);
  if (valor) { el.style.display = "flex"; el.querySelector("span:last-child").textContent = valor; }
  else el.style.display = "none";
}
function fecharPopup() {
  const popup = document.getElementById("info-popup");
  if (popup.style.display === "none") return;
  popup.classList.remove("entrando");
  popup.classList.add("saindo");
  popup.addEventListener("animationend", () => {
    popup.style.display = "none";
    popup.classList.remove("saindo");
  }, { once: true });
}

// ============================================================
// FILTROS
// ============================================================
function filtrar(tipo, btn) {
  filtroAtivo = tipo;
  fecharFoco();
  document.querySelectorAll(".filtro-btn").forEach((b) => {
    b.classList.remove("ativo");
    b.style.background = "white"; b.style.color = "#555"; b.style.borderColor = "#ccc";
  });
  btn.classList.add("ativo");
  const cor = tipo === "todos" ? "#1a5c2a" : (CORES[tipo]?.cor || "#1a5c2a");
  btn.style.background = cor; btn.style.color = "white"; btn.style.borderColor = cor;
  aplicarFiltros();
}
function aplicarFiltros() {
  const visiveis = [];
  todosOsMarcadores.forEach(({ marker, dados }) => {
    const ok = (filtroAtivo === "todos" || dados.materiais.includes(filtroAtivo)) &&
      (!termoBusca || dados.nome.toLowerCase().includes(termoBusca) ||
       (dados.bairro || "").toLowerCase().includes(termoBusca) ||
       dados.endereco.toLowerCase().includes(termoBusca));
    if (ok) { marker.addTo(map); visiveis.push(dados); }
    else map.removeLayer(marker);
  });
  renderizarLista(visiveis);
}

// ============================================================
// GEOLOCALIZAÇÃO
// ============================================================
function localizarMe() {
  if (!navigator.geolocation) { alert("Geolocalização não suportada."); return; }
  navigator.geolocation.getCurrentPosition(
    ({ coords: { latitude, longitude } }) => {
      map.setView([latitude, longitude], 15, { animate: true });
      L.marker([latitude, longitude], {
        icon: L.divIcon({ className: "", html: '<div class="marcador-usuario"></div>', iconSize: [16,16], iconAnchor: [8,8] }),
      }).addTo(map).bindPopup("📍 Você está aqui").openPopup();
    },
    (e) => alert({ 1: "Permissão negada.", 2: "Posição indisponível.", 3: "Tempo esgotado." }[e.code] || "Erro."),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ============================================================
// FORÇAR RE-GEOCODIFICAÇÃO (abrir console e chamar esta função)
// ============================================================
function limparCacheCoords() {
  localStorage.removeItem(CACHE_KEY);
  alert("Cache limpo. Recarregue a página para re-geocodificar.");
}