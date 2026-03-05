# Reglas maestras del proyecto Pare Carrito

Estas reglas aplican en cada sesión y antes de cualquier cambio:

1. Modularización obligatoria
- Si la funcionalidad es nueva, crear un módulo dedicado.
- Si crece la complejidad, dividir en submódulos.
- Evitar mezclar responsabilidades en archivos existentes.

2. Normalización de base de datos obligatoria
- Priorizar tablas maestras y relaciones por claves numéricas (INT/BIGINT) y FKs.
- Evitar duplicación de texto repetitivo en tablas transaccionales.
- Guardar snapshots crudos solo si son necesarios y en campos separados del modelo normalizado.

3. Flujo de control de cambios
- Al terminar un módulo y validar su funcionamiento, confirmar con el usuario si funciona.
- Después de confirmación positiva, realizar commit y push de ese módulo.

4. Seguimiento de tiempo
- Registrar tiempo de sesión y mantener acumulado histórico (>52h) actualizado.
