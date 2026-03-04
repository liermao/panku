param(
  [Parameter(Mandatory = $true)]
  [string]$FfmpegBin
)

$ErrorActionPreference = 'Stop'

$ffmpegInput = "$FfmpegBin".Trim()
$ffmpegClean = $ffmpegInput.Trim('"')
if ([string]::IsNullOrWhiteSpace($ffmpegClean)) {
  throw 'FfmpegBin is empty.'
}
$ffmpegBinResolved = (Resolve-Path -LiteralPath $ffmpegClean).Path
$ffmpegDir = Split-Path $ffmpegBinResolved -Parent

if (-not (Test-Path $ffmpegBinResolved)) {
  throw "FFmpeg binary does not exist: $ffmpegBinResolved"
}

[Environment]::SetEnvironmentVariable('FFMPEG_BIN', $ffmpegBinResolved, 'User')

$userPathRaw = [Environment]::GetEnvironmentVariable('Path', 'User')
$userPathItems = @()
if (-not [string]::IsNullOrWhiteSpace($userPathRaw)) {
  $userPathItems = $userPathRaw.Split(';') | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
}

$normalizedTarget = $ffmpegDir.TrimEnd('\\')
$alreadyExists = $false

foreach ($item in $userPathItems) {
  if ($item.TrimEnd('\\') -ieq $normalizedTarget) {
    $alreadyExists = $true
    break
  }
}

if (-not $alreadyExists) {
  $userPathItems += $ffmpegDir
  $newUserPath = ($userPathItems -join ';')
  [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
  Write-Host "[ok] Added ffmpeg directory to user PATH: $ffmpegDir"
} else {
  Write-Host "[ok] User PATH already contains ffmpeg directory: $ffmpegDir"
}

Write-Host "[ok] User env FFMPEG_BIN = $ffmpegBinResolved"
exit 0
