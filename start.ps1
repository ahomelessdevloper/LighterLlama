Set-Location $PSScriptRoot

Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Remove-Item -Recurse -Force ".\node_modules\.vite" -ErrorAction SilentlyContinue

Write-Host "Starting LighterLlama at http://localhost:5173"
Write-Host "Compare page: http://localhost:5173/#compare"
npm run dev