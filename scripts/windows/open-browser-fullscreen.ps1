param(
  [Parameter(Mandatory = $true)]
  [string]$BrowserExe,

  [Parameter(Mandatory = $true)]
  [string]$Url,

  [ValidateSet("edge", "chrome")]
  [string]$Mode = "edge"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BrowserExe)) {
  exit 1
}

$argList = @("--new-window")
if ($Mode -eq "edge") {
  $argList += @("--kiosk", $Url, "--edge-kiosk-type=fullscreen")
} else {
  $argList += @("--start-fullscreen", $Url)
}

try {
  $proc = Start-Process -FilePath $BrowserExe -ArgumentList $argList -PassThru
} catch {
  exit 1
}

if ($null -eq $proc) {
  exit 1
}

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

    try {
      $fallback = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
        Sort-Object StartTime -Descending |
        Where-Object { $_.MainWindowHandle -ne 0 } |
        Select-Object -First 1
      if ($null -ne $fallback) {
        return $fallback.MainWindowHandle
      }
    } catch {
    }

    Start-Sleep -Milliseconds 250
  }

  return [IntPtr]::Zero
}

$processName = [System.IO.Path]::GetFileNameWithoutExtension($BrowserExe)
$activated = $false

try {
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

  $handle = Get-MainWindowHandle -ProcessRef $proc -ProcessName $processName
  if ($handle -ne [IntPtr]::Zero) {
    [void][WinApi.NativeMethods]::ShowWindowAsync($handle, $SW_RESTORE)
    [void][WinApi.NativeMethods]::ShowWindowAsync($handle, $SW_MAXIMIZE)
    [void][WinApi.NativeMethods]::SetWindowPos($handle, $HWND_TOPMOST, 0, 0, 0, 0, ($SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_SHOWWINDOW))
    [void][WinApi.NativeMethods]::SetForegroundWindow($handle)
    $activated = $true
  }
} catch {
}

if (-not $activated) {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $deadline = (Get-Date).AddSeconds(8)
    while ((Get-Date) -lt $deadline) {
      if ($shell.AppActivate($proc.Id)) {
        $activated = $true
        break
      }

      try {
        $fallbackProc = Get-Process -Name $processName -ErrorAction SilentlyContinue |
          Sort-Object StartTime -Descending |
          Select-Object -First 1
        if ($null -ne $fallbackProc -and $shell.AppActivate($fallbackProc.Id)) {
          $activated = $true
          break
        }
      } catch {
      }

      Start-Sleep -Milliseconds 250
    }
  } catch {
  }
}

exit 0
