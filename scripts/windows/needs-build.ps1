param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,

  [switch]$ForceBuild
)

$root = [System.IO.Path]::GetFullPath($ProjectRoot)
$distIndex = Join-Path $root "panku\index.html"

if ($ForceBuild) {
  Write-Output "YES"
  exit 0
}

if (-not (Test-Path $distIndex)) {
  Write-Output "YES"
  exit 0
}

$distTime = (Get-Item $distIndex).LastWriteTimeUtc
$watchItems = @(
  "src",
  "public",
  "index.html",
  "vite.config.js",
  "package.json",
  "package-lock.json"
)

foreach ($item in $watchItems) {
  $full = Join-Path $root $item
  if (-not (Test-Path $full)) {
    continue
  }

  $entry = Get-Item $full
  if ($entry.PSIsContainer) {
    $newer = Get-ChildItem -Path $full -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -gt $distTime } |
      Select-Object -First 1
    if ($null -ne $newer) {
      Write-Output "YES"
      exit 0
    }
  } else {
    if ($entry.LastWriteTimeUtc -gt $distTime) {
      Write-Output "YES"
      exit 0
    }
  }
}

Write-Output "NO"
exit 0
