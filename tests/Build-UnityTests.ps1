#!/usr/bin/env powershell
param()

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
    if ($l.Contains("Exiting batchmode successfully")) {
      $outcome = "success";
      $running = $false;
      break;
    } elseif ($l.Contains("cubemap not supported")) {
      # Intermittent failure? :/
      $outcome = "retry";
      $running = $false;
      break;
    } elseif ($l.Contains("Exiting batchmode") -or $l.Contains("Aborting batchmode")) {
      $outcome = "failure";
      $running = $false;
      break;
    }
    $offset += $l.Length;
    sleep -Milliseconds 100;
  }
  while ((Get-Process | where -FilterScript {$_.Name -eq "Unity"}).Count -gt 0) {
    Write-Host "Waiting for Unity to exit...";
    sleep -Seconds 1;
  }
  return $outcome;
}

function Do-Unity-Build($uPlatform, $platform) {
  while ($true) {
    echo "Cleaning tests/UnityTest..."
    try {
      taskkill /f /im Unity.exe
    } catch { }
    git clean -xdff "$PSScriptRoot\..\tests\UnityTest"
    if ($LastExitCode -ne 0) {
      exit 1;
    }
    git checkout HEAD -- "$PSScriptRoot\..\tests\UnityTest"
    if ($LastExitCode -ne 0) {
      exit 1;
    }
    
    echo "Unpacking SDK package..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem;
    $sdkName = (Get-Item $PSScriptRoot\..\Unity-SDK*.zip).FullName;
    echo $sdkName
    [System.IO.Compression.ZipFile]::ExtractToDirectory($sdkName, "$PSScriptRoot\..\tests\UnityTest\Assets\HiveMP");

    echo "Building project for $platform..."
    if (Test-Path "$PSScriptRoot\..\tests\UnityTest\Unity.log") {
      rm -Force "$PSScriptRoot\..\tests\UnityTest\Unity.log"
    }
    $unity = "C:\Program Files\Unity\Editor\Unity.exe"
    if (Test-Path "C:\Program Files\Unity_5.4.1f\Editor\Unity.exe") {
      $unity = "C:\Program Files\Unity_5.4.1f\\Editor\Unity.exe"
    }
    $suffix = ""
    if ($platform.Contains("Win")) {
      $suffix = ".exe";
    }
    & $unity -quit -batchmode -force-d3d9 -nographics -projectPath "$PSScriptRoot\..\tests\UnityTest" $uPlatform "$PSScriptRoot\..\tests\UnityBuilds\$platform\HiveMPTest$suffix" -logFile "$PSScriptRoot\..\tests\UnityTest\Unity.log"
    if ($LastExitCode -ne 0) {
      Write-Error "Unity didn't start correctly!"
      exit 1;
    }
    $outcome = (Wait-For-Unity-Exit "$PSScriptRoot\..\tests\UnityTest\Unity.log");
    Write-Host "Outcome is $outcome!";
    if ($outcome -eq "retry") {
      Sleep -Seconds 30
      continue;
    }
    if ($outcome -eq "success") {
      return;
    } else {
      Write-Error "Unity didn't build successfully!"
      exit 1;
    }
    break;
  }
}

cd $PSScriptRoot\..

Do-Unity-Build "-buildLinux32Player" "Linux32"
Do-Unity-Build "-buildLinux64Player" "Linux64"
Do-Unity-Build "-buildOSXPlayer" "Mac32"
Do-Unity-Build "-buildOSX64Player" "Mac64"
Do-Unity-Build "-buildWindowsPlayer" "Win32"
Do-Unity-Build "-buildWindows64Player" "Win64"