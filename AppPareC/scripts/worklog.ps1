param(
    [Parameter(Position=0)]
    [ValidateSet('add','add-minutes','start','stop','status','report','official')]
    [string]$Command,

    [string]$Date,
    [string]$Start,
    [string]$End,
    [double]$Minutes,
    [int]$BreakMinutes = 0,
    [string]$Note = "",
    [string]$StartAt,

    # Optional: adjust running session by inactivity in the workspace.
    [string]$WorkspaceRoot = (Get-Location).Path,
    [string]$VsCodeAppData = "$env:APPDATA\\Code",
    [int]$InactivityGapMinutes = 45,

    [double]$TargetHours = 52,
    [string]$CheckpointDate = '2026-03-04',
    [double]$CheckpointTotalMinutes = 2820,

    [string]$File = (Join-Path (Get-Location).Path 'worklog.csv')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-ToDoubleInvariant([object]$value) {
    if ($null -eq $value) { return 0.0 }
    $text = [string]$value
    if (-not $text) { return 0.0 }
    $normalized = $text.Trim().Replace(',', '.')
    [double]$n = 0
    if ([double]::TryParse($normalized, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) {
        return $n
    }
    return 0.0
}

function Get-WorklogEntries([string]$filePath) {
    if (-not $filePath -or -not (Test-Path -LiteralPath $filePath)) {
        return @()
    }
    try {
        return @(Import-Csv -LiteralPath $filePath)
    } catch {
        return @()
    }
}

function Get-LoggedMinutes([string]$filePath) {
    $rows = Get-WorklogEntries -filePath $filePath
    if (-not $rows -or $rows.Count -eq 0) {
        return 0.0
    }
    $sum = 0.0
    foreach ($r in $rows) {
        $sum += (Convert-ToDoubleInvariant $r.NetMinutes)
    }
    return [math]::Round($sum, 1)
}

function Get-LoggedMinutesSinceDate([string]$filePath, [datetime]$exclusiveDate) {
    $rows = Get-WorklogEntries -filePath $filePath
    if (-not $rows -or $rows.Count -eq 0) {
        return 0.0
    }
    $sum = 0.0
    foreach ($r in $rows) {
        $dRaw = [string]$r.Date
        if (-not $dRaw) { continue }
        [datetime]$d = [datetime]::MinValue
        if (-not [datetime]::TryParse($dRaw, [ref]$d)) { continue }
        if ($d.Date -le $exclusiveDate.Date) { continue }
        $sum += (Convert-ToDoubleInvariant $r.NetMinutes)
    }
    return [math]::Round($sum, 1)
}

function Get-CanonicalLoggedMinutes([string]$filePath, [string]$checkpointDate, [double]$checkpointTotalMinutes) {
    $cpText = [string]$checkpointDate
    if (-not $cpText -or [double]$checkpointTotalMinutes -le 0) {
        return Get-LoggedMinutes -filePath $filePath
    }

    [datetime]$cpDate = [datetime]::MinValue
    if (-not [datetime]::TryParse($cpText, [ref]$cpDate)) {
        return Get-LoggedMinutes -filePath $filePath
    }

    $after = Get-LoggedMinutesSinceDate -filePath $filePath -exclusiveDate $cpDate
    return [math]::Round([double]$checkpointTotalMinutes + $after, 1)
}

function Format-Minutes([double]$minutes) {
    $rounded = [math]::Round($minutes, 1)
    $hours = [math]::Floor($rounded / 60)
    $mins = [math]::Round($rounded % 60)
    return ('{0:00}:{1:00}' -f $hours, $mins)
}

function Get-LatestEntry([string]$filePath) {
    $rows = Get-WorklogEntries -filePath $filePath
    if (-not $rows -or $rows.Count -eq 0) {
        return $null
    }

    $best = $null
    $bestDate = [datetime]::MinValue
    foreach ($r in $rows) {
        $candidates = @([string]$r.End, [string]$r.Start, [string]$r.Date)
        $current = [datetime]::MinValue
        foreach ($raw in $candidates) {
            if (-not $raw) { continue }
            [datetime]$dt = [datetime]::MinValue
            if ([datetime]::TryParse($raw, [ref]$dt)) {
                if ($dt -gt $current) { $current = $dt }
            }
        }
        if ($current -gt $bestDate) {
            $bestDate = $current
            $best = $r
        }
    }
    return $best
}

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

function Get-WorkspaceSessionsFromHistory([string]$workspaceRoot, [datetime]$since, [int]$gapMinutes, [string]$vsCodeAppData) {
    if (-not $workspaceRoot -or -not (Test-Path -LiteralPath $workspaceRoot)) { return @() }
    if (-not $vsCodeAppData) { return @() }
    $historyRoot = Join-Path $vsCodeAppData 'User\History'
    if (-not (Test-Path -LiteralPath $historyRoot)) { return @() }

    $ws = [System.IO.Path]::GetFullPath($workspaceRoot).TrimEnd('\\') + '\\'
    $events = @()

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
            $events += $when
        }
    }

    if (-not $events -or $events.Count -eq 0) { return @() }

    $events = @($events | Sort-Object)
    $gap = [TimeSpan]::FromMinutes($gapMinutes)
    $sessions = @()

    $start = $events[0]
    $end = $events[0]
    for ($i = 1; $i -lt $events.Count; $i++) {
        $t = $events[$i]
        if (($t - $end) -le $gap) {
            $end = $t
            continue
        }
        $sessions += [pscustomobject]@{ Start = $start; End = $end }
        $start = $t
        $end = $t
    }
    $sessions += [pscustomobject]@{ Start = $start; End = $end }
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
    $since = (Get-Date).AddDays(-1 * $daysBack)
    $sessions = Get-WorkspaceSessionsFromHistory -workspaceRoot $workspaceRoot -since $since -gapMinutes $gapMinutes -vsCodeAppData $VsCodeAppData

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
        $loggedMinutes = Get-CanonicalLoggedMinutes -filePath $File -checkpointDate $CheckpointDate -checkpointTotalMinutes $CheckpointTotalMinutes
        $targetMinutes = [math]::Round($TargetHours * 60, 1)

        if (-not $r) {
            Write-Host 'No running session.'
            $latest = Get-LatestEntry -filePath $File
            if ($latest) {
                Write-Host ("Last entry: Date={0} Start={1} End={2} NetMinutes={3} Note={4}" -f [string]$latest.Date, [string]$latest.Start, [string]$latest.End, [string]$latest.NetMinutes, [string]$latest.Note)
            }
            Write-Host ("Total logged: {0} min ({1})" -f $loggedMinutes, (Format-Minutes -minutes $loggedMinutes))
            Write-Host ("Target {0}h: {1} min. Remaining: {2} min" -f $TargetHours, $targetMinutes, [math]::Round($targetMinutes - $loggedMinutes, 1))
            return
        }

        $sessionStart = [datetime]::ParseExact([string]$r.Start, 'yyyy-MM-dd HH:mm:ss', $null)
        $now = Get-Date
        $calc = Get-AdjustedMinutesFromInactivity -sessionStart $sessionStart -now $now -gapMinutes $InactivityGapMinutes -workspaceRoot $WorkspaceRoot
        $runningMinutes = if ($calc.Adjusted) { [double]$calc.AdjustedMinutes } else { [double]$calc.RawMinutes }
        $totalWithRunning = [math]::Round($loggedMinutes + $runningMinutes, 1)
        if ($calc.Adjusted) {
            $wCount = if ($calc.Windows) { $calc.Windows.Count } else { 0 }
            Write-Host ("Running since {0} ({1} min adjusted by inactivity in {2} windows, {3} min raw). Gap: {4} min. Note: {5}" -f $sessionStart, $calc.AdjustedMinutes, $wCount, $calc.RawMinutes, $InactivityGapMinutes, [string]$r.Note)
        } else {
            Write-Host ("Running since {0} ({1} min so far). Note: {2}" -f $sessionStart, $calc.RawMinutes, [string]$r.Note)
        }
        Write-Host ("Total logged (closed): {0} min ({1})" -f $loggedMinutes, (Format-Minutes -minutes $loggedMinutes))
        Write-Host ("Total with current session: {0} min ({1})" -f $totalWithRunning, (Format-Minutes -minutes $totalWithRunning))
        Write-Host ("Target {0}h: {1} min. Remaining: {2} min" -f $TargetHours, $targetMinutes, [math]::Round($targetMinutes - $totalWithRunning, 1))
        return
    }

    'start' {
        $existing = Read-Running -path $runningPath
        if ($existing) {
            Write-Host ("Already running since {0}. Use 'stop' first." -f [string]$existing.Start)
            return
        }

        $now = Get-Date
        $startTime = $now
        if ($StartAt -and $StartAt.Trim() -ne '') {
            [datetime]$parsed = [datetime]::MinValue
            if (-not [datetime]::TryParse($StartAt, [ref]$parsed)) {
                throw "Invalid StartAt. Use format yyyy-MM-dd HH:mm"
            }
            $startTime = $parsed
        }

        $noteToStore = if ($Note -and $Note.Trim() -ne '') { $Note } else { "Sesion iniciada manualmente" }
        Write-Running -path $runningPath -start $startTime -note $noteToStore
        Write-Host ("Started: {0}" -f $startTime.ToString('yyyy-MM-dd HH:mm:ss'))
        Write-Host ("Note: {0}" -f $noteToStore)
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

        $total = Get-CanonicalLoggedMinutes -filePath $File -checkpointDate $CheckpointDate -checkpointTotalMinutes $CheckpointTotalMinutes
        Write-Host '--- Manual worklog report (worklog.csv only) ---'
        Write-Host ('Total: {0} minutes ({1} hours)' -f ([math]::Round($total,1)), ([math]::Round($total/60,2)))
        Write-Host ('Total HH:mm: {0}' -f (Format-Minutes -minutes ([double]$total)))
        $targetMinutes = [math]::Round($TargetHours * 60, 1)
        Write-Host ('Target {0}h => Remaining: {1} minutes' -f $TargetHours, [math]::Round($targetMinutes - [double]$total, 1))
        Write-Host 'Tip: para total oficial unificado, usar: .\scripts\worklog.ps1 official'
        Write-Host ''
        Write-Host 'By day:'
        $byDay | Format-Table -AutoSize
    }

    'official' {
        $loggedMinutes = Get-CanonicalLoggedMinutes -filePath $File -checkpointDate $CheckpointDate -checkpointTotalMinutes $CheckpointTotalMinutes
        $targetMinutes = [math]::Round($TargetHours * 60, 1)
        $runningMinutes = 0.0
        $rawRunningMinutes = 0.0
        $hasRunning = $false
        $sessionStart = $null

        $r = Read-Running -path $runningPath
        if ($r) {
            $hasRunning = $true
            $sessionStart = [datetime]::ParseExact([string]$r.Start, 'yyyy-MM-dd HH:mm:ss', $null)
            $now = Get-Date
            $calc = Get-AdjustedMinutesFromInactivity -sessionStart $sessionStart -now $now -gapMinutes $InactivityGapMinutes -workspaceRoot $WorkspaceRoot
            $rawRunningMinutes = [double]$calc.RawMinutes
            $runningMinutes = if ($calc.Adjusted) { [double]$calc.AdjustedMinutes } else { [double]$calc.RawMinutes }
        }

        $totalWithRunning = [math]::Round($loggedMinutes + $runningMinutes, 1)

        Write-Host '--- Total oficial unificado ---'
        Write-Host ("Regla: checkpoint + worklog posterior. Checkpoint: {0} ({1} min / {2})" -f $CheckpointDate, [math]::Round($CheckpointTotalMinutes,1), (Format-Minutes -minutes $CheckpointTotalMinutes))

        Write-Host ("Total oficial cerrado: {0} min ({1})" -f $loggedMinutes, (Format-Minutes -minutes $loggedMinutes))

        if ($hasRunning) {
            Write-Host ("Sesion activa desde {0}" -f $sessionStart.ToString('yyyy-MM-dd HH:mm:ss'))
            Write-Host ("Sesion activa (ajustada): {0} min | bruto: {1} min | gap: {2} min" -f [math]::Round($runningMinutes,1), [math]::Round($rawRunningMinutes,1), $InactivityGapMinutes)
            Write-Host ("Total oficial + sesion activa: {0} min ({1})" -f $totalWithRunning, (Format-Minutes -minutes $totalWithRunning))
        } else {
            Write-Host 'Sesion activa: no'
        }

        Write-Host ("Target {0}h: {1} min. Remaining (cerrado): {2} min" -f $TargetHours, $targetMinutes, [math]::Round($targetMinutes - $loggedMinutes, 1))

        Write-Host ("Archivo oficial de datos: {0}" -f $File)
        return
    }

    default {
        throw "Unknown Command: $Command"
    }
}
