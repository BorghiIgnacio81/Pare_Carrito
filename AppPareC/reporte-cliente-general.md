# Reporte general de desarrollo – App de Carga de Pedidos (Pare Carrito)

Fecha: 2026-02-19

Actualización: 2026-02-20

## 1) Objetivo del proyecto
Construir una **web interna** para cargar pedidos con múltiples productos de forma rápida y consistente, con foco en:
- Reducir tiempo de carga manual.
- Evitar errores de unidad/variedad.
- Poder pegar pedidos provenientes de **WhatsApp**.
- Registrar el pedido en el **Google Sheet** existente (y coexistir con respuestas de Google Forms).

Impacto en eficiencia y visualización (administrativo y, a futuro, el cliente):
- El Google Sheet actual contiene **muchas columnas** (cada combinación producto/unidad/variedad suele ser una columna distinta). En el estado actual del Sheet, esto equivale a **199 columnas de producto**.
- La app agrupa esas columnas en **productos únicos**, mostrando una grilla mucho más legible: actualmente son **98 tarjetas**.
- En la práctica, esto simplifica la búsqueda y reduce el “scroll mental” del administrativo: se elige el producto (tarjeta) y luego la unidad/variedad válida según el catálogo real.

## 2) Alcance entregado hasta hoy (qué hace la app)
Este documento describe el alcance del **Módulo 1 – Pedidos** (carga y registro de pedidos). Los módulos siguientes se listan al final como roadmap.
- Página web con grilla de productos, búsqueda y ordenamiento.
- Selección de **cliente**.
- Carga por producto con unidad, variedad (si aplica), cantidad y comentario.
- **Resumen** del pedido con validación de datos.
- Confirmación y guardado del pedido en Google Sheets.
- Importación por texto (WhatsApp): parseo + aplicación automática a la grilla.
- Gestión de **alias** (por cliente) para mejorar el reconocimiento de texto en próximos pedidos.
- Indicadores de **favoritos** por cliente (estrellas con brillo y número) y ordenamiento por favoritos.

## 3) Arquitectura (cómo está armado)
- **Frontend estático**: [index.html](index.html), [styles.css](styles.css), [app.js](app.js).
  - Se abre desde el mismo servidor en `http://localhost:<PORT>/` para que el almacenamiento del navegador (localStorage) funcione estable.
- **Backend Node/Express**: [server.js](server.js).
  - Expone endpoints para leer el Sheet y para escribir una fila de pedido.
  - Se autentica contra Google usando **Service Account**.

Ejecución:
- `npm start` levanta el servidor y sirve tanto la web como la API.

## 4) Integración con Google Sheets
### 4.1 Lectura de catálogo desde el Sheet (mapeo por encabezados)
La app **no hardcodea el catálogo**: lo deriva desde los encabezados del Google Sheet.
- El backend expone [server.js](server.js) → `GET /api/orders` y `GET /api/headers`.
- En el frontend, el bootstrap llama a `/api/orders`, toma la fila de encabezados y usa:
  - [src/catalog/sheetCatalog.js](src/catalog/sheetCatalog.js):
    - Normaliza encabezados (producto, unidad, variante).
    - Agrupa columnas a nivel “producto”, construyendo:
      - Lista de unidades por producto.
      - Lista de variantes.
      - Índice de combos permitidos (unidad+variante) según lo que realmente existe en el Sheet.

Resultado: el “catálogo” mostrado en la web refleja exactamente lo que está disponible en el Sheet.

### 4.2 Escritura del pedido en el Sheet (mapeo de items → columnas)
Al confirmar un pedido:
- El frontend arma un `order` y sus `items` (producto/unidad/variante/cantidad/comentario).
- Luego mapea esos items a columnas usando:
  - [src/catalog/sheetMapping.js](src/catalog/sheetMapping.js):
    - Construye un resolver con los headers reales.
    - Resuelve la columna correcta por `productId + unit + variant`.
    - Soporta casos donde el header no trae unidad (unidad vacía) y aplica reglas de compatibilidad puntuales.

Formato:
- Columna A: fecha/hora (texto)
- Columna B: cliente (ej: `020) Álvarez Eventos`)
- De columna C en adelante: productos (según headers)

### 4.3 Convivencia con Google Forms (análisis y solución)
El Sheet también puede recibir filas desde **Google Forms** (respuestas). Se detectó un comportamiento típico:
- Si una fila escrita por la app queda “fuera de la tabla” de respuestas (por ejemplo, si no tiene dato en columna A), Forms puede insertar nuevas respuestas **arriba**, empujando filas.

