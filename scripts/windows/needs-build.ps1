param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [switch]$ForceBuild,

  [switch]$WriteSignature
)

$ErrorActionPreference = 'Stop'

function Get-RelativePath {
  param(
    [string]$Root,
    [string]$FullPath
  )

  return $FullPath.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/').ToLowerInvariant()
}

function Is-IgnoredPath {
  param(
    [string]$Root,
    [string]$FullPath
  )

  $relative = Get-RelativePath -Root $Root -FullPath $FullPath
  return $relative.StartsWith('public/hls/') -or $relative.StartsWith('panku/hls/')
}

function Get-WatchFiles {
  param([string]$Root)

  $watchItems = @(
    "src",
    "public",
    "index.html",
    "vite.config.js",
    "package.json",
    "package-lock.json"
  )

  $files = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'
  foreach ($item in $watchItems) {
    $full = Join-Path $Root $item
    if (-not (Test-Path -LiteralPath $full)) {
      continue
    }

    $entry = Get-Item -LiteralPath $full
    if ($entry.PSIsContainer) {
      Get-ChildItem -LiteralPath $full -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        if (-not (Is-IgnoredPath -Root $Root -FullPath $_.FullName)) {
          [void]$files.Add($_)
        }
      }
    } else {
      if (-not (Is-IgnoredPath -Root $Root -FullPath $entry.FullName)) {
        [void]$files.Add($entry)
      }
    }
  }

  return $files | Sort-Object FullName
}

function Get-SourceSignature {
  param([string]$Root)

  $lines = foreach ($file in (Get-WatchFiles -Root $Root)) {
    $relativePath = Get-RelativePath -Root $Root -FullPath $file.FullName
    "$relativePath`:$($file.Length)`:$($file.LastWriteTimeUtc.Ticks)"
  }

  $joined = $lines -join "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $digest = $sha256.ComputeHash($bytes)
  } finally {
    $sha256.Dispose()
  }

  return ([System.BitConverter]::ToString($digest).Replace('-', '').ToLowerInvariant())
}

$projectRootInput = "$ProjectRoot".Trim()
$projectRootClean = $projectRootInput.Trim('"')
if ([string]::IsNullOrWhiteSpace($projectRootClean)) {
  throw "ProjectRoot is empty."
}

$root = [System.IO.Path]::GetFullPath($projectRootClean)
$distIndex = Join-Path $root "panku\index.html"
$signatureFile = Join-Path $root "panku\.build-source-hash"

if ($WriteSignature) {
  if (-not (Test-Path -LiteralPath $distIndex)) {
    exit 0
  }

  $signature = Get-SourceSignature -Root $root
  Set-Content -LiteralPath $signatureFile -Value $signature -NoNewline -Encoding ASCII
  Write-Output $signature
  exit 0
}

if ($ForceBuild) {
  Write-Output "YES"
  exit 0
}

if (-not (Test-Path -LiteralPath $distIndex)) {
  Write-Output "YES"
  exit 0
}

$currentSignature = Get-SourceSignature -Root $root

if (Test-Path -LiteralPath $signatureFile) {
  $savedSignature = (Get-Content -LiteralPath $signatureFile -Raw -ErrorAction SilentlyContinue).Trim().ToLowerInvariant()
  if ($savedSignature -eq $currentSignature) {
    Write-Output "NO"
  } else {
    Write-Output "YES"
  }
  exit 0
}

Write-Output "YES"
exit 0
