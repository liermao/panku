param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

$projectRootInput = "$ProjectRoot".Trim()
$projectRootClean = $projectRootInput.Trim('"')
if ([string]::IsNullOrWhiteSpace($projectRootClean)) {
  throw 'ProjectRoot is empty.'
}
$projectRootResolved = (Resolve-Path -LiteralPath $projectRootClean).Path
$binDir = Join-Path $projectRootResolved 'bin'
$ffmpegExe = Join-Path $binDir 'ffmpeg.exe'

if (Test-Path $ffmpegExe) {
  Write-Host "[ok] ffmpeg already exists: $ffmpegExe"
  exit 0
}

New-Item -ItemType Directory -Path $binDir -Force | Out-Null

$tempRoot = Join-Path $env:TEMP ("panku-ffmpeg-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$zipPath = Join-Path $tempRoot 'ffmpeg.zip'

$downloadUrls = @(
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.zip'
)

$downloaded = $false
foreach ($url in $downloadUrls) {
  try {
    Write-Host "[info] Downloading ffmpeg from $url"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    $downloaded = $true
    break
  } catch {
    Write-Warning "Download failed: $url"
  }
}

if (-not $downloaded) {
  throw 'Failed to download ffmpeg package.'
}

Write-Host '[info] Extracting ffmpeg package...'
Expand-Archive -Path $zipPath -DestinationPath $tempRoot -Force

$ffmpegSource = Get-ChildItem -Path $tempRoot -Recurse -File -Filter 'ffmpeg.exe' |
  Where-Object { $_.FullName -match '\\bin\\ffmpeg\.exe$' } |
  Select-Object -First 1

if (-not $ffmpegSource) {
  throw 'Cannot find ffmpeg.exe in extracted package.'
}

Copy-Item -Path $ffmpegSource.FullName -Destination $ffmpegExe -Force
Write-Host "[ok] ffmpeg installed to: $ffmpegExe"

try {
  Remove-Item -Path $tempRoot -Recurse -Force
} catch {
  Write-Warning 'Failed to clean temporary files. You can remove them manually later.'
}

exit 0
