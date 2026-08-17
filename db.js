// Capa de acceso a datos usando PostgreSQL (persistente de verdad, a
// diferencia de guardar en un archivo local que se pierde en cada reinicio
// del servidor en planes de hosting gratuitos).
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn(
    "AVISO: no se encontró la variable de entorno DATABASE_URL. Configúrala con la cadena de conexión de tu base de datos Postgres."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT DEFAULT '',
      carrier TEXT DEFAULT '',
      estado TEXT DEFAULT 'En proceso',
      estado_poliza TEXT DEFAULT 'No recibida',
      numero_poliza TEXT DEFAULT '',
      fecha_aprobacion DATE,
      fecha_venta DATE,
      llamada_seguimiento_realizada BOOLEAN DEFAULT false,
      fecha_llamada_seguimiento DATE,
      notas JSONB DEFAULT '[]'::jsonb,
      creado_en TIMESTAMPTZ DEFAULT now(),
      actualizado_en TIMESTAMPTZ DEFAULT now()
    );
  `);
}

module.exports = { pool, init };
