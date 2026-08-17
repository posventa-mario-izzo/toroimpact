const API = "/api";
let META = { carriers: [], estados: [], estados_poliza: [], dias_seguimiento: 14 };
let CLIENTES_CACHE = [];
let filasImportarPendientes = [];

// ---------- utilidades ----------
function $(sel) { return document.querySelector(sel); }
function fmtFecha(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let msg = "Ocurrió un error";
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ---------- carga inicial de metadatos ----------
async function cargarMeta() {
  META = await api("/meta");
  const carrierSelects = [$("#carrier"), $("#filtroCarrier")];
  const estadoSelects = [$("#estado"), $("#filtroEstado")];

  $("#filtroCarrier").innerHTML = '<option value="">Todos los carriers</option>';
  $("#filtroEstado").innerHTML = '<option value="">Todos los estados</option>';
  $("#carrier").innerHTML = "";
  $("#estado").innerHTML = "";
  $("#estado_poliza").innerHTML = "";

  META.carriers.forEach((c) => {
    $("#carrier").insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
    $("#filtroCarrier").insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
  });
  META.estados.forEach((e) => {
    $("#estado").insertAdjacentHTML("beforeend", `<option value="${e}">${e}</option>`);
    $("#filtroEstado").insertAdjacentHTML("beforeend", `<option value="${e}">${e}</option>`);
  });
  META.estados_poliza.forEach((e) => {
    $("#estado_poliza").insertAdjacentHTML("beforeend", `<option value="${e}">${e}</option>`);
  });
}

// ---------- listado / filtros ----------
async function cargarClientes() {
  const params = new URLSearchParams();
  const q = $("#buscar").value.trim();
  const carrier = $("#filtroCarrier").value;
  const estado = $("#filtroEstado").value;
  const soloSeguimiento = $("#filtroSeguimiento").checked;

  if (q) params.set("q", q);
  if (carrier) params.set("carrier", carrier);
  if (estado) params.set("estado", estado);
  if (soloSeguimiento) params.set("seguimiento_pendiente", "true");

  CLIENTES_CACHE = await api("/clientes?" + params.toString());
  renderTabla(CLIENTES_CACHE);
}

function badgeEstado(estado) {
  const clase = estado === "Aprobado" ? "badge-aprobado" : estado === "Negado" ? "badge-negado" : "badge-proceso";
  return `<span class="badge ${clase}">${estado}</span>`;
}
function badgePoliza(estado) {
  const clase = estado === "Recibida" ? "badge-recibida" : "badge-norecibida";
  return `<span class="badge ${clase}">${estado}</span>`;
}
function celdaSeguimiento(c) {
  if (c.llamada_seguimiento_realizada) {
    return `<span class="seguimiento-ok">✔ Realizada</span>`;
  }
  if (c.seguimiento_pendiente) {
    return `<span class="seguimiento-pendiente">⚠ Pendiente (desde ${fmtFecha(c.fecha_seguimiento_sugerida)})</span>`;
  }
  return `<span class="seguimiento-futuro">Prog. ${fmtFecha(c.fecha_seguimiento_sugerida)}</span>`;
}

function filaClienteHtml(c, incluirFechaAprobacion = true) {
  return `
    <td>
      <div class="nombre-cliente">${escapeHtml(c.nombre)}</div>
      <div class="telefono-cliente">${escapeHtml(c.telefono || "")}</div>
    </td>
    <td>${escapeHtml(c.carrier || "-")}</td>
    <td>${escapeHtml(c.numero_poliza || "-")}</td>
    <td>${badgeEstado(c.estado)}</td>
    <td>${badgePoliza(c.estado_poliza)}</td>
    <td>${fmtFecha(c.fecha_venta)}</td>
    ${incluirFechaAprobacion ? `<td>${c.fecha_aprobacion ? fmtFecha(c.fecha_aprobacion) : "-"}</td>` : ""}
    <td>${celdaSeguimiento(c)}</td>
    <td><button class="btn btn-secondary btn-editar" data-id="${c.id}">Ver / Editar</button></td>
  `;
}

function renderTablaEn(tbodySel, vacioSel, clientes, incluirFechaAprobacion = true) {
  const tbody = $(tbodySel);
  const vacio = $(vacioSel);
  tbody.innerHTML = "";

  if (!clientes.length) {
    vacio.hidden = false;
    return;
  }
  vacio.hidden = true;

  for (const c of clientes) {
    const tr = document.createElement("tr");
    tr.innerHTML = filaClienteHtml(c, incluirFechaAprobacion);
    tr.querySelector(".btn-editar").addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirModal(c.id);
    });
    tr.addEventListener("click", () => abrirModal(c.id));
    tbody.appendChild(tr);
  }
}

