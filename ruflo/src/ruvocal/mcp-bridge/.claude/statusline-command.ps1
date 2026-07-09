# RuVector Intelligence Statusline for Windows PowerShell
# Compatible with PowerShell 5.1+ and PowerShell Core
$ErrorActionPreference = "SilentlyContinue"
$e = [char]27
$inputData = [Console]::In.ReadToEnd()
$data = $inputData | ConvertFrom-Json
$Model = if ($data.model.display_name) { $data.model.display_name } else { "Claude" }
$CWD = if ($data.workspace.current_dir) { $data.workspace.current_dir } else { $data.cwd }
$Dir = Split-Path -Leaf $CWD
$Branch = $null
try { Push-Location $CWD -ErrorAction Stop; $Branch = git branch --show-current 2>$null; Pop-Location } catch {}
Write-Host "$e[1m$Model$e[0m in $e[36m$Dir$e[0m$(if($Branch){" on $e[33m$Branch$e[0m"})"
$IntelFile = Join-Path $CWD ".ruvectorintelligence.json"
if (Test-Path $IntelFile) {
  $Intel = Get-Content $IntelFile -Raw | ConvertFrom-Json
  $Mem = if ($Intel.memories) { $Intel.memories.Count } else { 0 }
  $Traj = if ($Intel.trajectories) { $Intel.trajectories.Count } else { 0 }
  $Sess = if ($Intel.stats -and $Intel.stats.session_count) { $Intel.stats.session_count } else { 0 }
  $Pat = if ($Intel.patterns) { ($Intel.patterns | Get-Member -MemberType NoteProperty).Count } else { 0 }
  $Line2 = "$e[35m RuVector$e[0m"
  if ($Pat -gt 0) { $Line2 += " $e[32m$Pat patterns$e[0m" } else { $Line2 += " $e[2mlearning$e[0m" }
  if ($Mem -gt 0) { $Line2 += " $e[34m$Mem mem$e[0m" }
  if ($Traj -gt 0) { $Line2 += " $e[33m$Traj traj$e[0m" }
  if ($Sess -gt 0) { $Line2 += " $e[2m#$Sess$e[0m" }
  Write-Host $Line2
} else {
  Write-Host "$e[2m RuVector: run 'npx ruvector hooks session-start'$e[0m"
}
