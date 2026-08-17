const express = require("express");
const cors = require("cors");
const path = require("path");
const { nanoid } = require("nanoid");
const { pool, init } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const DIAS_SEGUIMIENTO = 14; // dos semanas

app.use(cors());
app.use(express.json());

// --- Archivos del frontend (rutas explícitas, sin exponer el código del servidor) ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/app.js", (req, res) => res.sendFile(path.join(__dirname, "app.js")));
app.get("/logo-toro-impact.jpeg", (req, res) =>
  res.sendFile(path.join(__dirname, "logo-toro-impact.jpeg"))
);

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

function proximaLlamada(fechaVenta) {
  if (!fechaVenta) return null;
  const base = new Date(fechaVenta);
  base.setUTCDate(base.getUTCDate() + DIAS_SEGUIMIENTO);
  return base.toISOString().slice(0, 10);
}

function soloFecha(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

function enriquecerCliente(row) {
  const cliente = {
    ...row,
    fecha_venta: soloFecha(row.fecha_venta),
    fecha_aprobacion: soloFecha(row.fecha_aprobacion),
    fecha_llamada_seguimiento: soloFecha(row.fecha_llamada_seguimiento),
    creado_en: row.creado_en instanceof Date ? row.creado_en.toISOString() : row.creado_en,
    actualizado_en: row.actualizado_en instanceof Date ? row.actualizado_en.toISOString() : row.actualizado_en,
    notas: row.notas || [],
  };
  const fechaSeguimiento = proximaLlamada(cliente.fecha_venta);
  const hoy = new Date().toISOString().slice(0, 10);
  cliente.fecha_seguimiento_sugerida = fechaSeguimiento;
  cliente.seguimiento_pendiente =
    !cliente.llamada_seguimiento_realizada &&
    fechaSeguimiento !== null &&
    fechaSeguimiento <= hoy;
  return cliente;
}

// --- Metadatos (listas para los combos del formulario) ---
app.get("/api/meta", (req, res) => {
  res.json({ carriers: CARRIERS, estados: ESTADOS, estados_poliza: ESTADOS_POLIZA, dias_seguimiento: DIAS_SEGUIMIENTO });
});

// --- Listar clientes (con filtros opcionales) ---
app.get("/api/clientes", async (req, res, next) => {
  try {
    const { q, carrier, estado, seguimiento_pendiente, mes } = req.query;
    const { rows } = await pool.query("SELECT * FROM clientes ORDER BY fecha_venta DESC, actualizado_en DESC");
    let clientes = rows.map(enriquecerCliente);

    if (q) {
      const term = q.toLowerCase();
      clientes = clientes.filter((c) => c.nombre.toLowerCase().includes(term));
    }
    if (carrier) clientes = clientes.filter((c) => c.carrier === carrier);
    if (estado) clientes = clientes.filter((c) => c.estado === estado);
    if (seguimiento_pendiente === "true") {
      clientes = clientes.filter((c) => c.seguimiento_pendiente);
    }
    if (mes) {
      clientes = clientes.filter((c) => c.fecha_venta && c.fecha_venta.slice(0, 7) === mes);
    }
    res.json(clientes);
  } catch (err) { next(err); }
});

// --- Lista de meses que tienen clientes (para el selector del informe) ---
app.get("/api/informes/meses", async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT to_char(fecha_venta, 'YYYY-MM') AS mes, COUNT(*)::int AS total
       FROM clientes
       WHERE fecha_venta IS NOT NULL
       GROUP BY mes
       ORDER BY mes DESC`
    );
    const mesActual = new Date().toISOString().slice(0, 7);
    if (!rows.some((r) => r.mes === mesActual)) {
      rows.unshift({ mes: mesActual, total: 0 });
    }
    res.json(rows);
  } catch (err) { next(err); }
});

// --- Informe mensual detallado ---
app.get("/api/informes/mensual", async (req, res, next) => {
  try {
    const mes = (req.query.mes || new Date().toISOString().slice(0, 7)).toString();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: "Formato de mes inválido, usa YYYY-MM" });
    }

    const { rows } = await pool.query(
      `SELECT * FROM clientes WHERE to_char(fecha_venta, 'YYYY-MM') = $1 ORDER BY fecha_venta ASC`,
      [mes]
    );
    const clientes = rows.map(enriquecerCliente);

    const porEstado = {};
    for (const e of ESTADOS) porEstado[e] = 0;
    const porEstadoPoliza = {};
    for (const e of ESTADOS_POLIZA) porEstadoPoliza[e] = 0;
    const porCarrier = {};
    let seguimientoPendiente = 0;

    for (const c of clientes) {
      porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
      porEstadoPoliza[c.estado_poliza] = (porEstadoPoliza[c.estado_poliza] || 0) + 1;
      if (c.carrier) porCarrier[c.carrier] = (porCarrier[c.carrier] || 0) + 1;
      if (c.seguimiento_pendiente) seguimientoPendiente++;
    }

    res.json({
      mes,
      total: clientes.length,
      por_estado: porEstado,
      por_estado_poliza: porEstadoPoliza,
      por_carrier: porCarrier,
      seguimiento_pendiente: seguimientoPendiente,
      clientes,
    });
  } catch (err) { next(err); }
});

// --- Exportar todo (CSV descargable) ---
app.get("/api/clientes/export", async (req, res, next) => {
  try {
    const mes = req.query.mes;
    const { rows } = mes && /^\d{4}-\d{2}$/.test(mes)
      ? await pool.query(
          `SELECT * FROM clientes WHERE to_char(fecha_venta, 'YYYY-MM') = $1 ORDER BY fecha_venta ASC`,
          [mes]
        )
      : await pool.query("SELECT * FROM clientes ORDER BY actualizado_en DESC");
    const clientes = rows.map(enriquecerCliente);

    const columnas = [
      "nombre", "telefono", "carrier", "estado", "estado_poliza",
      "numero_poliza", "fecha_aprobacion", "fecha_venta",
      "llamada_seguimiento_realizada", "fecha_llamada_seguimiento", "notas",
    ];
    const escapar = (val) => {
      const s = val === undefined || val === null ? "" : String(val);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const filas = [columnas.join(",")];
    for (const c of clientes) {
      const notasTexto = (c.notas || [])
        .map((n) => `${n.fecha ? n.fecha.slice(0, 10) : ""}: ${n.texto}`)
        .join(" | ");
      const fila = [
        c.nombre, c.telefono, c.carrier, c.estado, c.estado_poliza,
        c.numero_poliza || "", c.fecha_aprobacion || "", c.fecha_venta,
        c.llamada_seguimiento_realizada ? "Si" : "No",
        c.fecha_llamada_seguimiento || "", notasTexto,
      ].map(escapar);
      filas.push(fila.join(","));
    }

    const csv = "﻿" + filas.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const sufijo = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="posventa-mario-izzo-${sufijo}.csv"`
    );
    res.send(csv);
  } catch (err) { next(err); }
});

