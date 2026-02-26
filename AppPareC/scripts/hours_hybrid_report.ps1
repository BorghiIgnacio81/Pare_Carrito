param(
    [int]$DaysBack = 14,
    [int]$GapMinutes = 45,
    [double]$MinActiveDayMinutes = 30,
    [string]$WorklogFile = (Join-Path (Get-Location).Path 'worklog.csv'),
    [switch]$AsCsv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path

# 1) Generate sessions CSV from VS Code history.
$estimator = Join-Path $root 'scripts\estimate_work_hours_vscode_history.ps1'
if (-not (Test-Path -LiteralPath $estimator)) {
    throw "Missing estimator script: $estimator"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $estimator -DaysBack $DaysBack -GapMinutes $GapMinutes -AsCsv | Out-Null

$sessionsCsv = Join-Path $root 'work-hours-vscode-history-sessions.csv'
if (-not (Test-Path -LiteralPath $sessionsCsv)) {
    throw "Expected sessions CSV not found: $sessionsCsv"
}

$sessions = Import-Csv -LiteralPath $sessionsCsv
if (-not $sessions -or $sessions.Count -eq 0) {
    throw 'No sessions found in sessions CSV.'
}

$autoByDay = $sessions |
    ForEach-Object {
        [pscustomobject]@{
            Date = $_.Date
            Minutes = [double]([string]$_.Minutes -replace ',','.')
            Events = [int]$_.Events
        }
    } |
    Group-Object Date |
    Sort-Object Name |
    ForEach-Object {
        $sumMin = ($_.Group | Measure-Object Minutes -Sum).Sum
        $sumEvents = ($_.Group | Measure-Object Events -Sum).Sum
        $adj = $sumMin
        if ($sumMin -gt 0 -and $sumMin -lt $MinActiveDayMinutes) {
            $adj = $MinActiveDayMinutes
        }
        $ts = [TimeSpan]::FromMinutes($adj)
        [pscustomobject]@{
            Date = $_.Name
            AutoMinutes = [math]::Round($sumMin, 1)
            AutoEvents = $sumEvents
            AutoAdjustedMinutes = [math]::Round($adj, 1)
            AutoAdjustedHhMm = ("{0:00}:{1:00}" -f [math]::Floor($ts.TotalHours), $ts.Minutes)
        }
    }

# 2) Manual adjustments from worklog.csv (optional)
$manualByDay = @{}
if (Test-Path -LiteralPath $WorklogFile) {
    $rows = @(Import-Csv -LiteralPath $WorklogFile)
    if ($rows.Count -gt 0) {
        $rows |
            Where-Object { $_.Date -and $_.NetMinutes } |
            ForEach-Object {
                $d = [string]$_.Date
                $m = [double]([string]$_.NetMinutes -replace ',','.')
                if (-not $manualByDay.ContainsKey($d)) { $manualByDay[$d] = 0 }
                $manualByDay[$d] += $m
            }
    }
}

# 3) Merge: final = max(autoAdjusted, manualMinutes)
$final = $autoByDay |
    ForEach-Object {
        $manual = 0
        if ($manualByDay.ContainsKey($_.Date)) { $manual = [math]::Round($manualByDay[$_.Date], 1) }
        $finalMin = [math]::Max($_.AutoAdjustedMinutes, $manual)
        $ts = [TimeSpan]::FromMinutes($finalMin)
        [pscustomobject]@{
            Date = $_.Date
            AutoMinutes = $_.AutoMinutes
            AutoAdjustedMinutes = $_.AutoAdjustedMinutes
            ManualMinutes = $manual
            FinalMinutes = [math]::Round($finalMin, 1)
            FinalHhMm = ("{0:00}:{1:00}" -f [math]::Floor($ts.TotalHours), $ts.Minutes)
            Events = $_.AutoEvents
        }
    }

$totalFinal = ($final | Measure-Object FinalMinutes -Sum).Sum
$totalTs = [TimeSpan]::FromMinutes($totalFinal)
$totalHhMm = ("{0:00}:{1:00}" -f [math]::Floor($totalTs.TotalHours), $totalTs.Minutes)

Write-Host "--- Hybrid report (VS Code + floor + manual) ---"
Write-Host ("DaysBack={0} GapMinutes={1} MinActiveDayMinutes={2}" -f $DaysBack, $GapMinutes, $MinActiveDayMinutes)
Write-Host ("Total final: {0} minutes ({1} hh:mm)" -f ([math]::Round($totalFinal,1)), $totalHhMm)
Write-Host ""

$final | Format-Table -AutoSize

Write-Host ""
Write-Host "--- Needs review (auto < floor) ---"
$final |
    Where-Object { $_.AutoMinutes -gt 0 -and $_.AutoMinutes -lt $MinActiveDayMinutes -and $_.ManualMinutes -le 0 } |
    Select-Object Date, AutoMinutes, Events |
    Format-Table -AutoSize

if ($AsCsv) {
    $outPath = Join-Path $root 'work-hours-hybrid-final.csv'
    $final | Export-Csv -LiteralPath $outPath -NoTypeInformation -Encoding UTF8
    Write-Host ""
    Write-Host "Wrote $outPath"
}
