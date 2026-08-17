const express = require("express");
const cors = require("cors");
const path = require("path");
const { nanoid } = require("nanoid");
const { read, write } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const DIAS_SEGUIMIENTO = 14; // dos semanas

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CARRIERS = [
  "Americo",
  "Mutual of Omaha",
  "National Life Group",
  "Transamerica",
  "Ethos",
  "F&G",
  "American Amicable",
  "Otro",
];

const ESTADOS = ["En proceso", "Aprobado", "Negado"];
const ESTADOS_POLIZA = ["No recibida", "Recibida"];

function proximaLlamada(cliente) {
  if (!cliente.fecha_venta) return null;
  const base = new Date(cliente.fecha_venta + "T00:00:00");
  base.setDate(base.getDate() + DIAS_SEGUIMIENTO);
  return base.toISOString().slice(0, 10);
}

function enriquecerCliente(cliente) {
  const fechaSeguimiento = proximaLlamada(cliente);
  const hoy = new Date().toISOString().slice(0, 10);
  const seguimientoPendiente =
    !cliente.llamada_seguimiento_realizada &&
    fechaSeguimiento !== null &&
    fechaSeguimiento <= hoy;
  return {
    ...cliente,
    fecha_seguimiento_sugerida: fechaSeguimiento,
    seguimiento_pendiente: seguimientoPendiente,
  };
}

// --- Metadatos (listas para los combos del formulario) ---
app.get("/api/meta", (req, res) => {
  res.json({ carriers: CARRIERS, estados: ESTADOS, estados_poliza: ESTADOS_POLIZA, dias_seguimiento: DIAS_SEGUIMIENTO });
});

// --- Listar clientes (con filtros opcionales) ---
app.get("/api/clientes", (req, res) => {
  const { q, carrier, estado, seguimiento_pendiente } = req.query;
  const data = read();
  let clientes = data.clientes.map(enriquecerCliente);

  if (q) {
    const term = q.toLowerCase();
    clientes = clientes.filter((c) => c.nombre.toLowerCase().includes(term));
  }
  if (carrier) clientes = clientes.filter((c) => c.carrier === carrier);
  if (estado) clientes = clientes.filter((c) => c.estado === estado);
  if (seguimiento_pendiente === "true") {
    clientes = clientes.filter((c) => c.seguimiento_pendiente);
  }

  clientes.sort((a, b) => (b.actualizado_en || "").localeCompare(a.actualizado_en || ""));
  res.json(clientes);
});

