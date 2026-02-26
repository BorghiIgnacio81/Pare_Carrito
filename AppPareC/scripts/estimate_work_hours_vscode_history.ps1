param(
    [string]$WorkspaceRoot = (Get-Location).Path,
    [int]$GapMinutes = 45,
    [int]$DaysBack = 14,
    [string]$VsCodeAppData = "$env:APPDATA\\Code",
    [switch]$AsCsv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-LocalPathFromResource([string]$resource) {
    if (-not $resource) { return $null }
    try {
        $uri = [System.Uri]::new($resource)
        if ($uri.Scheme -ne 'file') { return $null }
        # LocalPath returns decoded path. On Windows it can be like '/c:/Users/...'
        # which .NET Path APIs don't accept. Normalize to 'c:\Users\...'
        $p = $uri.LocalPath
        if ($p -match '^/([A-Za-z]:)/') {
            $p = $p.Substring(1)
        }
        $p = $p -replace '/', '\\'
        return $p
    } catch {
        return $null
    }
}

function Get-EntriesJsonPaths([string]$historyRoot) {
    if (-not (Test-Path -LiteralPath $historyRoot)) { return @() }
    return Get-ChildItem -LiteralPath $historyRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
            $p = Join-Path $_.FullName 'entries.json'
            if (Test-Path -LiteralPath $p) { $p }
        }
}

function Read-Entries([string]$entriesJsonPath) {
    try {
        $raw = Get-Content -LiteralPath $entriesJsonPath -Raw -ErrorAction Stop
        if (-not $raw -or $raw.Trim() -eq '') { return $null }
        return $raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

$workspaceItem = Get-Item -LiteralPath $WorkspaceRoot
if (-not $workspaceItem.PSIsContainer) {
    throw "WorkspaceRoot must be a directory: $WorkspaceRoot"
}

$historyRoot = Join-Path $VsCodeAppData 'User\History'
if (-not (Test-Path -LiteralPath $historyRoot)) {
    throw "VS Code History folder not found: $historyRoot"
}

$since = (Get-Date).AddDays(-1 * $DaysBack)
$gap = [TimeSpan]::FromMinutes($GapMinutes)

$events = @()
$entryFiles = Get-EntriesJsonPaths -historyRoot $historyRoot

foreach ($p in $entryFiles) {
    $obj = Read-Entries -entriesJsonPath $p
    if (-not $obj) { continue }

    $localPath = Get-LocalPathFromResource -resource $obj.resource
    if (-not $localPath) { continue }

    # Normalize case + separators.
    $ws = [System.IO.Path]::GetFullPath($WorkspaceRoot).TrimEnd('\') + '\'
    $lp = [System.IO.Path]::GetFullPath($localPath)

    if (-not $lp.StartsWith($ws, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
    }

    if (-not $obj.entries) { continue }

    foreach ($e in $obj.entries) {
        if (-not $e.timestamp) { continue }
        $when = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$e.timestamp).LocalDateTime
        if ($when -lt $since) { continue }
        $events += [pscustomobject]@{
            When = $when
            File = $lp.Substring($ws.Length)
            Source = [string]$e.source
        }
    }
}

if (-not $events -or $events.Count -eq 0) {
    Write-Host "No VS Code History events found for this workspace in the last $DaysBack days."
    Write-Host "HistoryRoot: $historyRoot"
    return
}

$events = @($events | Sort-Object When)

# Build sessions.
$sessions = @()
$sessionStart = $events[0].When
$sessionEnd = $events[0].When
$sessionCountEvents = 1

for ($i = 1; $i -lt $events.Count; $i++) {
    $t = $events[$i].When
    if (($t - $sessionEnd) -le $gap) {
        $sessionEnd = $t
        $sessionCountEvents++
        continue
    }

    $sessions += [pscustomobject]@{
        Date = $sessionStart.Date
        Start = $sessionStart
        End = $sessionEnd
        Minutes = [math]::Round((New-TimeSpan -Start $sessionStart -End $sessionEnd).TotalMinutes, 1)
        Events = $sessionCountEvents
    }

    $sessionStart = $t
    $sessionEnd = $t
    $sessionCountEvents = 1
}

$sessions += [pscustomobject]@{
    Date = $sessionStart.Date
    Start = $sessionStart
    End = $sessionEnd
    Minutes = [math]::Round((New-TimeSpan -Start $sessionStart -End $sessionEnd).TotalMinutes, 1)
    Events = $sessionCountEvents
}

$byDay = $sessions |
    Group-Object { $_.Date.ToString('yyyy-MM-dd') } |
    Sort-Object Name |
    ForEach-Object {
        $total = ($_.Group | Measure-Object Minutes -Sum).Sum
        $eventSum = ($_.Group | Measure-Object Events -Sum).Sum
        $ts = [TimeSpan]::FromMinutes($total)
        [pscustomobject]@{
            Date = $_.Name
            Sessions = $_.Count
            TotalMinutes = [math]::Round($total, 1)
            TotalHours = [math]::Round($total / 60, 2)
            TotalHhMm = ("{0:00}:{1:00}" -f [math]::Floor($ts.TotalHours), $ts.Minutes)
            Events = $eventSum
        }
    }

$totalMinutes = ($sessions | Measure-Object Minutes -Sum).Sum
$totalHours = [math]::Round($totalMinutes / 60, 2)
$totalTs = [TimeSpan]::FromMinutes($totalMinutes)
$totalHhMm = ("{0:00}:{1:00}" -f [math]::Floor($totalTs.TotalHours), $totalTs.Minutes)

if ($AsCsv) {
    $outPath = Join-Path $WorkspaceRoot "work-hours-vscode-history-sessions.csv"
    $sessions |
        Select-Object @{Name='Date';Expression={$_.Date.ToString('yyyy-MM-dd')}}, @{Name='Start';Expression={$_.Start.ToString('yyyy-MM-dd HH:mm:ss')}}, @{Name='End';Expression={$_.End.ToString('yyyy-MM-dd HH:mm:ss')}}, Minutes, Events |
        Export-Csv -Path $outPath -NoTypeInformation -Encoding UTF8
    Write-Host "Wrote $outPath"
}

Write-Host "--- VS Code Local History estimate ---"
Write-Host ("Workspace: {0}" -f $WorkspaceRoot)
Write-Host ("HistoryRoot: {0}" -f $historyRoot)
Write-Host ("DaysBack: {0} (since {1})" -f $DaysBack, $since)
Write-Host ("GapMinutes: {0}" -f $GapMinutes)
Write-Host ("Events: {0}" -f $events.Count)
Write-Host ("Sessions: {0}" -f $sessions.Count)
Write-Host ("Total: {0} minutes ({1} hours, {2} hh:mm)" -f ([math]::Round($totalMinutes,1)), $totalHours, $totalHhMm)
Write-Host ""
Write-Host "--- By day ---"
$byDay | Format-Table -AutoSize

Write-Host ""
Write-Host "--- Sessions ---"
$sessions |
    ForEach-Object {
        $ts = [TimeSpan]::FromMinutes($_.Minutes)
        $_ | Add-Member -NotePropertyName HhMm -NotePropertyValue ("{0:00}:{1:00}" -f [math]::Floor($ts.TotalHours), $ts.Minutes) -PassThru
    } |
    Sort-Object Start |
    Format-Table -AutoSize

Write-Host ""
Write-Host "--- Top touched files (by events) ---"
$events |
    Group-Object File |
    Sort-Object Count -Descending |
    Select-Object -First 15 |
    ForEach-Object {
        [pscustomobject]@{ File = $_.Name; Events = $_.Count }
    } | Format-Table -AutoSize