// --- Importar varios clientes a la vez (carga masiva) ---
app.post("/api/clientes/import", async (req, res, next) => {
  try {
    const filas = Array.isArray(req.body.clientes) ? req.body.clientes : [];
    let creados = 0;
    let omitidos = 0;

    for (const fila of filas) {
      const nombre = (fila.nombre || "").toString().trim();
      if (!nombre) { omitidos++; continue; }

      const carrierBruto = (fila.carrier || "").toString().trim();
      const carrierValido = CARRIERS.find((c) => c.toLowerCase() === carrierBruto.toLowerCase());
      const estadoBruto = (fila.estado || "En proceso").toString().trim();
      const estadoValido = ESTADOS.find((e) => e.toLowerCase() === estadoBruto.toLowerCase()) || "En proceso";
      const estadoPolizaBruto = (fila.estado_poliza || "No recibida").toString().trim();
      const estadoPolizaValido = ESTADOS_POLIZA.find((e) => e.toLowerCase() === estadoPolizaBruto.toLowerCase()) || "No recibida";

      await pool.query(
        `INSERT INTO clientes (id, nombre, telefono, carrier, estado, estado_poliza, numero_poliza, fecha_aprobacion, fecha_venta, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb)`,
        [
          nanoid(10),
          nombre,
          (fila.telefono || "").toString().trim(),
          carrierValido || carrierBruto || "Otro",
          estadoValido,
          estadoPolizaValido,
          (fila.numero_poliza || "").toString().trim(),
          fila.fecha_aprobacion || null,
          fila.fecha_venta || new Date().toISOString().slice(0, 10),
        ]
      );
      creados++;
    }
    res.status(201).json({ creados, omitidos });
  } catch (err) { next(err); }
});