// --- Exportar todo (CSV descargable) ---
app.get("/api/clientes/export", (req, res) => {
  const data = read();
  const columnas = [
    "nombre",
    "telefono",
    "carrier",
    "estado",
    "estado_poliza",
    "numero_poliza",
    "fecha_aprobacion",
    "fecha_venta",
    "llamada_seguimiento_realizada",
    "fecha_llamada_seguimiento",
    "notas",
  ];
  const escapar = (val) => {
    const s = val === undefined || val === null ? "" : String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const filas = [columnas.join(",")];
  for (const c of data.clientes) {
    const notasTexto = (c.notas || [])
      .map((n) => `${n.fecha ? n.fecha.slice(0, 10) : ""}: ${n.texto}`)
      .join(" | ");
    const fila = [
      c.nombre,
      c.telefono,
      c.carrier,
      c.estado,
      c.estado_poliza,
      c.numero_poliza || "",
      c.fecha_aprobacion || "",
      c.fecha_venta,
      c.llamada_seguimiento_realizada ? "Si" : "No",
      c.fecha_llamada_seguimiento || "",
      notasTexto,
    ].map(escapar);
    filas.push(fila.join(","));
  }

  const csv = "﻿" + filas.join("\n"); // BOM para que Excel muestre bien los acentos
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="posventa-mario-izzo-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
});

// --- Importar varios clientes a la vez (carga masiva) ---
app.post("/api/clientes/import", (req, res) => {
  const filas = Array.isArray(req.body.clientes) ? req.body.clientes : [];
  const data = read();
  const ahora = new Date().toISOString();
  let creados = 0;
  let omitidos = 0;

  for (const fila of filas) {
    const nombre = (fila.nombre || "").toString().trim();
    if (!nombre) {
      omitidos++;
      continue;
    }
    const carrierBruto = (fila.carrier || "").toString().trim();
    const carrierValido = CARRIERS.find(
      (c) => c.toLowerCase() === carrierBruto.toLowerCase()
    );
    const estadoBruto = (fila.estado || "En proceso").toString().trim();
    const estadoValido = ESTADOS.find(
      (e) => e.toLowerCase() === estadoBruto.toLowerCase()
    ) || "En proceso";
    const estadoPolizaBruto = (fila.estado_poliza || "No recibida").toString().trim();
    const estadoPolizaValido = ESTADOS_POLIZA.find(
      (e) => e.toLowerCase() === estadoPolizaBruto.toLowerCase()
    ) || "No recibida";

    data.clientes.push({
      id: nanoid(10),
      nombre,
      telefono: (fila.telefono || "").toString().trim(),
      carrier: carrierValido || carrierBruto || "Otro",
      estado: estadoValido,
      estado_poliza: estadoPolizaValido,
      numero_poliza: (fila.numero_poliza || "").toString().trim(),
      fecha_aprobacion: (fila.fecha_aprobacion || "").toString().trim() || null,
      fecha_venta: fila.fecha_venta || new Date().toISOString().slice(0, 10),
      llamada_seguimiento_realizada: false,
      fecha_llamada_seguimiento: null,
      notas: [],
      creado_en: ahora,
      actualizado_en: ahora,
    });
    creados++;
  }

  write(data);
  res.status(201).json({ creados, omitidos });
});

// --- Obtener un cliente ---
app.get("/api/clientes/:id", (req, res) => {
  const data = read();
  const cliente = data.clientes.find((c) => c.id === req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(enriquecerCliente(cliente));
});

// --- Crear cliente ---
app.post("/api/clientes", (req, res) => {
  const body = req.body || {};
  if (!body.nombre || !body.nombre.trim()) {
    return res.status(400).json({ error: "El nombre y apellido es obligatorio" });
  }
  const ahora = new Date().toISOString();
  const cliente = {
    id: nanoid(10),
    nombre: body.nombre.trim(),
    telefono: body.telefono || "",
    carrier: body.carrier || "",
    estado: body.estado || "En proceso",
    estado_poliza: body.estado_poliza || "No recibida",
    numero_poliza: body.numero_poliza || "",
    fecha_aprobacion: body.fecha_aprobacion || null,
    fecha_venta: body.fecha_venta || new Date().toISOString().slice(0, 10),
    llamada_seguimiento_realizada: false,
    fecha_llamada_seguimiento: null,
    notas: [],
    creado_en: ahora,
    actualizado_en: ahora,
  };
  const data = read();
  data.clientes.push(cliente);
  write(data);
  res.status(201).json(enriquecerCliente(cliente));
});

// --- Actualizar cliente (datos generales) ---
app.put("/api/clientes/:id", (req, res) => {
  const data = read();
  const idx = data.clientes.findIndex((c) => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Cliente no encontrado" });

  const camposPermitidos = [
    "nombre",
    "telefono",
    "carrier",
    "estado",
    "estado_poliza",
    "numero_poliza",
    "fecha_aprobacion",
    "fecha_venta",
    "llamada_seguimiento_realizada",
    "fecha_llamada_seguimiento",
  ];
  const cliente = data.clientes[idx];
  for (const campo of camposPermitidos) {
    if (req.body[campo] !== undefined) cliente[campo] = req.body[campo];
  }
  cliente.actualizado_en = new Date().toISOString();
  data.clientes[idx] = cliente;
  write(data);
  res.json(enriquecerCliente(cliente));
});

// --- Eliminar cliente ---
app.delete("/api/clientes/:id", (req, res) => {
  const data = read();
  const antes = data.clientes.length;
  data.clientes = data.clientes.filter((c) => c.id !== req.params.id);
  if (data.clientes.length === antes) {
    return res.status(404).json({ error: "Cliente no encontrado" });
  }
  write(data);
  res.status(204).end();
});

// --- Agregar nota ---
app.post("/api/clientes/:id/notas", (req, res) => {
  const texto = (req.body.texto || "").trim();
  if (!texto) return res.status(400).json({ error: "La nota no puede estar vacía" });

  const data = read();
  const cliente = data.clientes.find((c) => c.id === req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

  const nota = {
    id: nanoid(8),
    texto,
    autor: req.body.autor || "",
    fecha: new Date().toISOString(),
  };
  cliente.notas = cliente.notas || [];
  cliente.notas.unshift(nota);
  cliente.actualizado_en = nota.fecha;
  write(data);
  res.status(201).json(enriquecerCliente(cliente));
});

// --- Eliminar nota ---
app.delete("/api/clientes/:id/notas/:notaId", (req, res) => {
  const data = read();
  const cliente = data.clientes.find((c) => c.id === req.params.id);
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  cliente.notas = (cliente.notas || []).filter((n) => n.id !== req.params.notaId);
  cliente.actualizado_en = new Date().toISOString();
  write(data);
  res.json(enriquecerCliente(cliente));
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Posventa Mario Izzo corriendo en http://localhost:${PORT}`);
});
