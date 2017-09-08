#!/usr/bin/env powershell
param($Platform)

$global:ErrorActionPreference = "Stop"

trap {
  Write-Output $_
  exit 1
}

function Wait-For-Unity-Exit($path) {
  $offset = 0
  $outcome = "nothing";
  $running = $true;
  while ($running) {
    if (!(Test-Path $path)) {
      sleep 1;
      Write-Host "Waiting for Unity to start...";
      continue;
    }
    $s = (Get-Content -Raw $path);
    if ($s.Length -le $offset) {
      sleep 1;
      continue;
    }
    $l = $s.Substring($offset);
    if ($l.Length -eq 0) {
      sleep 1;
      continue;
    }
    Write-Host -NoNewline $l
    if ($l.Contains("Created game lobby")) {
      $outcome = "success";
      $running = $false;
      break;
    } elseif ($l.Contains("Exception")) {
      $outcome = "failure";
      $running = $false;
      break;
    } elseif ((Get-Process | where -FilterScript {$_.Name -eq "HiveMPTest"}).Count -eq 0) {
      # Game exited but we didn't see "Created game lobby"
      $outcome = "failure";
      $running = $false;
      break;
    }
    $offset += $l.Length;
    sleep -Milliseconds 100;
  }
  while ((Get-Process | where -FilterScript {$_.Name -eq "HiveMPTest"}).Count -gt 0) {
    Write-Host "Waiting for test game to exit...";
    sleep -Seconds 1;
  }
  return $outcome;
}

if (Test-Path "$PSScriptRoot\UnityBuilds\$Platform\Unity.log") {
  rm -Force "$PSScriptRoot\UnityBuilds\$Platform\Unity.log"
}
$suffix = ""
if ($Platform.Contains("Win")) {
  $suffix = ".exe"
}
$game = "$PSScriptRoot\UnityBuilds\$Platform\HiveMPTest$suffix"
cd "$PSScriptRoot\UnityBuilds\$Platform"
Write-Output "Running in $PSScriptRoot\UnityBuilds\$Platform"
Write-Output "Executing $PSScriptRoot\UnityBuilds\$Platform\HiveMPTest$suffix"
& $game -batchmode -nographics -logFile "$PSScriptRoot\UnityBuilds\$Platform\Unity.log"
if ($LastExitCode -ne 0) {
  Write-Output "Last exit code was $LastExitCode"
  Write-Error "Game didn't start correctly!"
  exit 1;
}
$outcome = (Wait-For-Unity-Exit "$PSScriptRoot\UnityBuilds\$Platform\Unity.log");
Write-Host "Outcome is $outcome!";
if ($outcome -eq "retry") {
  Sleep -Seconds 30
  continue;
}