// --- Obtener un cliente ---
app.get("/api/clientes/:id", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM clientes WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(enriquecerCliente(rows[0]));
  } catch (err) { next(err); }
});

// --- Crear cliente ---
app.post("/api/clientes", async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.nombre || !body.nombre.trim()) {
      return res.status(400).json({ error: "El nombre y apellido es obligatorio" });
    }
    const { rows } = await pool.query(
      `INSERT INTO clientes (id, nombre, telefono, carrier, estado, estado_poliza, numero_poliza, fecha_aprobacion, fecha_venta, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]'::jsonb)
       RETURNING *`,
      [
        nanoid(10),
        body.nombre.trim(),
        body.telefono || "",
        body.carrier || "",
        body.estado || "En proceso",
        body.estado_poliza || "No recibida",
        body.numero_poliza || "",
        body.fecha_aprobacion || null,
        body.fecha_venta || new Date().toISOString().slice(0, 10),
      ]
    );
    res.status(201).json(enriquecerCliente(rows[0]));
  } catch (err) { next(err); }
});

// --- Actualizar cliente (datos generales) ---
app.put("/api/clientes/:id", async (req, res, next) => {
  try {
    const camposPermitidos = [
      "nombre", "telefono", "carrier", "estado", "estado_poliza",
      "numero_poliza", "fecha_aprobacion", "fecha_venta",
      "llamada_seguimiento_realizada", "fecha_llamada_seguimiento",
    ];
    const sets = [];
    const valores = [];
    let i = 1;
    for (const campo of camposPermitidos) {
      if (req.body[campo] !== undefined) {
        sets.push(`${campo} = $${i++}`);
        valores.push(req.body[campo] === "" && campo.startsWith("fecha_") ? null : req.body[campo]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: "Nada para actualizar" });
    sets.push(`actualizado_en = now()`);
    valores.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE clientes SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(enriquecerCliente(rows[0]));
  } catch (err) { next(err); }
});

// --- Eliminar cliente ---
app.delete("/api/clientes/:id", async (req, res, next) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM clientes WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Cliente no encontrado" });
    res.status(204).end();
  } catch (err) { next(err); }
});

// --- Agregar nota ---
app.post("/api/clientes/:id/notas", async (req, res, next) => {
  try {
    const texto = (req.body.texto || "").trim();
    if (!texto) return res.status(400).json({ error: "La nota no puede estar vacía" });

    const nota = { id: nanoid(8), texto, autor: req.body.autor || "", fecha: new Date().toISOString() };
    const { rows } = await pool.query(
      `UPDATE clientes
       SET notas = COALESCE(notas, '[]'::jsonb) || $1::jsonb, actualizado_en = now()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify([nota]), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });

    // Poner la nota nueva primero (más reciente arriba)
    rows[0].notas = [nota, ...(rows[0].notas || []).filter((n) => n.id !== nota.id)];
    res.status(201).json(enriquecerCliente(rows[0]));
  } catch (err) { next(err); }
});

// --- Eliminar nota ---
app.delete("/api/clientes/:id/notas/:notaId", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM clientes WHERE id = $1", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Cliente no encontrado" });

    const nuevasNotas = (rows[0].notas || []).filter((n) => n.id !== req.params.notaId);
    const { rows: actualizado } = await pool.query(
      `UPDATE clientes SET notas = $1::jsonb, actualizado_en = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(nuevasNotas), req.params.id]
    );
    res.json(enriquecerCliente(actualizado[0]));
  } catch (err) { next(err); }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Posventa Mario Izzo corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("No se pudo inicializar la base de datos:", err);
    process.exit(1);
  });
