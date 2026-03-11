param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [string]$GatewayBase = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"

function Get-FirstRtspUrl {
  param([string]$Root)

  $runtimeConfigPath = Join-Path $Root "public\runtime-config.json"
  if (-not (Test-Path -LiteralPath $runtimeConfigPath)) {
    return $null
  }

  try {
    $jsonText = Get-Content -LiteralPath $runtimeConfigPath -Raw -Encoding UTF8
    $cfg = $jsonText | ConvertFrom-Json
    $cameras = $cfg.monitor.cameras
    if ($null -eq $cameras) {
      return $null
    }

    foreach ($cam in $cameras) {
      $url = [string]$cam.rtspUrl
      if (-not [string]::IsNullOrWhiteSpace($url)) {
        return $url.Trim()
      }
    }
    return $null
  } catch {
    return $null
  }
}

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$rtspUrl = Get-FirstRtspUrl -Root $root

if ([string]::IsNullOrWhiteSpace($rtspUrl)) {
  Write-Warning "[probe] No camera rtspUrl found in public/runtime-config.json"
  exit 1
}

$probeUrl = "$GatewayBase/api/stream/probe"
$body = @{ rtspUrl = $rtspUrl } | ConvertTo-Json -Depth 5

try {
  $resp = Invoke-RestMethod -Uri $probeUrl -Method Post -ContentType "application/json; charset=utf-8" -Body $body -TimeoutSec 20
  if ($resp.ok -eq $true) {
    $firstOk = $resp.results | Where-Object { $_.ok -eq $true } | Select-Object -First 1
    if ($null -ne $firstOk) {
      $transport = [string]$firstOk.transport
      $timeoutOpt = [string]$firstOk.timeoutOption
      Write-Host "[ok] [probe] First camera probe passed. transport=$transport timeoutOption=$timeoutOpt"
      exit 0
    }
  }

  Write-Warning "[probe] Probe did not return success."
  exit 1
} catch {
  $message = $_.Exception.Message
  Write-Warning "[probe] API request failed: $message"

  try {
    $respStream = $_.Exception.Response.GetResponseStream()
    if ($null -ne $respStream) {
      $reader = New-Object System.IO.StreamReader($respStream)
      $raw = $reader.ReadToEnd()
      if (-not [string]::IsNullOrWhiteSpace($raw)) {
        Write-Host "[probe] response: $raw"
      }
    }
  } catch {
  }

  exit 1
}
