<#
.SYNOPSIS
Runs the postcard tool on this machine. macOS and Linux: scripts/run-local.sh takes the same options.

.DESCRIPTION
dev (the default) starts the Vite dev server with hot reload: http://localhost:5173

prod builds the site and serves dist/ through wrangler with the real headers (CSP), as Cloudflare serves it:
http://localhost:8787

Installs the dependencies first (npm ci) when node_modules is missing or older than package-lock.json.

.PARAMETER Mode
dev or prod.

.PARAMETER Lan
Listen on all interfaces, so phones and other computers on the network can open it.

.PARAMETER Port
Use this port instead of 5173 (dev) or 8787 (prod).

.EXAMPLE
.\scripts\run-local.ps1

.EXAMPLE
.\scripts\run-local.ps1 prod -Lan -Port 8080
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('dev', 'prod')]
    [string]$Mode = 'dev',

    [switch]$Lan,

    [ValidateRange(1, 65535)]
    [int]$Port
)

Set-StrictMode -Version Latest

# Windows PowerShell never stops on a failing native command, so every exit code is checked here. The arguments
# are splatted: typed literally, `--` is eaten by PowerShell on its way to npm.ps1 and Vite never sees --host.
function Invoke-Tool([string]$Tool, [string[]]$Arguments) {
    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$Tool $($Arguments -join ' ')' failed with exit code $LASTEXITCODE." }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js not found. Install the version in .nvmrc: https://nodejs.org'
}

Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $nodeCheck = @(
        'const want = /(\d+)\.(\d+)/.exec(require(`./package.json`).engines.node).slice(1).map(Number);'
        'const have = process.versions.node.split(`.`).map(Number);'
        'if (have[0] < want[0] || (have[0] === want[0] && have[1] < want[1])) {'
        '  console.error(`Node ${want.join(`.`)} or newer is required; this is ${process.versions.node}.`);'
        '  process.exit(1);'
        '}'
    ) -join ' '
    Invoke-Tool node @('-e', $nodeCheck)

    $installed = 'node_modules/.package-lock.json'
    if (-not (Test-Path -LiteralPath $installed) -or
        (Get-Item -LiteralPath 'package-lock.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath $installed -Force).LastWriteTimeUtc) {
        Write-Host 'Installing dependencies (npm ci)...'
        Invoke-Tool npm @('ci')
    }

    if ($Mode -eq 'dev') {
        $flags = @('run', 'dev', '--')
        if ($Lan) { $flags += '--host' }
        if ($Port) { $flags += @('--port', "$Port") }
        Invoke-Tool npm $flags
    }
    else {
        Invoke-Tool npm @('run', 'build')
        if (-not $Port) { $Port = 8787 }
        $flags = @('wrangler', 'dev', '--port', "$Port")
        if ($Lan) { $flags += @('--ip', '0.0.0.0') }
        Invoke-Tool npx $flags
    }
}
finally {
    Pop-Location
}
