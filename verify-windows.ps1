# Sales OS 2.0 — definitive local QA in a normal Windows + internet environment.
# Run from PowerShell: powershell -ExecutionPolicy Bypass -File .\verify-windows.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function RunChecked([string]$tool, [string[]]$arguments) {
    Write-Host "`n> $tool $($arguments -join ' ')" -ForegroundColor Cyan
    & $tool @arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $tool $($arguments -join ' ')" }
}

try {
    $nodeVersion = & node -p "process.versions.node"
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12+ required.' }
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        $pythonExe = $pythonCommand.Source
    } else {
        $pythonExe = (& py -3.12 -c 'import sys; print(sys.executable)' 2>$null).Trim()
    }
    if (-not $pythonExe) { throw 'Python 3.12+ required (python on PATH or py -3.12 launcher).' }
    RunChecked $pythonExe @('-c', 'import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"')
} catch {
    Write-Error "Environment check failed: $_"
    exit 1
}

$log = Join-Path $PSScriptRoot 'docs\LOCAL_QA_LOG.txt'
Start-Transcript -Path $log -Force | Out-Null
try {
    RunChecked $pythonExe @('-m','pip','install','-r','requirements-dev.txt')
    if (-not (Test-Path 'package-lock.json')) { throw 'package-lock.json is required for a reproducible npm ci install.' }
    RunChecked 'npm' @('ci')
    RunChecked 'npm' @('run','lint')
    RunChecked 'npm' @('run','check')
    RunChecked 'npm' @('run','build')
    RunChecked 'npx' @('playwright','install','chromium')
    RunChecked 'npm' @('run','test:quality')
    RunChecked 'npm' @('run','test:e2e')
    RunChecked 'npm' @('run','test:fallback')
    Write-Host "`nALL SALES OS QUALITY GATES PASSED in this environment." -ForegroundColor Green
    Write-Host "Report: $log" -ForegroundColor Green
} catch {
    Write-Error "QA gate not passed: $_"
    Write-Host "Save the log and fix the failing milestone before claiming release readiness." -ForegroundColor Yellow
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
