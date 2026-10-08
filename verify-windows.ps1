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
    $nodeVersion = & node -p "parseInt(process.versions.node.split('.')[0], 10)"
    if ($LASTEXITCODE -ne 0 -or [int]$nodeVersion -lt 22) { throw 'Node.js 22+ required.' }
    $pythonExe = (& py -3 -c 'import sys; print(sys.executable)' 2>$null).Trim()
    if (-not $pythonExe) { throw 'Python 3.12+ with py launcher required.' }
    RunChecked $pythonExe @('-c', 'import sys; assert sys.version_info >= (3,12), "Python 3.12+ required"')
} catch {
    Write-Error "Environment check failed: $_"
    exit 1
}

$log = Join-Path $PSScriptRoot 'docs\LOCAL_QA_LOG.txt'
Start-Transcript -Path $log -Force | Out-Null
try {
    RunChecked $pythonExe @('-m','pip','install','-r','requirements-dev.txt')
    if (Test-Path 'package-lock.json') {
        RunChecked 'npm' @('ci')
    } else {
        RunChecked 'npm' @('install')
        Write-Host 'Please preserve the new package-lock.json in the repository.' -ForegroundColor Yellow
    }
    RunChecked 'npm' @('run','lint')
    RunChecked 'npm' @('run','check')
    RunChecked 'npm' @('run','build')
    RunChecked 'npx' @('playwright','install','chromium')
    RunChecked $pythonExe @('-m','playwright','install','chromium')
    RunChecked 'npm' @('run','test:quality')
    RunChecked 'npm' @('run','test:e2e')
    Write-Host "`nALL SALES OS QUALITY GATES PASSED in this environment." -ForegroundColor Green
    Write-Host "Report: $log" -ForegroundColor Green
} catch {
    Write-Error "QA gate not passed: $_"
    Write-Host "Save the log and fix the failing milestone before claiming release readiness." -ForegroundColor Yellow
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
