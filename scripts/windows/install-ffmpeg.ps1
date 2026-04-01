param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Write-Info {
  param([string]$Message)
  Write-Host "[info] $Message"
}

function Write-Ok {
  param([string]$Message)
  Write-Host "[ok] $Message"
}

function Get-CommandPath {
  param([string]$Name)
  try {
    $cmd = Get-Command $Name -ErrorAction Stop
    return [string]$cmd.Source
  } catch {
    return $null
  }
}

function Download-Archive {
  param(
    [string]$Url,
    [string]$OutFile
  )

  $curl = Get-CommandPath -Name 'curl.exe'
  if (-not [string]::IsNullOrWhiteSpace($curl)) {
    Write-Info "Downloading via curl (timeout: 15s connect / 180s total)"
    & $curl -L --fail --retry 1 --connect-timeout 15 --max-time 180 --output $OutFile $Url
    if ($LASTEXITCODE -ne 0) {
      throw "curl download failed with exit code $LASTEXITCODE"
    }
    return
  }

  Write-Info "Downloading via Invoke-WebRequest (timeout: 180s)"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing -TimeoutSec 180
}

function Test-ZipSignature {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $false
  }

  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      if ($stream.Length -lt 4) {
        return $false
      }

      $buffer = New-Object byte[] 4
      [void]$stream.Read($buffer, 0, 4)
      return $buffer[0] -eq 0x50 -and $buffer[1] -eq 0x4B
    } finally {
      $stream.Dispose()
    }
  } catch {
    return $false
  }
}

function Install-FromArchive {
  param(
    [string]$ArchivePath,
    [string]$TempRoot,
    [string]$TargetExe
  )

  $extractRoot = Join-Path $TempRoot ("extract-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $extractRoot -Force

  $ffmpegSource = Get-ChildItem -Path $extractRoot -Recurse -File -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\bin\\ffmpeg\.exe$' } |
    Select-Object -First 1

  if (-not $ffmpegSource) {
    throw 'Cannot find ffmpeg.exe in extracted package.'
  }

  Copy-Item -LiteralPath $ffmpegSource.FullName -Destination $TargetExe -Force
  return $ffmpegSource.FullName
}

$projectRootInput = "$ProjectRoot".Trim()
$projectRootClean = $projectRootInput.Trim('"')
if ([string]::IsNullOrWhiteSpace($projectRootClean)) {
  throw 'ProjectRoot is empty.'
}

if (-not (Test-Path -LiteralPath $projectRootClean)) {
  throw "ProjectRoot does not exist: $projectRootClean"
}

$projectRootResolved = (Resolve-Path -LiteralPath $projectRootClean).Path
$binDir = Join-Path $projectRootResolved 'bin'
$ffmpegExe = Join-Path $binDir 'ffmpeg.exe'

if (Test-Path -LiteralPath $ffmpegExe) {
  Write-Ok "ffmpeg already exists: $ffmpegExe"
  exit 0
}

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
}

$ffmpegFromPath = Get-CommandPath -Name 'ffmpeg'
if (-not [string]::IsNullOrWhiteSpace($ffmpegFromPath) -and (Test-Path -LiteralPath $ffmpegFromPath)) {
  try {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-Info "Using existing ffmpeg from PATH: $ffmpegFromPath"
    Copy-Item -LiteralPath $ffmpegFromPath -Destination $ffmpegExe -Force
    Write-Ok "ffmpeg installed to: $ffmpegExe"
    exit 0
  } catch {
    Write-Warning "[warn] Failed to reuse ffmpeg from PATH, will try download."
  }
}

New-Item -ItemType Directory -Path $binDir -Force | Out-Null

$tempRoot = Join-Path $env:TEMP ("panku-ffmpeg-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

$downloadUrls = @(
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-7.1-essentials_build.zip',
  'https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-essentials.zip',
  'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'
)

$errors = New-Object System.Collections.Generic.List[string]
foreach ($url in $downloadUrls) {
  $archivePath = Join-Path $tempRoot ("ffmpeg-" + [Guid]::NewGuid().ToString('N') + '.zip')
  try {
    Write-Info "Downloading ffmpeg from $url"
    Download-Archive -Url $url -OutFile $archivePath

    if (-not (Test-ZipSignature -Path $archivePath)) {
      throw 'Downloaded file is not a valid zip archive.'
    }

    Write-Info 'Extracting ffmpeg package...'
    $sourceExe = Install-FromArchive -ArchivePath $archivePath -TempRoot $tempRoot -TargetExe $ffmpegExe
    Write-Ok "ffmpeg installed to: $ffmpegExe"
    Write-Info "ffmpeg source: $sourceExe"
    exit 0
  } catch {
    $message = $_.Exception.Message
    Write-Warning "[warn] ffmpeg install attempt failed: $message"
    [void]$errors.Add("$url => $message")
  }
}

if (Test-Path -LiteralPath $ffmpegExe) {
  Write-Ok "ffmpeg installed to: $ffmpegExe"
  exit 0
}

try {
  Remove-Item -Path $tempRoot -Recurse -Force
} catch {
  Write-Warning '[warn] Failed to clean temporary files. You can remove them manually later.'
}

$detail = ($errors | ForEach-Object { " - $_" }) -join "`n"
throw "Failed to install ffmpeg from all sources.`n$detail"
