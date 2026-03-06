param(
  [Parameter(Mandatory = $true)]
  [string]$WebhookUrl
)

$ErrorActionPreference = 'Stop'

$url = "$WebhookUrl".Trim().Trim('"')
if ([string]::IsNullOrWhiteSpace($url)) {
  throw 'WebhookUrl is empty.'
}

# Use \u escapes to avoid encoding issues on legacy Windows code pages.
$payload = '{"msgtype":"text","text":{"content":"\u672a\u6765\u4e2d\u5fc3\u76d1\u63a7\u5927\u5c4f\u5df2\u5f00\u542f\uff0c\u6709\u5bb6\u957f\u5728\u7ebf\u89c2\u770b\uff0c\u8bf7\u5404\u4f4d\u8001\u5e08\u7559\u610f\u8a00\u884c\u4e3e\u6b62\uff0c\u8f9b\u82e6\u5927\u5bb6\uff5e"}}'

try {
  $resp = Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Body $payload
  if ($null -ne $resp -and $resp.errcode -eq 0) {
    Write-Host '[ok] WeCom webhook sent.'
    exit 0
  }

  $errCode = if ($null -ne $resp) { $resp.errcode } else { 'unknown' }
  $errMsg = if ($null -ne $resp) { $resp.errmsg } else { 'empty response' }
  Write-Error "Webhook failed: errcode=$errCode, errmsg=$errMsg"
  exit 1
} catch {
  Write-Error "Webhook request error: $($_.Exception.Message)"
  exit 1
}
