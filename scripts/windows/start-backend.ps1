param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [Parameter(Mandatory = $true)]
  [string]$FfmpegBin,

  [switch]$Hidden
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path $ProjectRoot).Path
$ffmpeg = (Resolve-Path $FfmpegBin).Path
$serverEntry = Join-Path $root 'server/index.js'

if (-not (Test-Path $serverEntry)) {
  throw "Server entry not found: $serverEntry"
}

$nodeCmd = Get-Command node -ErrorAction Stop
$nodeExe = $nodeCmd.Source

$env:FFMPEG_BIN = $ffmpeg

if ($Hidden.IsPresent) {
  Start-Process -WindowStyle Hidden -FilePath $nodeExe -ArgumentList @($serverEntry) -WorkingDirectory $root | Out-Null
} else {
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', "cd /d `"$root`" && set `"FFMPEG_BIN=$ffmpeg`" && npm run server") -WorkingDirectory $root | Out-Null
}

exit 0