function renderTabla(clientes) {
  renderTablaEn("#tbodyClientes", "#estadoVacio", clientes, true);
}

// ---------- informe mensual ----------
let MES_ACTUAL_INFORME = new Date().toISOString().slice(0, 7);

async function cargarMesesDisponibles() {
  const meses = await api("/informes/meses");
  const nombresMes = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const sel = $("#selectorMes");
  sel.innerHTML = meses.map((m) => {
    const [anio, mes] = m.mes.split("-");
    const etiqueta = `${nombresMes[parseInt(mes, 10) - 1]} ${anio} (${m.total})`;
    return `<option value="${m.mes}">${etiqueta}</option>`;
  }).join("");
  if (!meses.some((m) => m.mes === MES_ACTUAL_INFORME)) {
    sel.insertAdjacentHTML("afterbegin", `<option value="${MES_ACTUAL_INFORME}">Mes actual (0)</option>`);
  }
  sel.value = MES_ACTUAL_INFORME;
}

function statCard(valor, etiqueta) {
  return `<div class="stat-card"><div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div></div>`;
}

function statCardDesglose(titulo, obj) {
  const items = Object.entries(obj).filter(([, v]) => v > 0);
  const lista = items.length
    ? items.map(([k, v]) => `<li><span>${escapeHtml(k)}</span><span>${v}</span></li>`).join("")
    : `<li><span>Sin datos</span></li>`;
  return `<div class="stat-card desglose"><div class="valor">${titulo}</div><ul>${lista}</ul></div>`;
}

async function cargarInformeMensual() {
  const mes = $("#selectorMes").value || MES_ACTUAL_INFORME;
  MES_ACTUAL_INFORME = mes;
  const informe = await api("/informes/mensual?mes=" + encodeURIComponent(mes));

  $("#statsGrid").innerHTML = [
    statCard(informe.total, "Clientes vendidos"),
    statCard(informe.por_estado["Aprobado"] || 0, "Aprobados"),
    statCard(informe.por_estado["Negado"] || 0, "Negados"),
    statCard(informe.por_estado["En proceso"] || 0, "En proceso"),
    statCard(informe.por_estado_poliza["Recibida"] || 0, "Pólizas recibidas"),
    statCard(informe.seguimiento_pendiente, "Seguimientos pendientes"),
    statCardDesglose("Por carrier", informe.por_carrier),
  ].join("");

  renderTablaEn("#tbodyInforme", "#estadoVacioInforme", informe.clientes, false);
}

function exportarMes() {
  const mes = $("#selectorMes").value || MES_ACTUAL_INFORME;
  window.location.href = API + "/clientes/export?mes=" + encodeURIComponent(mes);
}