Medidas implementadas:
- En el backend, al escribir pedidos se calcula la “siguiente fila” contando celdas no vacías en la **columna A** desde la fila 2.
  - Ver [server.js](server.js) (`fetchColumnADataRowCount` y `POST /api/append-order`).
- La app escribe a un rango explícito `A{row}:<lastColumn>{row}` para evitar efectos de “detección de tabla” cuando hay encabezados vacíos.

Además se agregaron scripts de diagnóstico:
- [scripts/inspect_pedidos_tail.js](scripts/inspect_pedidos_tail.js): inspección de últimas filas.
- [scripts/find_rows_below_table.js](scripts/find_rows_below_table.js): detecta filas debajo de la tabla de Forms.

## 5) Desarrollo de la página (UI/UX)
### 5.1 Secciones principales
- **Header** con:
  - Selector de cliente.
  - Resumen del pedido.
  - Botón “Confirmar pedido”.
- **Productos del pedido**:
  - Búsqueda por texto.
  - Ordenamiento.
  - Grilla de tarjetas (cards) por producto.
- **Salida preparada**: muestra el JSON del pedido (útil para depurar / futura integración).

### 5.2 Grilla tipo “masonry” y comportamiento del resumen
- La grilla ajusta altura de cards para evitar “huecos” visuales.
- El resumen fijo puede cubrir cards en pantallas anchas; el sistema detecta intersección y marca cards como “covered” para mejorar legibilidad.
  - Implementado en [src/ui/layout.js](src/ui/layout.js).

## 6) Favoritos por cliente (ordenamiento + estrellas)
### 6.1 De dónde salen los favoritos
La app calcula “favoritos” leyendo el histórico del mismo Sheet:
- [src/catalog/favorites.js](src/catalog/favorites.js) recorre las filas, suma consumo por cliente y producto, y registra:
  - `count`: consumo acumulado.
  - `lastDate`: última vez que se pidió.
  - `lastOrderIndex`: ranking de recencia por pedido (1 = el último pedido del cliente).
  - También lo hace a nivel de combo `unidad + variante`.

### 6.2 “Favoritos Cliente” (ordenamiento)
En la UI hay un selector “Ordenar” con opción **Favoritos Cliente**:
- Ordena productos según un score basado en consumo y recencia, para mostrar primero lo más probable para ese cliente.
- También “pinean” arriba los productos que ya tienen cantidad cargada en el pedido actual.

### 6.3 Estrellas: brillo y números (qué significan)
Cada card muestra estrellas como indicadores:
- **Brillo (opacity + glow)**
  - Se calcula a partir de cuántos días pasaron desde la última compra.
  - Si fue muy reciente, la estrella se ve más brillante; si fue hace más días, se apaga gradualmente.
- **Número en el centro**
  - Es el `lastOrderIndex` (1 = se pidió en el último pedido, 2 = en el anterior, etc.).
- Hay estrella “principal” por producto y estrellas por fila/combo cuando aplica.

## 7) Botón de WhatsApp e importación por texto
### 7.1 Qué hace el botón “Pegar pedido (WhatsApp)”
- Se habilita cuando se selecciona un cliente.
- Muestra/oculta la caja de importación.
  - UI en [index.html](index.html) y wiring en [src/ui/importBox.js](src/ui/importBox.js).

### 7.2 Cómo se procesa el texto
- El parser está en [src/import/whatsapp.js](src/import/whatsapp.js).
- Soporta variaciones típicas:
  - Cantidades decimales o fracciones (ej: `1/2`).
  - Unidades pegadas (ej: `2kg`, `500gr`).
  - Viñetas/listas.
  - Conversión de `gr` a `Kg`.
  - Normalizaciones frecuentes de escritura.
  - Comentarios entre paréntesis/corchetes que se preservan como comentario del item.
- Agrega heurísticas/advertencias puntuales (ej: cantidades altas de lechuga en unidad → sugerir que quizá era jaula).

### 7.3 Aplicación a la grilla
- Los ítems reconocidos se aplican a la card correspondiente:
  - Reutiliza una fila existente si coincide unidad/variante.
  - Si no existe una fila con esa combinación, crea una nueva fila **solo si la combinación unidad/variante existe en el catálogo derivado del Sheet**.
  - Si una línea pide una variedad/unidad que **no existe en el Sheet**, el ítem **no se carga** (queda como no aplicable/no reconocido), para evitar registrar productos sin columna/precio o combos que no se usan en la operación.

