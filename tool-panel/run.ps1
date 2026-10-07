<#
.SYNOPSIS
  Chạy RE Tool Panel 1 phát: kiểm tra + tự cài prerequisites, mở game với CDP, build, inject.
.EXAMPLE
  .\run.ps1            # cài thứ còn thiếu -> mở game -> build -> inject
  .\run.ps1 -Test      # như trên + chạy test trên game thật
  .\run.ps1 -Update    # game vừa update: tải source mới, quét offset (--write), build, inject, test
  .\run.ps1 -Eject     # gỡ panel, khôi phục hàm gốc
  .\run.ps1 -Check     # chỉ kiểm tra prerequisites, không cài gì
#>
[CmdletBinding()]
param(
  [switch]$Test,
  [switch]$Update,
  [switch]$Eject,
  [switch]$Check,
  [int]$Port = 9222
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$Here = $PSScriptRoot
$Root = Split-Path -Parent $Here
$BrowserProfile = Join-Path $Root 'edge-debug-profile'
$MinNode = 22

function Say([string]$Msg, [string]$Color = 'Gray') { Write-Host $Msg -ForegroundColor $Color }
function Fail([string]$Msg) { Write-Host "X $Msg" -ForegroundColor Red; exit 1 }
function Update-SessionPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# ---------- prerequisites ----------
function Install-WithWinget([string]$Id, [string]$Label, [string]$ManualUrl) {
  if ($Check) { Fail "$Label chưa có. Chạy lại không kèm -Check để tự cài, hoặc cài tay: $ManualUrl" }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Fail "$Label chưa có và máy không có winget để tự cài. Cài tay: $ManualUrl"
  }
  Say "-> Đang cài $Label qua winget ($Id)..." 'Yellow'
  & winget install --id $Id -e --silent --accept-package-agreements --accept-source-agreements
  # winget trả mã khác 0 cả khi "đã cài sẵn"; kết quả thật được kiểm tra lại ngay sau đó.
  if ($LASTEXITCODE -ne 0) { Say "   winget trả mã $LASTEXITCODE — kiểm tra lại..." 'DarkYellow' }
  Update-SessionPath
}

function Get-NodeMajor {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
  try { return [int]((& node -p "process.versions.node.split('.')[0]") | Out-String).Trim() } catch { return 0 }
}

function Confirm-Node {
  $major = Get-NodeMajor
  if ($major -ge $MinNode) { Say "OK Node.js v$major" 'Green'; return }
  if ($major -gt 0) { Say "! Node.js v$major quá cũ (cần >= ${MinNode}: dùng fetch/WebSocket có sẵn)" 'Yellow' }
  else { Say '! Chưa có Node.js' 'Yellow' }
  Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS' 'https://nodejs.org'
  $major = Get-NodeMajor
  if ($major -lt $MinNode) { Fail "Vẫn chưa có Node.js >= $MinNode. Mở terminal mới rồi chạy lại, hoặc cài tay: https://nodejs.org" }
  Say "OK Node.js v$major (vừa cài)" 'Green'
}

function Find-Browser {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  foreach ($p in $candidates) { if ($p -and (Test-Path $p)) { return $p } }
  return $null
}

function Confirm-Browser {
  $b = Find-Browser
  if (-not $b) {
    Say '! Không thấy Edge/Chrome' 'Yellow'
    Install-WithWinget 'Microsoft.Edge' 'Microsoft Edge' 'https://www.microsoft.com/edge'
    $b = Find-Browser
  }
  if (-not $b) { Fail 'Không tìm thấy Edge/Chrome sau khi cài' }
  Say "OK Trình duyệt: $b" 'Green'
  return $b
}

# ---------- browser + game tab over CDP ----------
function Get-CdpTargets {
  try { return Invoke-RestMethod "http://127.0.0.1:$Port/json" -TimeoutSec 2 } catch { return $null }
}
function Test-GameTab($Targets, [string]$GameHost) {
  return [bool]($Targets | Where-Object { $_.type -eq 'page' -and $_.url -like "*$GameHost*" })
}

function Open-GameTab([string]$Browser, [string]$GameUrl, [string]$GameHost) {
  $targets = Get-CdpTargets
  if ($null -eq $targets) {
    Say "-> Mở trình duyệt với CDP :$Port (profile riêng: edge-debug-profile)..." 'Yellow'
    Start-Process $Browser -ArgumentList "--remote-debugging-port=$Port", "--user-data-dir=`"$BrowserProfile`"", '--no-first-run', '--no-default-browser-check', $GameUrl
  } elseif (-not (Test-GameTab $targets $GameHost)) {
    Say '-> CDP đang chạy, mở thêm tab game...' 'Yellow'
    try { Invoke-RestMethod -Method Put "http://127.0.0.1:$Port/json/new?$GameUrl" -TimeoutSec 5 | Out-Null }
    catch { Invoke-RestMethod "http://127.0.0.1:$Port/json/new?$GameUrl" -TimeoutSec 5 | Out-Null }
  }
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-GameTab (Get-CdpTargets) $GameHost) { Say "OK Tab game sẵn sàng (CDP :$Port)" 'Green'; return }
    Start-Sleep -Milliseconds 500
  }
  Fail "Không mở được tab game qua CDP :$Port. Nếu trình duyệt đang mở sẵn bằng profile này nhưng thiếu CDP, tắt hẳn nó rồi chạy lại."
}

# ---------- node steps ----------
function Invoke-Step([string]$Script, [string[]]$ScriptArgs = @()) {
  & node (Join-Path $Here $Script) @ScriptArgs
  if ($LASTEXITCODE -ne 0) { Fail "$Script lỗi (mã $LASTEXITCODE)" }
}

# ---------- main ----------
$bindings = Get-Content (Join-Path $Here 'bindings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$gameHost = ([Uri]$bindings.baseUrl).Host
$gameUrl = "https://$gameHost/"

Say '== Prerequisites ==' 'Cyan'
Confirm-Node
$browser = Confirm-Browser
if ($Check) { Say 'OK Đủ prerequisites' 'Green'; exit 0 }

Say '== Game ==' 'Cyan'
Open-GameTab $browser $gameUrl $gameHost

if ($Eject) { Invoke-Step 'inject.mjs' @('--eject'); exit 0 }

$needSources = -not (Test-Path (Join-Path $Root 'js\game.js'))
if ($Update -or $needSources) {
  Say '== Source game + offset ==' 'Cyan'
  $scanArgs = @('--fetch')
  if ($Update) { $scanArgs += '--write' }
  & node (Join-Path $Here 'scan.mjs') @scanArgs | Select-Object -Last 4
  if ($LASTEXITCODE -ge 2) { Fail 'scan.mjs lỗi' }
  if ($LASTEXITCODE -eq 1) { Say '! Có binding cần sửa tay — xem chi tiết: node tool-panel\scan.mjs' 'Yellow' }
}

Say '== Build + inject ==' 'Cyan'
Invoke-Step 'build.mjs'
Invoke-Step 'inject.mjs'

if ($Test -or $Update) {
  Say '== Test trên game thật ==' 'Cyan'
  Invoke-Step 'test.mjs'
}
Say 'Xong. Phím Insert để ẩn/hiện panel.' 'Green'