function cambiarTab(tab) {
  const esClientes = tab === "clientes";
  $("#tabClientes").classList.toggle("active", esClientes);
  $("#tabInforme").classList.toggle("active", !esClientes);
  $("#vistaClientes").hidden = !esClientes;
  $("#vistaInforme").hidden = esClientes;
  if (!esClientes) cargarInformeMensual();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- modal crear/editar ----------
let clienteActual = null;

function abrirModal(id = null) {
  clienteActual = id ? CLIENTES_CACHE.find((c) => c.id === id) : null;
  $("#modalTitulo").textContent = clienteActual ? "Editar cliente" : "Nuevo cliente";
  $("#clienteId").value = clienteActual ? clienteActual.id : "";
  $("#nombre").value = clienteActual ? clienteActual.nombre : "";
  $("#telefono").value = clienteActual ? clienteActual.telefono || "" : "";
  $("#carrier").value = clienteActual ? clienteActual.carrier || "" : META.carriers[0];
  $("#estado").value = clienteActual ? clienteActual.estado : "En proceso";
  $("#estado_poliza").value = clienteActual ? clienteActual.estado_poliza : "No recibida";
  $("#numero_poliza").value = clienteActual ? clienteActual.numero_poliza || "" : "";
  $("#fecha_aprobacion").value = clienteActual ? clienteActual.fecha_aprobacion || "" : "";
  $("#fecha_venta").value = clienteActual ? clienteActual.fecha_venta : new Date().toISOString().slice(0, 10);
  $("#fecha_llamada_seguimiento").value = clienteActual ? clienteActual.fecha_llamada_seguimiento || "" : "";
  $("#llamada_seguimiento_realizada").checked = clienteActual ? !!clienteActual.llamada_seguimiento_realizada : false;
  $("#btnEliminar").hidden = !clienteActual;

  renderNotas(clienteActual ? clienteActual.notas || [] : []);
  actualizarAvisoSeguimiento();
  $("#autorNota").value = localStorage.getItem("posventa_autor") || "";
  $("#modalCliente").hidden = false;
}

function cerrarModal() {
  $("#modalCliente").hidden = true;
  clienteActual = null;
}

function actualizarAvisoSeguimiento() {
  const fechaVenta = $("#fecha_venta").value;
  const aviso = $("#avisoSeguimiento");
  if (!fechaVenta) { aviso.hidden = true; return; }
  const base = new Date(fechaVenta + "T00:00:00");
  base.setDate(base.getDate() + META.dias_seguimiento);
  const fechaTexto = base.toLocaleDateString("es-ES");
  aviso.hidden = false;
  aviso.textContent = `📞 Llamar para seguimiento (verificar si llegó el folder/póliza) el ${fechaTexto}, dos semanas después de la venta.`;
}

function renderNotas(notas) {
  const cont = $("#listaNotas");
  cont.innerHTML = "";
  if (!notas.length) {
    cont.innerHTML = `<p class="ayuda-importar" style="margin:0;">Sin notas todavía.</p>`;
    return;
  }
  for (const n of notas) {
    const div = document.createElement("div");
    div.className = "nota-item";
    const fecha = n.fecha ? new Date(n.fecha).toLocaleString("es-ES") : "";
    const metaTexto = [fecha, n.autor ? `por ${n.autor}` : ""].filter(Boolean).join(" · ");
    div.innerHTML = `
      <div>
        <div class="nota-texto">${escapeHtml(n.texto)}</div>
        <div class="nota-meta">${escapeHtml(metaTexto)}</div>
      </div>
      <button type="button" class="nota-borrar" data-id="${n.id}" title="Eliminar nota">🗑</button>
    `;
    div.querySelector(".nota-borrar").addEventListener("click", async () => {
      if (!clienteActual) return;
      try {
        const actualizado = await api(`/clientes/${clienteActual.id}/notas/${n.id}`, { method: "DELETE" });
        clienteActual = actualizado;
        renderNotas(actualizado.notas || []);
      } catch (e) { toast(e.message, true); }
    });
    cont.appendChild(div);
  }
}

async function agregarNota() {
  const input = $("#nuevaNota");
  const texto = input.value.trim();
  if (!texto) return;

  if (!clienteActual) {
    toast("Guarda el cliente primero antes de agregar notas");
    return;
  }
  const autor = $("#autorNota").value.trim();
  if (autor) localStorage.setItem("posventa_autor", autor);

  try {
    const actualizado = await api(`/clientes/${clienteActual.id}/notas`, {
      method: "POST",
      body: JSON.stringify({ texto, autor }),
    });
    clienteActual = actualizado;
    renderNotas(actualizado.notas || []);
    input.value = "";
  } catch (e) { toast(e.message, true); }
}

async function guardarCliente(ev) {
  ev.preventDefault();
  const payload = {
    nombre: $("#nombre").value.trim(),
    telefono: $("#telefono").value.trim(),
    carrier: $("#carrier").value,
    estado: $("#estado").value,
    estado_poliza: $("#estado_poliza").value,
    numero_poliza: $("#numero_poliza").value.trim(),
    fecha_aprobacion: $("#fecha_aprobacion").value || null,
    fecha_venta: $("#fecha_venta").value,
    fecha_llamada_seguimiento: $("#fecha_llamada_seguimiento").value || null,
    llamada_seguimiento_realizada: $("#llamada_seguimiento_realizada").checked,
  };
  if (!payload.nombre) { toast("El nombre y apellido es obligatorio", true); return; }

  try {
    if (clienteActual) {
      await api(`/clientes/${clienteActual.id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("Cliente actualizado");
    } else {
      const nuevo = await api("/clientes", { method: "POST", body: JSON.stringify(payload) });
      clienteActual = nuevo;
      toast("Cliente creado");
    }
    await cargarClientes();
    await cargarMesesDisponibles();
    cerrarModal();
  } catch (e) { toast(e.message, true); }
}

async function eliminarCliente() {
  if (!clienteActual) return;
  if (!confirm(`¿Eliminar a ${clienteActual.nombre}? Esta acción no se puede deshacer.`)) return;
  try {
    await api(`/clientes/${clienteActual.id}`, { method: "DELETE" });
    toast("Cliente eliminado");
    await cargarClientes();
    await cargarMesesDisponibles();
    cerrarModal();
  } catch (e) { toast(e.message, true); }
}

// ---------- exportar ----------
function exportarTodo() {
  window.location.href = API + "/clientes/export";
}

// ---------- importar (carga masiva desde CSV/Excel) ----------
function normalizarEncabezado(h) {
  return h.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, "_");
}

const MAPA_ENCABEZADOS = {
  nombre: "nombre", "nombre_y_apellido": "nombre", cliente: "nombre", name: "nombre",
  telefono: "telefono", tel: "telefono", phone: "telefono", celular: "telefono",
  carrier: "carrier", aseguradora: "carrier",
  estado: "estado", status: "estado",
  estado_poliza: "estado_poliza", "recibio_poliza": "estado_poliza",
  numero_poliza: "numero_poliza", "no_poliza": "numero_poliza", "n_poliza": "numero_poliza", "policy_number": "numero_poliza", poliza: "numero_poliza",
  fecha_aprobacion: "fecha_aprobacion", "approval_date": "fecha_aprobacion",
  fecha_venta: "fecha_venta", fecha: "fecha_venta", date: "fecha_venta",
};

function manejarArchivoImportar(ev) {
  const file = ev.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, { defval: "" });

      filasImportarPendientes = filas.map((filaOriginal) => {
        const fila = {};
        for (const key of Object.keys(filaOriginal)) {
          const norm = normalizarEncabezado(key);
          const campo = MAPA_ENCABEZADOS[norm];
          if (campo) fila[campo] = filaOriginal[key];
        }
        return fila;
      }).filter((f) => f.nombre && f.nombre.toString().trim());

      mostrarPreviewImportar();
    } catch (err) {
      toast("No se pudo leer el archivo. Usa un .csv o .xlsx válido.", true);
    }
  };
  reader.readAsArrayBuffer(file);
  ev.target.value = "";
}

function mostrarPreviewImportar() {
  const total = filasImportarPendientes.length;
  $("#resumenImportar").textContent = total
    ? `Se detectaron ${total} cliente(s) en el archivo. Revisa la vista previa antes de confirmar.`
    : `No se encontraron filas con nombre válido en el archivo.`;

  const cont = $("#previewImportar");
  if (!total) { cont.innerHTML = ""; $("#modalImportar").hidden = false; return; }

  const filasHtml = filasImportarPendientes.slice(0, 20).map((f) => `
    <tr>
      <td>${escapeHtml(f.nombre || "")}</td>
      <td>${escapeHtml(f.carrier || "")}</td>
      <td>${escapeHtml(f.numero_poliza || "")}</td>
      <td>${escapeHtml(f.estado || "")}</td>
      <td>${escapeHtml(f.fecha_venta || "")}</td>
    </tr>
  `).join("");

  cont.innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Carrier</th><th>N° Póliza</th><th>Estado</th><th>Fecha venta</th></tr></thead>
      <tbody>${filasHtml}</tbody>
    </table>
    ${total > 20 ? `<p class="ayuda-importar">...y ${total - 20} más.</p>` : ""}
  `;
  $("#modalImportar").hidden = false;
}

async function confirmarImportar() {
  if (!filasImportarPendientes.length) { $("#modalImportar").hidden = true; return; }
  try {
    const resultado = await api("/clientes/import", {
      method: "POST",
      body: JSON.stringify({ clientes: filasImportarPendientes }),
    });
    toast(`Importación completa: ${resultado.creados} agregado(s), ${resultado.omitidos} omitido(s).`);
    filasImportarPendientes = [];
    $("#modalImportar").hidden = true;
    await cargarClientes();
    await cargarMesesDisponibles();
  } catch (e) {
    toast(e.message, true);
  }
}

// ---------- eventos ----------
// IMPORTANTE: los botones se conectan primero, de forma síncrona, ANTES de
// cargar cualquier dato del servidor. Así, aunque la carga inicial falle o
// tarde (por ejemplo, mientras el servidor gratuito de Render está
// "despertando"), los botones (Cancelar, Nuevo cliente, pestañas, etc.)
// siempre responden.
document.addEventListener("DOMContentLoaded", () => {
  $("#tabClientes").addEventListener("click", () => cambiarTab("clientes"));
  $("#tabInforme").addEventListener("click", () => cambiarTab("informe"));
  $("#selectorMes").addEventListener("change", cargarInformeMensual);
  $("#btnExportarMes").addEventListener("click", exportarMes);

  $("#buscar").addEventListener("input", debounce(cargarClientes, 250));
  $("#filtroCarrier").addEventListener("change", cargarClientes);
  $("#filtroEstado").addEventListener("change", cargarClientes);
  $("#filtroSeguimiento").addEventListener("change", cargarClientes);

  $("#btnNuevo").addEventListener("click", () => abrirModal(null));
  $("#cerrarModal").addEventListener("click", cerrarModal);
  $("#btnCancelar").addEventListener("click", cerrarModal);
  $("#modalCliente").addEventListener("click", (ev) => { if (ev.target.id === "modalCliente") cerrarModal(); });

  $("#formCliente").addEventListener("submit", guardarCliente);
  $("#btnEliminar").addEventListener("click", eliminarCliente);
  $("#fecha_venta").addEventListener("change", actualizarAvisoSeguimiento);

  $("#btnAgregarNota").addEventListener("click", agregarNota);
  $("#nuevaNota").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); agregarNota(); }
  });

  $("#btnExportar").addEventListener("click", exportarTodo);
  $("#btnImportar").addEventListener("click", () => $("#inputImportar").click());
  $("#inputImportar").addEventListener("change", manejarArchivoImportar);
  $("#cerrarModalImportar").addEventListener("click", () => { $("#modalImportar").hidden = true; });
  $("#btnCancelarImportar").addEventListener("click", () => { $("#modalImportar").hidden = true; });
  $("#btnConfirmarImportar").addEventListener("click", confirmarImportar);

  cargarDatosIniciales();
});

async function cargarDatosIniciales(intento = 1) {
  try {
    await cargarMeta();
    await cargarClientes();
    await cargarMesesDisponibles();
  } catch (e) {
    console.error(e);
    if (intento < 5) {
      // El servidor gratuito puede tardar en "despertar" tras estar inactivo;
      // reintentamos varias veces antes de avisarle a la persona.
      if (intento === 1) toast("Conectando con el servidor (puede tardar unos segundos)...");
      setTimeout(() => cargarDatosIniciales(intento + 1), 4000);
    } else {
      toast("No se pudo conectar con el servidor. Verifica tu conexión y recarga la página.", true);
    }
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