Al confirmar el pedido:
- Si hay productos que no se pueden mapear a columnas del Sheet, la app muestra una advertencia del estilo:
  - “El producto tal no se pudo cargar por no existir en el Sheet. ¿Desea cargar el resto del pedido de igual manera?”
  - Con opciones **Sí/No**.

## 8) Sección Alias (qué es y cómo funciona)
Problema que resuelve:
- Un cliente puede escribir un producto con un nombre distinto al de la planilla (o abreviaciones). Eso hace que el importador no lo “reconozca”.

Solución:
- En la caja de importación hay una sección **Alias**:
  - “Texto del cliente” → “Producto” (y opcionalmente unidad/variante).
  - Se guardan **por cliente** en localStorage, para que los próximos imports los resuelvan automáticamente.

Detalles clave:
- Si una línea no se reconoce, aparece en “No reconocidos” y se puede hacer clic para precargar el texto del alias.
- El sistema también tiene un set de alias globales (base) y reglas especiales para casos históricos (ej: interpretaciones de ciertos nombres).
  - Implementación principal: [src/import/whatsapp.js](src/import/whatsapp.js) (alias storage + helpers) y resolución en [app.js](app.js) (`resolveParsedLineToItem`).
- La UI del form (selects y opciones) se completa dinámicamente desde el catálogo:
  - [src/ui/aliasForm.js](src/ui/aliasForm.js).

## 9) Reglas de negocio y consistencia de unidades/variantes
Además del catálogo derivado por headers, se incorporaron reglas para que la carga sea consistente con cómo se vende y cómo está armado el Sheet (ejemplos):
- Coerción de unidades disponibles por producto.
- Soporte de “modo unidad” (ej: registrar `"3 uni"` cuando el cliente escribe cantidades sin unidad explícita).
- Normalización de variantes “Común/Normal”.
- Reglas puntuales por producto (cuando fue necesario para respetar el formato real de carga).

## 10) Estado actual
- Flujo completo operativo: seleccionar cliente → cargar (manual o WhatsApp) → validar en resumen → confirmar → escribir en Sheet.
- Catálogo y mapeo funcionando sobre encabezados reales del Google Sheet.
- Herramientas de diagnóstico incluidas para el comportamiento con Google Forms.

## 11) Roadmap por módulos (horas estimadas)

> Nota sobre estimativos: horas aproximadas para una implementación **MVP** con el stack actual (Node/Express + Google Sheets). Se estiman **hacia arriba**. No incluyen tiempos de espera por cuentas/dominios/aprobaciones, ni capacitación. Si aparecen cambios de alcance (ej: multi-empresa, permisos finos, panel admin completo), el rango sube.

Importante: **por ahora solo se desarrolla el Módulo 1**. Los módulos 2+ se listan únicamente para **armar presupuesto y plan de fases** con el cliente.

Los siguientes módulos se proponen en base a lo ya construido y a lo que hoy existe en planillas operativas (pestañas como **Remitos**, **Tareas**, **Cobros**, **Fiado**, **Caja**, etc.).

### Módulo 1 — Pedidos (web + WhatsApp) + OCR
Estado actual: **operativo** (carga manual + importación por texto de WhatsApp + guardado en Google Sheet).

Pendientes para cerrar el módulo en un esquema “producción + continuidad”:
- **Deploy/hosting** (pasar de servidor local a internet) **(10–18 hs)**
- **Alta de clientes desde la UI** + plantilla de registro + tabla de clientes **(12–24 hs)**
  - Agregar un formulario/plantilla de alta (registro) para cargar los datos del cliente sin tocar el código.
  - Persistir esos datos en una **tabla de clientes** (base de datos), para que queden **disponibles** aunque no se tenga acceso al WhatsApp compartido.
  - Esto deja preparada la base para el **Módulo 5 (Ficha de cliente)**, que amplía y ordena esa información.
- **OCR de imágenes (WhatsApp)**: permitir subir/pegar una imagen (captura) y extraer ítems para aplicar al pedido **(24–48 hs)**
  - Incluye: UI de carga, OCR (motor a definir), normalización, reuso del parser actual, manejo de errores y un flujo de “revisión” cuando hay dudas.
  - Enfoque sugerido: fase 1 “carga manual de imagen (WhatsApp Web)” y fase 2 opcional con integración directa por API.
