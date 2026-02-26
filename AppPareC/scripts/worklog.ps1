param(
    [Parameter(Position=0)]
    [ValidateSet('add','add-minutes','start','stop','status','report')]
    [string]$Command,

    [string]$Date,
    [string]$Start,
    [string]$End,
    [double]$Minutes,
    [int]$BreakMinutes = 0,
    [string]$Note = "",

    # Optional: adjust running session by inactivity in the workspace.
    [string]$WorkspaceRoot = (Get-Location).Path,
    [string]$VsCodeAppData = "$env:APPDATA\\Code",
    [int]$InactivityGapMinutes = 0,

    [string]$File = (Join-Path (Get-Location).Path 'worklog.csv')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Parse-Date([string]$s) {
    if (-not $s -or $s.Trim() -eq '') { throw 'Date is required (YYYY-MM-DD or DD/MM/YYYY).' }
    [System.IFormatProvider]$cult = [System.Globalization.CultureInfo]::GetCultureInfo('es-AR')

    [string[]]$formats = @('yyyy-MM-dd','dd/MM/yyyy','d/M/yyyy')
    [datetime]$dt = [datetime]::MinValue
    if ([datetime]::TryParseExact($s, $formats, $cult, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$dt)) {
        return $dt.Date
    }

    if ([datetime]::TryParse($s, $cult, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$dt)) {
        return $dt.Date
    }

    throw "Invalid Date: $s"
}

function Parse-Time([datetime]$date, [string]$s) {
    if (-not $s -or $s.Trim() -eq '') { throw 'Start/End time is required (HH:mm).' }
    [System.IFormatProvider]$cult = [System.Globalization.CultureInfo]::GetCultureInfo('es-AR')

    [datetime]$t = [datetime]::MinValue
    [string[]]$formats = @('H:mm','HH:mm','H','HH')
    if ([datetime]::TryParseExact($s, $formats, $cult, [System.Globalization.DateTimeStyles]::NoCurrentDateDefault, [ref]$t)) {
        return [datetime]::new($date.Year, $date.Month, $date.Day, $t.Hour, $t.Minute, 0)
    }

    throw "Invalid time: $s"
}

function Ensure-File([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) {
        'Date,Start,End,BreakMinutes,NetMinutes,Note' | Out-File -LiteralPath $path -Encoding utf8
    }
}

function Get-RunningPath([string]$csvPath) {
    $dir = Split-Path -Parent $csvPath
    return (Join-Path $dir '.worklog.running.json')
}

function Write-Running([string]$path, [datetime]$start, [string]$note) {
    $obj = [pscustomobject]@{
        Start = $start.ToString('yyyy-MM-dd HH:mm:ss')
        Note = $note
    }
    ($obj | ConvertTo-Json -Depth 3) | Out-File -LiteralPath $path -Encoding utf8
}

function Read-Running([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try {
        $raw = Get-Content -LiteralPath $path -Raw
        if (-not $raw -or $raw.Trim() -eq '') { return $null }
        return ($raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Remove-Running([string]$path) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
}

Ensure-File -path $File
$runningPath = Get-RunningPath -csvPath $File

function Get-LocalPathFromResource([string]$resource) {
    if (-not $resource) { return $null }
    try {
        $uri = [System.Uri]::new($resource)
        if ($uri.Scheme -ne 'file') { return $null }
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

function Get-VsCodeHistoryLastWorkspaceEvent([string]$workspaceRoot, [datetime]$since, [string]$vsCodeAppData) {
    if (-not $workspaceRoot -or -not (Test-Path -LiteralPath $workspaceRoot)) { return $null }
    if (-not $vsCodeAppData) { return $null }
    $historyRoot = Join-Path $vsCodeAppData 'User\History'
    if (-not (Test-Path -LiteralPath $historyRoot)) { return $null }

    $ws = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\\') + '\\'
    $last = $null

    $dirs = Get-ChildItem -LiteralPath $historyRoot -Directory -ErrorAction SilentlyContinue
    foreach ($d in $dirs) {
        $p = Join-Path $d.FullName 'entries.json'
        if (-not (Test-Path -LiteralPath $p)) { continue }
        try {
            $raw = Get-Content -LiteralPath $p -Raw -ErrorAction Stop
            if (-not $raw -or $raw.Trim() -eq '') { continue }
            $obj = $raw | ConvertFrom-Json
        } catch {
            continue
        }

        $localPath = Get-LocalPathFromResource -resource $obj.resource
        if (-not $localPath) { continue }

        try {
            $lp = [System.IO.Path]::GetFullPath($localPath)
        } catch {
            continue
        }
        if (-not $lp.StartsWith($ws, [System.StringComparison]::OrdinalIgnoreCase)) { continue }

        if (-not $obj.entries) { continue }
        foreach ($e in $obj.entries) {
            if (-not $e.timestamp) { continue }
            $when = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$e.timestamp).LocalDateTime
            if ($when -lt $since) { continue }
            if (-not $last -or $when -gt $last) { $last = $when }
        }
    }
    return $last
}

function Get-LastWorkspaceEventFromSessionsCsv([string]$workspaceRoot, [datetime]$since) {
    if (-not $workspaceRoot) { return $null }
    $csvPath = Join-Path $workspaceRoot 'work-hours-vscode-history-sessions.csv'
    if (-not (Test-Path -LiteralPath $csvPath)) { return $null }
    try {
        $rows = Import-Csv -LiteralPath $csvPath
    } catch {
        return $null
    }
    if (-not $rows -or $rows.Count -eq 0) { return $null }

    $last = $null
    foreach ($r in $rows) {
        $endRaw = [string]$r.End
        if (-not $endRaw) { continue }
        try {
            $end = [datetime]::ParseExact($endRaw, 'yyyy-MM-dd HH:mm:ss', $null)
        } catch {
            continue
        }
        if ($end -lt $since) { continue }
        if (-not $last -or $end -gt $last) { $last = $end }
    }
    return $last
}

function Ensure-WorkspaceSessionsCsv([string]$workspaceRoot, [int]$gapMinutes, [int]$daysBack) {
    if (-not $workspaceRoot -or -not (Test-Path -LiteralPath $workspaceRoot)) { return $null }
    $estimator = Join-Path $workspaceRoot 'scripts\estimate_work_hours_vscode_history.ps1'
    if (-not (Test-Path -LiteralPath $estimator)) { return $null }
    # Generate sessions CSV (same format used by hours_hybrid_report.ps1)
    & powershell -NoProfile -ExecutionPolicy Bypass -File $estimator -WorkspaceRoot $workspaceRoot -GapMinutes $gapMinutes -DaysBack $daysBack -AsCsv | Out-Null
    $csvPath = Join-Path $workspaceRoot 'work-hours-vscode-history-sessions.csv'
    if (Test-Path -LiteralPath $csvPath) { return $csvPath }
    return $null
}

function Read-WorkspaceSessions([string]$csvPath) {
    if (-not $csvPath -or -not (Test-Path -LiteralPath $csvPath)) { return @() }
    try {
        $rows = Import-Csv -LiteralPath $csvPath
    } catch {
        return @()
    }
    if (-not $rows -or $rows.Count -eq 0) { return @() }
    $sessions = @()
    foreach ($r in $rows) {
        try {
            $start = [datetime]::ParseExact([string]$r.Start, 'yyyy-MM-dd HH:mm:ss', $null)
            $end = [datetime]::ParseExact([string]$r.End, 'yyyy-MM-dd HH:mm:ss', $null)
        } catch {
            continue
        }
        $sessions += [pscustomobject]@{ Start = $start; End = $end }
    }
    return ($sessions | Sort-Object Start)
}

function Get-ActiveWindowsFromSessions([datetime]$sessionStart, [datetime]$now, [int]$gapMinutes, [object[]]$sessions) {
    # Convert VS Code sessions to "active windows" with a tail of +gapMinutes.
    $gap = [TimeSpan]::FromMinutes($gapMinutes)
    $windows = @()
    foreach ($s in ($sessions | Sort-Object Start)) {
        if ($s.End -lt $sessionStart) { continue }
        if ($s.Start -gt $now) { continue }
        $start = if ($s.Start -gt $sessionStart) { $s.Start } else { $sessionStart }
        $endCandidate = $s.End + $gap
        $end = if ($endCandidate -lt $now) { $endCandidate } else { $now }
        if ($end -le $start) { continue }
        $windows += [pscustomobject]@{ Start = $start; End = $end }
    }
    return $windows
}

function Get-AdjustedMinutesFromInactivity([datetime]$sessionStart, [datetime]$now, [int]$gapMinutes, [string]$workspaceRoot) {
    if ($gapMinutes -le 0) {
        $raw = [math]::Round((New-TimeSpan -Start $sessionStart -End $now).TotalMinutes, 1)
        return [pscustomobject]@{ Adjusted = $false; RawMinutes = $raw; AdjustedMinutes = $raw; Windows = @() }
    }

    $daysBack = [math]::Max(2, [int][math]::Ceiling((New-TimeSpan -Start $sessionStart -End $now).TotalDays) + 1)
    $csvPath = Ensure-WorkspaceSessionsCsv -workspaceRoot $workspaceRoot -gapMinutes $gapMinutes -daysBack $daysBack
    $sessions = Read-WorkspaceSessions -csvPath $csvPath

    $raw = [math]::Round((New-TimeSpan -Start $sessionStart -End $now).TotalMinutes, 1)
    if (-not $sessions -or $sessions.Count -eq 0) {
        return [pscustomobject]@{ Adjusted = $false; RawMinutes = $raw; AdjustedMinutes = $raw; Windows = @() }
    }

    $windows = Get-ActiveWindowsFromSessions -sessionStart $sessionStart -now $now -gapMinutes $gapMinutes -sessions $sessions
    $total = 0
    foreach ($w in $windows) {
        $total += (New-TimeSpan -Start $w.Start -End $w.End).TotalMinutes
    }
    $adj = [math]::Round($total, 1)
    return [pscustomobject]@{ Adjusted = $true; RawMinutes = $raw; AdjustedMinutes = $adj; Windows = $windows }
}

switch ($Command) {
    'status' {
        $r = Read-Running -path $runningPath
        if (-not $r) {
            Write-Host 'No running session.'
            return
        }

        $sessionStart = [datetime]::ParseExact([string]$r.Start, 'yyyy-MM-dd HH:mm:ss', $null)
        $now = Get-Date
        $calc = Get-AdjustedMinutesFromInactivity -sessionStart $sessionStart -now $now -gapMinutes $InactivityGapMinutes -workspaceRoot $WorkspaceRoot
        if ($calc.Adjusted) {
            $wCount = if ($calc.Windows) { $calc.Windows.Count } else { 0 }
            Write-Host ("Running since {0} ({1} min adjusted by inactivity in {2} windows, {3} min raw). Gap: {4} min. Note: {5}" -f $sessionStart, $calc.AdjustedMinutes, $wCount, $calc.RawMinutes, $InactivityGapMinutes, [string]$r.Note)
        } else {
            Write-Host ("Running since {0} ({1} min so far). Note: {2}" -f $sessionStart, $calc.RawMinutes, [string]$r.Note)
        }
        return
    }

    'start' {
        $existing = Read-Running -path $runningPath
        if ($existing) {
            Write-Host ("Already running since {0}. Use 'stop' first." -f [string]$existing.Start)
            return
        }

        $now = Get-Date
        Write-Running -path $runningPath -start $now -note $Note
        Write-Host ("Started: {0}" -f $now.ToString('yyyy-MM-dd HH:mm:ss'))
        if ($Note -and $Note.Trim() -ne '') { Write-Host ("Note: {0}" -f $Note) }
        return
    }

    'stop' {
        $r = Read-Running -path $runningPath
        if (-not $r) {
            Write-Host 'No running session to stop.'
            return
        }

        $sessionStart = [datetime]::ParseExact([string]$r.Start, 'yyyy-MM-dd HH:mm:ss', $null)
        $now = Get-Date
        if ($BreakMinutes -lt 0) { throw 'BreakMinutes cannot be negative.' }

        $noteCombined = ($Note.Trim() + ' ' + [string]$r.Note).Trim()

        if ($InactivityGapMinutes -gt 0) {
            $calc = Get-AdjustedMinutesFromInactivity -sessionStart $sessionStart -now $now -gapMinutes $InactivityGapMinutes -workspaceRoot $WorkspaceRoot
            if ($calc.Adjusted -and $calc.Windows -and $calc.Windows.Count -gt 0) {
                $windows = $calc.Windows
                $rows = @()
                for ($i = 0; $i -lt $windows.Count; $i++) {
                    $w = $windows[$i]
                    $totalMinutes = (New-TimeSpan -Start $w.Start -End $w.End).TotalMinutes
                    $break = 0
                    # Apply any break minutes to the last window.
                    if ($i -eq ($windows.Count - 1)) { $break = $BreakMinutes }
                    $netMinutes = [math]::Max(0, [math]::Round($totalMinutes - $break, 1))
                    $rows += [pscustomobject]@{
                        Date = $w.Start.Date.ToString('yyyy-MM-dd')
                        Start = $w.Start.ToString('yyyy-MM-dd HH:mm')
                        End = $w.End.ToString('yyyy-MM-dd HH:mm')
                        BreakMinutes = $break
                        NetMinutes = $netMinutes
                        Note = $noteCombined
                    }
                }

                $rows | Export-Csv -LiteralPath $File -Append -NoTypeInformation -Encoding UTF8
                Remove-Running -path $runningPath

                Write-Host ("Stopped with inactivity split into {0} windows (gap {1} min)." -f $rows.Count, $InactivityGapMinutes)
                Write-Host 'Stopped + added:'
                $rows | Format-Table -AutoSize
                return
            }
        }

        # Fallback: stop as a single continuous session.
        $sessionEnd = $now
        $totalMinutes = (New-TimeSpan -Start $sessionStart -End $sessionEnd).TotalMinutes
        $netMinutes = [math]::Max(0, [math]::Round($totalMinutes - $BreakMinutes, 1))
        $row = [pscustomobject]@{
            Date = $sessionStart.Date.ToString('yyyy-MM-dd')
            Start = $sessionStart.ToString('yyyy-MM-dd HH:mm')
            End = $sessionEnd.ToString('yyyy-MM-dd HH:mm')
            BreakMinutes = $BreakMinutes
            NetMinutes = $netMinutes
            Note = $noteCombined
        }
        $row | Export-Csv -LiteralPath $File -Append -NoTypeInformation -Encoding UTF8
        Remove-Running -path $runningPath

        Write-Host 'Stopped + added:'
        $row | Format-List
        return
    }

    'add' {
        $d = Parse-Date $Date
        $s = Parse-Time $d $Start
        $e = Parse-Time $d $End

        if ($e -lt $s) {
            # If user worked past midnight, assume end is next day.
            $e = $e.AddDays(1)
        }

        if ($BreakMinutes -lt 0) { throw 'BreakMinutes cannot be negative.' }

        $totalMinutes = (New-TimeSpan -Start $s -End $e).TotalMinutes
        $netMinutes = [math]::Max(0, [math]::Round($totalMinutes - $BreakMinutes, 1))

        $row = [pscustomobject]@{
            Date = $d.ToString('yyyy-MM-dd')
            Start = $s.ToString('yyyy-MM-dd HH:mm')
            End = $e.ToString('yyyy-MM-dd HH:mm')
            BreakMinutes = $BreakMinutes
            NetMinutes = $netMinutes
            Note = $Note
        }

        $row | Export-Csv -LiteralPath $File -Append -NoTypeInformation -Encoding UTF8

        Write-Host 'Added:'
        $row | Format-List
    }

    'add-minutes' {
        $d = Parse-Date $Date
        if ($Minutes -le 0) { throw 'Minutes must be > 0.' }

        $row = [pscustomobject]@{
            Date = $d.ToString('yyyy-MM-dd')
            Start = ''
            End = ''
            BreakMinutes = 0
            NetMinutes = [math]::Round($Minutes, 1)
            Note = $Note
        }

        $row | Export-Csv -LiteralPath $File -Append -NoTypeInformation -Encoding UTF8

        Write-Host 'Added (minutes):'
        $row | Format-List
    }

    'report' {
        $rows = @(Import-Csv -LiteralPath $File)
        if (-not $rows -or $rows.Count -eq 0) {
            Write-Host 'No entries.'
            return
        }

        $rows2 = $rows | ForEach-Object {
            [pscustomobject]@{
                Date = $_.Date
                NetMinutes = [double]$_.NetMinutes
                Note = $_.Note
                Start = $_.Start
                End = $_.End
            }
        }

        $byDay = $rows2 |
            Group-Object Date |
            Sort-Object Name |
            ForEach-Object {
                $sum = ($_.Group | Measure-Object NetMinutes -Sum).Sum
                [pscustomobject]@{
                    Date = $_.Name
                    Sessions = $_.Count
                    NetMinutes = [math]::Round($sum, 1)
                    NetHours = [math]::Round($sum / 60, 2)
                }
            }

        $total = ($rows2 | Measure-Object NetMinutes -Sum).Sum
        Write-Host '--- Manual worklog report (worklog.csv only) ---'
        Write-Host ('Total: {0} minutes ({1} hours)' -f ([math]::Round($total,1)), ([math]::Round($total/60,2)))
        Write-Host 'Tip: for project total (VS Code + manual), run: .\scripts\hours_hybrid_report.ps1 -AsCsv'
        Write-Host ''
        Write-Host 'By day:'
        $byDay | Format-Table -AutoSize
    }

    default {
        throw "Unknown Command: $Command"
    }
}
