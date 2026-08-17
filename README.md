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

Necesitas tener [Node.js](https://nodejs.org) instalado (versión 18 o más reciente).

```bash
cd posventa-mario-izzo
npm install
npm start
```

Luego abre en el navegador: http://localhost:3000

Los datos se guardan en el archivo `data/clientes.json` dentro de esta misma carpeta.

⚠️ Importante: este modo solo funciona en la computadora donde lo corres. Si quieres que tu asistente entre desde otro lugar y ambos vean la misma información en tiempo real, necesitas publicarlo en internet (ver abajo).

## Cómo publicarlo para que tú y tu asistente lo usen desde cualquier lugar

Para tener un link único que ambos puedan abrir (desde la computadora o el celular) con la misma información compartida, este proyecto se puede desplegar en un servicio de hosting gratuito o económico, por ejemplo:

- **Render.com** o **Railway.app**: subes esta carpeta (o la conectas a un repositorio de GitHub) y en unos minutos te dan un link público. Son gratuitos para uso ligero como este.
- **Vercel** o **Floot**: si conectas alguno de estos en Claude (desde los ajustes de conectores), puedo ayudarte a desplegarlo directamente desde aquí sin que tengas que hacerlo tú manualmente.

Cuando quieras, dime cuál opción prefieres y te ayudo con el paso a paso (o lo despliego yo mismo si conectas Vercel/Floot).

## Plantilla para importar clientes en lote

El archivo que subas (CSV o Excel) debe tener columnas con estos nombres (no importan mayúsculas/minúsculas ni acentos):

| nombre | telefono | carrier | estado | estado_poliza | numero_poliza | fecha_aprobacion | fecha_venta |
|---|---|---|---|---|---|---|---|
| Juan Pérez | 555-1234 | Americo | En proceso | No recibida | POL-123456 | 2026-08-10 | 2026-08-01 |

El botón "Descargar toda la información" genera un CSV con estas mismas columnas, así que también sirve como plantilla de ejemplo.
