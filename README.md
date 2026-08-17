# Posventa Mario Izzo

Sistema de control de posventa para pólizas de vida (IUL, etc.), con el logo de **Toro Impact**.

## ¿Qué incluye?

- Fondo negro con acentos blancos y amarillos, logo Toro Impact en el encabezado.
- Registro de clientes: nombre y apellido, teléfono, carrier (Americo, Mutual of Omaha, National Life Group, Transamerica, Ethos, F&G, American Amicable, Otro).
- Estado de aprobación: **En proceso / Aprobado / Negado**.
- Estado de la póliza: **Recibida / No recibida**.
- Notas con fecha y hora, ilimitadas por cliente (para que tu asistente lleve el historial).
- Recordatorio automático de la llamada de seguimiento a las **2 semanas** de la fecha de venta (se marca en rojo "Pendiente" en la tabla cuando ya toca llamar y aún no se ha marcado como realizada).
- Buscador y filtros por nombre, carrier, estado y "solo seguimiento pendiente".
- Botón para **descargar toda la información** en un archivo CSV (se abre bien en Excel).
- Botón para **importar/agregar clientes en lote** desde un archivo CSV o Excel, en vez de escribirlos uno por uno.

## Cómo correrlo en tu computadora (modo rápido, para probar)

Necesitas tener [Node.js](https://nodejs.org) y una base de datos [PostgreSQL](https://www.postgresql.org) instalados.

```bash
cd posventa-mario-izzo
npm install
export DATABASE_URL="postgresql://usuario:contraseña@localhost:5432/tu_base_de_datos"
npm start
```

Luego abre en el navegador: http://localhost:3000

Los datos se guardan en la base de datos Postgres indicada en `DATABASE_URL` (la tabla `clientes` se crea sola la primera vez que arranca el servidor).

## Publicado en internet

Esta app está pensada para desplegarse en **Render.com** (plan gratuito) con una base de datos Postgres también gratuita de Render, para que tú y tu asistente entren desde cualquier lugar con el mismo link y vean la misma información en tiempo real.

## Plantilla para importar clientes en lote

El archivo que subas (CSV o Excel) debe tener columnas con estos nombres (no importan mayúsculas/minúsculas ni acentos):

| nombre | telefono | carrier | estado | estado_poliza | numero_poliza | fecha_aprobacion | fecha_venta |
|---|---|---|---|---|---|---|---|
| Juan Pérez | 555-1234 | Americo | En proceso | No recibida | POL-123456 | 2026-08-10 | 2026-08-01 |

El botón "Descargar toda la información" genera un CSV con estas mismas columnas, así que también sirve como plantilla de ejemplo.