- **Robustez de unidades/comentarios (“uni”)** + reportes básicos de incidencias **(12–24 hs)**

### Módulo 2 — Login y acceso de clientes a la página
Objetivo: que cada cliente pueda loguearse y cargar su propio pedido (con permisos/visibilidad acotada).

Incluye (MVP): página de login, **usuario/contraseña** (o contraseña por cliente), roles (admin / cliente), asociación cliente↔usuario, auditoría mínima.

Estimativo: **(24–48 hs)**

### Módulo 3 — Informes automáticos + PDFs (tareas.pdf / imprimir pedidos.pdf)
Objetivo: automatizar reportes operativos y documentos imprimibles.

Incluye (MVP):
- **tareas.pdf**: consolidación diaria/por fecha.
  - En el proceso actual, la información se recopila desde la pestaña **Div Comp** (hoy es “copiar/pegar rápido”). La propuesta es automatizar esa consolidación y generar el PDF directo (sin paso manual).
- **imprimir pedidos.pdf**: salida imprimible de pedidos del día con formato consistente.
  - Separación operativa por flete:
    - La asignación se controla con un selector (combobox) por cliente.
    - Opciones actuales del selector: **Trafic 1**, **Kangoo 1**, **Trafic 2**, **Kangoo 2**, **Trafic 3**, **Kangoo 3**.
  - Regla de negocio a respetar: la lista de clientes que pasan de Flete 1 a Flete 2 llega por WhatsApp con un texto del estilo:
    - `Una lista`
    - `21-22-23-24-3-7-8`
    - `11-12 19`
  - Hoy esto se aplica manualmente en la pestaña **Todos**, modificando la **fila 4** del cliente correspondiente (selector/combobox de flete). En el sistema nuevo se puede:
    - pegar ese mensaje en la app,
    - parsearlo,
    - y actualizar automáticamente la asignación de flete para esos clientes.
- Reportes auxiliares ya identificados: comentarios y “uni”.

Estimativo: **(24–50 hs)**

### Módulo 4 — Remitos (generación, impresión, historial)
Objetivo: generar remitos desde pedidos y mantener un historial (incluyendo estado de cobro cuando aplique).

Incluye (MVP): numeración, plantillas, impresión/descarga PDF, vínculo pedido↔remito, historial y “cobrado/no cobrado”.

Estimativo: **(50–120 hs)**

### Módulo 5 — Ficha de cliente (información y continuidad operativa)
Objetivo: que la operación no dependa de tener acceso al WhatsApp compartido para datos críticos (teléfonos, direcciones, horarios, notas).

Incluye (MVP): datos del cliente (teléfono/s, dirección/es, horarios, persona de contacto, observaciones), búsqueda rápida, y asociación a pedidos/remitos.

Estimativo: **(20–50 hs)**

### Módulo 6 — Compras / pedidos a proveedores
Objetivo: consolidar automáticamente compras a proveedores a partir de pedidos y/o una grilla de “Compras Hoy”.

Incluye (MVP): consolidación por proveedor, cantidades totales, export/impresión, y trazabilidad mínima (qué pedido aportó qué).

Estimativo: **(30–90 hs)**

### Módulo 7 — Caja / cobros / fiado / cuentas
Objetivo: ordenar el circuito de cobro y caja (cobrado, fiado, cuentas) ligado a pedidos/remitos.

Incluye (MVP): registro de cobros, saldo por cliente, estados, reportes por día/semana, y export.

Estimativo: **(40–120 hs)**

### Módulo 8 — Facturación / integración con FACTURY (si aplica)
Objetivo: emitir/componer facturación y/o integrarse con el flujo existente.

Estimativo: **(30–100 hs)**

### Módulo 9 — Operación (backups, monitoreo, soporte)
Objetivo: continuidad en producción.

Incluye (MVP): backups de configuración/alias, logs, alertas básicas, y guía de operación.

Estimativo: **(12–30 hs)**

## 12) Tiempo
- **Hoy (2026-02-20):** 01:32 (contador en curso; todavía no consolidado en el acumulado)
- **Hoy (2026-02-20, estimación híbrida por actividad VS Code):** 00:30
- **Acumulado del proyecto (estimación híbrida: historial VS Code + worklog manual):** 32:20
