# Uso diario de worklog (Pare Carrito)

## Comandos base

Desde `AppPareC`:

- Iniciar sesión:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\worklog.ps1 start -Note "Qué vas a hacer"`

- Ver estado en cualquier momento (muestra inicio, acumulado y faltante a 52h):
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\worklog.ps1 status -TargetHours 52`

- Cerrar sesión:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\worklog.ps1 stop -BreakMinutes 0 -TargetHours 52`

- Reporte por día:
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\worklog.ps1 report -TargetHours 52`

## Qué garantiza ahora

- Siempre informa hora exacta de inicio de la sesión activa.
- Siempre informa minutos acumulados cerrados (`worklog.csv`).
- Siempre informa total acumulado incluyendo sesión en curso.
- Siempre informa faltante contra objetivo (`TargetHours`, default recomendado 52).

## Fuente única de verdad (unificada)

- Archivo oficial: `scripts/time-tracking.config.json`.
- Regla aplicada: `Total oficial = checkpoint confirmado + minutos registrados después del checkpoint`.
- Checkpoint actual: `2026-03-04 = 47h`.
- `work-hours-hybrid-final.csv` queda como histórico auxiliar, no como total oficial.

## Nota práctica

Si `status` dice `No running session`, primero ejecutar `start`.
Si `start` dice `Already running`, la sesión ya está activa y debes usar `status` o `stop`.
