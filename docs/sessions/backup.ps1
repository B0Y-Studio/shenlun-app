# docs/sessions/backup.ps1
# Purpose: archive _current.md into dated md + zip; generate memory.
# Usage:
#   1) write today session draft into docs/sessions/_current.md
#   2) in ZCode say "backup today" - AI runs this script.
#
# Run:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\hecto\ZCodeProject\docs\sessions\backup.ps1"
#
# Optional:
#   -Now "2026-07-13 22:30"        custom timestamp
#   -DraftPath "..."               custom draft path (default _current.md)
#   -SessionsDir "..."             custom sessions dir

param(
    [string]$Now = (Get-Date -Format "yyyy-MM-dd HH:mm"),
    [string]$DraftPath = "",
    [string]$SessionsDir = ""
)

# --- locate paths ---
$ProjectRoot = "C:\Users\hecto\ZCodeProject"
$Docs = if ($SessionsDir) { $SessionsDir } else { Join-Path $ProjectRoot "docs\sessions" }
$Mem = Join-Path $Docs "memory"
$Draft = if ($DraftPath) { $DraftPath } else { Join-Path $Docs "_current.md" }

if (-not (Test-Path $Draft)) {
    Write-Host "[ERROR] Draft not found: $Draft" -ForegroundColor Red
    exit 1
}

# --- date / seq ---
$Date = (Get-Date $Now -Format "yyyy-MM-dd")
$Time = (Get-Date $Now -Format "HH-mm")
$Existing = Get-ChildItem -Path $Docs -Filter "$($Date)-session-*.md" -ErrorAction SilentlyContinue
$Seq = if ($Existing) { ($Existing.Count + 1).ToString("D3") } else { "001" }

$NewName = "$Date-session-$Seq.md"
$NewPath = Join-Path $Docs $NewName
$ZipPath = Join-Path $Docs "$Date-session-$Seq.zip"

# --- write archive md ---
$DraftBody = Get-Content -Raw -Encoding UTF8 $Draft
$Header = "# Session $Date #$Seq ($Time)`n`n> auto-archive by backup.ps1`n> source: $Draft`n> timestamp: $Now`n`n---`n`n"
Set-Content -Path $NewPath -Value ($Header + $DraftBody) -Encoding UTF8
Write-Host "[OK] Wrote $NewPath" -ForegroundColor Green

# --- zip (single file archive) ---
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $NewPath, $NewName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
$zip.Dispose()
Write-Host "[OK] Zipped $ZipPath" -ForegroundColor Green

# --- memory generator ---
$GenScript = Join-Path $ProjectRoot "docs\sessions\generate-memory.ps1"
if (Test-Path $GenScript) {
    Write-Host "[INFO] Running memory generator..." -ForegroundColor Cyan
    $genArgs = "-ExecutionPolicy Bypass -File `"$GenScript`" -NewSessionPath `"$NewPath`" -MemoryDir `"$Mem`""
    $proc = Start-Process -FilePath "powershell" -ArgumentList $genArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        Write-Host "[WARN] generate-memory.ps1 exited with code $($proc.ExitCode)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARN] generate-memory.ps1 not found, skipping memory update" -ForegroundColor Yellow
}

# --- index ---
$IndexPath = Join-Path $Docs "_index.md"
$Line = "- [$Date #$Seq]($NewName) - $Time"
if (-not (Test-Path $IndexPath)) {
    "# Session Index`n`n" | Set-Content -Path $IndexPath -Encoding UTF8
}
Add-Content -Path $IndexPath -Value $Line -Encoding UTF8
Write-Host "[OK] Updated $IndexPath" -ForegroundColor Green

# --- archive draft ---
$Done = Join-Path $Docs "_archive_drafts"
if (-not (Test-Path $Done)) { New-Item -ItemType Directory -Path $Done | Out-Null }
$DoneDraft = Join-Path $Done "$Date-session-$Seq-source.md"
Move-Item -Path $Draft -Destination $DoneDraft -Force
Write-Host "[OK] Archived draft to $DoneDraft" -ForegroundColor Green

Write-Host ""
Write-Host "=== backup.ps1 done ===" -ForegroundColor Cyan