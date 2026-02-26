param(
    [string]$Root = (Get-Location).Path,
    [int]$GapMinutes = 45,
    [string[]]$Include = @(
        "app.js",
        "server.js",
        "index.html",
        "styles.css",
        "package.json",
        "src\*.js",
        "src\*\*.js",
        "src\*\*\*.js",
        "src\*\*\*\*.js",
        "scripts\*.ps1",
        "scripts\*.js"
    ),
    [string[]]$ExcludeDirs = @("node_modules", ".git"),
    [switch]$AsCsv
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-IncludeFiles {
    param([string]$RootPath, [string[]]$Patterns)

    # PowerShell 5.1 doesn't support `**` globbing. Instead, scan recursively and
    # filter by patterns against the *relative* path.
    $allFiles = Get-ChildItem -Path $RootPath -File -Recurse -ErrorAction SilentlyContinue
    if (-not $allFiles) { return @() }

    $matched = @()
    foreach ($f in $allFiles) {
        if (Is-ExcludedPath -FullName $f.FullName -ExcludedDirNames $ExcludeDirs) {
            continue
        }

        $rel = $f.FullName.Substring($RootPath.Length).TrimStart('\\')
        $rel = $rel.Replace('/', '\\')

        foreach ($p in $Patterns) {
            $pp = $p.Replace('/', '\\')
            if ($rel -like $pp) {
                $matched += $f
                break
            }
        }
    }

    return $matched | Sort-Object FullName -Unique
}

function Is-ExcludedPath {
    param([string]$FullName, [string[]]$ExcludedDirNames)

    foreach ($d in $ExcludedDirNames) {
        if ($FullName -match ([regex]::Escape("\\$d\\"))) {
            return $true
        }
    }
    return $false
}

$rootItem = Get-Item -LiteralPath $Root
if (-not $rootItem.PSIsContainer) {
    throw "Root must be a directory: $Root"
}

$all = Resolve-IncludeFiles -RootPath $Root -Patterns $Include
$all = $all | Where-Object { -not (Is-ExcludedPath -FullName $_.FullName -ExcludedDirNames $ExcludeDirs) }

if (-not $all -or $all.Count -eq 0) {
    throw "No files matched include patterns. Root=$Root"
}

$events = $all |
    ForEach-Object {
        [pscustomobject]@{
            Path = $_.FullName
            When = $_.LastWriteTime
        }
    } |
    Sort-Object When

if (-not $events -or $events.Count -eq 0) {
    throw "No timestamp events found."
}

$gap = [TimeSpan]::FromMinutes($GapMinutes)
$sessions = @()

$sessionStart = $events[0].When
$sessionEnd = $events[0].When

for ($i = 1; $i -lt $events.Count; $i++) {
    $t = $events[$i].When
    if (($t - $sessionEnd) -le $gap) {
        $sessionEnd = $t
        continue
    }

    $sessions += [pscustomobject]@{
        Start = $sessionStart
        End = $sessionEnd
        Minutes = [math]::Round((New-TimeSpan -Start $sessionStart -End $sessionEnd).TotalMinutes, 1)
        Date = $sessionStart.Date
    }

    $sessionStart = $t
    $sessionEnd = $t
}

$sessions += [pscustomobject]@{
    Start = $sessionStart
    End = $sessionEnd
    Minutes = [math]::Round((New-TimeSpan -Start $sessionStart -End $sessionEnd).TotalMinutes, 1)
    Date = $sessionStart.Date
}

$byDay = $sessions |
    Group-Object { $_.Date.ToString('yyyy-MM-dd') } |
    Sort-Object Name |
    ForEach-Object {
        $total = ($_.Group | Measure-Object Minutes -Sum).Sum
        [pscustomobject]@{
            Date = $_.Name
            Sessions = $_.Count
            TotalMinutes = [math]::Round($total, 1)
            TotalHours = [math]::Round($total / 60, 2)
        }
    }

$totalMinutes = ($sessions | Measure-Object Minutes -Sum).Sum
$totalHours = [math]::Round($totalMinutes / 60, 2)

if ($AsCsv) {
    $outPath = Join-Path $Root "work-hours-estimate.csv"
    $sessions |
        Select-Object Date, Start, End, Minutes |
        Export-Csv -Path $outPath -NoTypeInformation -Encoding UTF8

    Write-Host "Wrote $outPath"
}

Write-Host "--- Estimate from file timestamps ---"
Write-Host ("Root: {0}" -f $Root)
Write-Host ("GapMinutes: {0}" -f $GapMinutes)
Write-Host ("Events: {0} files" -f $all.Count)
Write-Host ("Sessions: {0}" -f $sessions.Count)
Write-Host ("Total: {0} minutes ({1} hours)" -f ([math]::Round($totalMinutes,1)), $totalHours)
Write-Host ""
Write-Host "--- By day ---"
$byDay | Format-Table -AutoSize

Write-Host ""
Write-Host "--- Sessions ---"
$sessions | Sort-Object Start | Format-Table -AutoSize
