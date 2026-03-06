param(
  [Parameter(Mandatory = $true)]
  [string]$BrowserExe,

  [Parameter(Mandatory = $true)]
  [string]$Url,

  [ValidateSet("edge", "chrome")]
  [string]$Mode = "edge"
)

if (-not (Test-Path -LiteralPath $BrowserExe)) {
  Write-Error "Browser executable not found: $BrowserExe"
  exit 1
}

$argList = @("--new-window")
if ($Mode -eq "edge") {
  $argList += @("--kiosk", $Url, "--edge-kiosk-type=fullscreen")
} else {
  $argList += @("--start-fullscreen", $Url)
}

$proc = Start-Process -FilePath $BrowserExe -ArgumentList $argList -PassThru
if ($null -eq $proc) {
  Write-Error "Failed to start browser process."
  exit 1
}

Add-Type -Namespace WinApi -Name NativeMethods -MemberDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
"@

$SW_RESTORE = 9
$SW_MAXIMIZE = 3
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_SHOWWINDOW = 0x0040
$HWND_TOPMOST = [IntPtr](-1)

function Get-MainWindowHandle {
  param(
    [System.Diagnostics.Process]$ProcessRef,
    [string]$ProcessName
  )

  $deadline = (Get-Date).AddSeconds(12)
  while ((Get-Date) -lt $deadline) {
    try {
      $ProcessRef.Refresh()
      if ($ProcessRef.MainWindowHandle -ne 0) {
        return $ProcessRef.MainWindowHandle
      }
    } catch {
    }

    $fallback = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
      Sort-Object StartTime -Descending |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
    if ($null -ne $fallback) {
      return $fallback.MainWindowHandle
    }

    Start-Sleep -Milliseconds 250
  }

  return [IntPtr]::Zero
}

$processName = [System.IO.Path]::GetFileNameWithoutExtension($BrowserExe)
$handle = Get-MainWindowHandle -ProcessRef $proc -ProcessName $processName
if ($handle -eq [IntPtr]::Zero) {
  Write-Warning "Browser started but no window handle found; skip foreground activation."
  exit 0
}

[void][WinApi.NativeMethods]::ShowWindowAsync($handle, $SW_RESTORE)
[void][WinApi.NativeMethods]::ShowWindowAsync($handle, $SW_MAXIMIZE)
[void][WinApi.NativeMethods]::SetWindowPos($handle, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW))
[void][WinApi.NativeMethods]::SetForegroundWindow($handle)

exit 0
