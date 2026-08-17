// Capa de almacenamiento simple basada en archivo JSON.
// Suficiente para un equipo pequeño (Mario + asistente). Si el negocio crece
// mucho, esto se puede migrar a Postgres/Supabase sin cambiar la API.
const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data", "clientes.json");

function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ clientes: [] }, null, 2));
  }
}

function read() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { clientes: [] };
  }
}

function write(data) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { read, write };
