Set-StrictMode -Version Latest

function Read-TimeTrackingConfig([string]$configPath) {
    if (-not $configPath -or -not (Test-Path -LiteralPath $configPath)) {
        return $null
    }
    try {
        $raw = Get-Content -LiteralPath $configPath -Raw
        if (-not $raw -or $raw.Trim() -eq '') {
            return $null
        }
        return ($raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

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

function Get-CanonicalLoggedMinutes([string]$filePath, [object]$config) {
    if ($null -eq $config -or $null -eq $config.checkpoint) {
        return Get-LoggedMinutes -filePath $filePath
    }

    $cp = $config.checkpoint
    $dateText = [string]$cp.date
    $totalMinutes = Convert-ToDoubleInvariant $cp.totalMinutes
    if (-not $dateText) {
        return Get-LoggedMinutes -filePath $filePath
    }

    [datetime]$cpDate = [datetime]::MinValue
    if (-not [datetime]::TryParse($dateText, [ref]$cpDate)) {
        return Get-LoggedMinutes -filePath $filePath
    }

    $after = Get-LoggedMinutesSinceDate -filePath $filePath -exclusiveDate $cpDate
    return [math]::Round($totalMinutes + $after, 1)
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
