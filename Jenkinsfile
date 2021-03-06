def gcloud = evaluate readTrusted("jenkins/gcloud.groovy")
def hashing = evaluate readTrusted("jenkins/hashing.groovy")
def caching = evaluate readTrusted("jenkins/caching.groovy")

def enableUnity = true;
def enableUnrealEngine = true;
def enableTypeScript = true;
def enableCSharp = true;

def enabledTargetsString = 'Targets-';
if (enableUnity) {
    enabledTargetsString += '-Unity';
}
if (enableUnrealEngine) {
    enabledTargetsString += '-UE4';
}
if (enableTypeScript) {
    enabledTargetsString += '-TypeScript';
}
if (enableCSharp) {
    enabledTargetsString += '-CSharp';
}

def sdkVersion = "";
def supportedUnityVersions = [
    "5.4.1f": [
        "Linux32",
        "Linux64",
        "Mac32",
        "Mac64",
        "Win32",
        "Win64",
    ],
    "2017.1.1f1": [
        "Linux32",
        "Linux64",
        "Mac32",
        "Mac64",
        "Win32",
        "Win64",
    ],
    "2017.2.0f3": [
        "Linux32",
        "Linux64",
        "Mac32",
        "Mac64",
        "Win32",
        "Win64",
    ],
    "2017.3.0f3": [
        "Linux64",
        "MacUniversal",
        "Win32",
        "Win64",
    ],
    "2018.1.7f1": [
        "Linux64",
        "MacUniversal",
        "Win32",
        "Win64",
    ],
];
def supportedUnrealVersions = [
    "4.18": [
        "Win64"
    ],
    "4.19": [
        "Win64"
    ],
    "4.20": [
        "Win64"
    ],
];
def clientConnectPlatformCaches = [
    "Win32",
    "Win64",
    "Mac64",
    "Linux32",
    "Linux64"
]
def preloaded = [:]
def testsAlreadyRan = [:]
def gitCommit = ""
def clientConnectHash = ""
// If changing the steps related to Client Connect build, increase this number.
def clientConnectBuildConfigVersion = "3"
def mainBuildHash = ""
// If changing the steps related to the main build, increase this number.
def mainBuildConfigVersion = "4"
def ualBuildHash = ""
def ualBuildConfigVersion = "3"
if (env.CHANGE_TARGET != null) {
    stage("Confirm") {
        input "Approve this PR build to run? Check the PR first!"
    }
}
stage("Setup") {
    node('linux') {
        timeout(15) {
            gitCommit = checkout(poll: false, changelog: false, scm: scm).GIT_COMMIT
            sh ('echo ' + gitCommit)
            sh 'git clean -xdf'
            sh 'git submodule update --init --recursive'
            sh 'git submodule foreach --recursive git clean -xdf'
            sdkVersion = readFile 'SdkVersion.txt'
            sdkVersion = sdkVersion.trim()
            clientConnectHash = hashing.hashEntriesEx(
                clientConnectBuildConfigVersion,
                [
                    'client_connect/'
                ],
                [
                    sdkVersion
                ]
            );
            mainBuildHash = hashing.hashEntriesEx(
                mainBuildConfigVersion,
                [
                    'client_connect/',
                    'targets/',
                    'sdks/',
                    'util/',
                    'tests/',
                    'tests/Run-UnityTest.ps1',
                    'tests/Run-UE4Test.ps1',
                    'tests/Run-TypeScriptTest.ps1',
                    'index.ts',
                    'SdkVersion.txt'
                ],
                [
                    enabledTargetsString,
                    sdkVersion
                ]
            );
            ualBuildHash = hashing.hashEntries(
                clientConnectBuildConfigVersion,
                [ ]
            );
        }
    }
}
stage("Detect Caches") {
    node('linux') {
        gcloud.installGCloudKvIfNeeded()

        def parallelMap = [:]
        clientConnectPlatformCaches.each {
            parallelMap["ClientConnect-" + it] = {
                caching.checkPreloaded(gcloud, preloaded, clientConnectHash, 'ClientConnect-' + it, 'Cloud Connect for target "' + it + '"')
            }
        }
        parallelMap["UAL"] = {
            caching.checkPreloaded(gcloud, preloaded, ualBuildHash, 'UAL', 'UAL')
        }
        parallelMap["SDKs"] = {
            def components = [
                'Assets'
            ];
            if (enableTypeScript) {
                components.add('RunTypeScriptTest');
                components.add('TypeScriptTestUncompiled');
            }
            if (enableUnity) {
                components.add('RunUnityTest');
                supportedUnityVersions.keySet().each { version ->
                    components.add('Unity' + version + 'TestUncompiled');
                };
            }
            if (enableUnrealEngine) {
                components.add('RunUE4Test');
                supportedUnrealVersions.keySet().each { version ->
                    components.add('UE' + version + 'TestUncompiled');
                };
            }
            caching.checkMultiplePreloaded(gcloud, preloaded, mainBuildHash, 'SDKs', components, 'SDKs')
        }
        if (enableTypeScript) {
            parallelMap["TypeScript"] =
            {
                caching.checkPreloaded(gcloud, preloaded, mainBuildHash, 'CompiledTest-TypeScript', 'compiled TypeScript test')
                testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-TypeScript'] = gcloud.keyExists('RUNTEST-' + mainBuildHash + 'CompiledTest-TypeScript')
            }
        }
        if (enableUnity) {
            supportedUnityVersions.each { version, platforms -> 
                platforms.each { platform ->
                    parallelMap["Unity-" + version + "-" + platform] =
                    {
                        caching.checkPreloaded(gcloud, preloaded, mainBuildHash, 'CompiledTest-Unity-' + version + '-' + platform, 'compiled Unity ' + version + ' test for ' + platform)
                        testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform] = gcloud.keyExists('RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform)
                    }
                }
            }
        }
        if (enableUnrealEngine) {
            supportedUnrealVersions.each { version, platforms -> 
                platforms.each { platform ->
                    parallelMap["UnrealEngine-" + version + "-" + platform] =
                    {
                        caching.checkPreloaded(gcloud, preloaded, mainBuildHash, 'CompiledTest-Unreal-' + version + '-' + platform, 'compiled Unreal Engine ' + version + ' test for ' + platform)
                        testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-Unreal-' + version + '-' + platform] = gcloud.keyExists('RUNTEST-' + mainBuildHash + 'CompiledTest-Unreal-' + version + '-' + platform)
                    }
                }
            }
        }
        parallel (parallelMap)
    }
}
stage("Build Client Connect") {
    def parallelMap = [:]
    parallelMap["Win32"] = {
        if (!preloaded["ClientConnect-Win32"]) {
            node('windows-hicpu') {
                timeout(20) {
                    checkout(poll: false, changelog: false, scm: scm)
                    bat 'git clean -xdf'
                    bat 'git submodule update --init --recursive'
                    bat 'git submodule foreach --recursive git clean -xdf'
                    bat 'yarn'
                    bat 'pwsh client_connect\\Build-Init.ps1 Win32'
                    bat 'pwsh client_connect\\Build-Arch.ps1 Win32'
                    caching.pushCacheDirectory(gcloud, hashing, clientConnectHash, 'ClientConnect-Win32', 'client_connect/sdk/Win32')
                }
            }
        } else {
            echo ("Already built");
        }
    };
    parallelMap["Win64"] = {
        if (!preloaded["ClientConnect-Win64"]) {
            node('windows-hicpu') {
                timeout(20) {
                    checkout(poll: false, changelog: false, scm: scm)
                    bat 'git clean -xdf'
                    bat 'git submodule update --init --recursive'
                    bat 'git submodule foreach --recursive git clean -xdf'
                    bat 'yarn'
                    bat 'pwsh client_connect\\Build-Init.ps1 Win64'
                    bat 'pwsh client_connect\\Build-Arch.ps1 Win64'
                    caching.pushCacheDirectory(gcloud, hashing, clientConnectHash, 'ClientConnect-Win64', 'client_connect/sdk/Win64')
                }
            }
        } else {
            echo ("Already built");
        }
    };
    parallelMap["Mac64"] = {
        if (!preloaded["ClientConnect-Mac64"]) {
            node('mac') {
                timeout(20) {
                    checkout(poll: false, changelog: false, scm: scm)
                    sh 'git clean -xdf'
                    sh 'git submodule update --init --recursive'
                    sh 'git submodule foreach --recursive git clean -xdf'
                    sh 'yarn'
                    sh 'pwsh client_connect/Build-Init.ps1 Mac64'
                    sh 'pwsh client_connect/Build-Arch.ps1 Mac64'
                    caching.pushCacheDirectory(gcloud, hashing, clientConnectHash, 'ClientConnect-Mac64', 'client_connect/sdk/Mac64')
                }
            }
        } else {
            echo ("Already built");
        }
    };
    parallelMap["Linux32"] = {
        if (!preloaded["ClientConnect-Linux32"]) {
            node('linux') {
                timeout(20) {
                    checkout(poll: false, changelog: false, scm: scm)
                    sh 'git clean -xdf'
                    sh 'git submodule update --init --recursive'
                    sh 'git submodule foreach --recursive git clean -xdf'
                    sh 'yarn'
                    sh 'pwsh client_connect/Build-Init.ps1 Linux32'
                    sh 'pwsh client_connect/Build-Arch.ps1 Linux32'
                    caching.pushCacheDirectory(gcloud, hashing, clientConnectHash, 'ClientConnect-Linux32', 'client_connect/sdk/Linux32')
                }
            }
        } else {
            echo ("Already built");
        }
    };
    parallelMap["Linux64"] = {
        if (!preloaded["ClientConnect-Linux64"]) {
            node('linux') {
                timeout(20) {
                    checkout(poll: false, changelog: false, scm: scm)
                    sh 'git clean -xdf'
                    sh 'git submodule update --init --recursive'
                    sh 'git submodule foreach --recursive git clean -xdf'
                    sh 'yarn'
                    sh 'pwsh client_connect/Build-Init.ps1 Linux64'
                    sh 'pwsh client_connect/Build-Arch.ps1 Linux64'
                    caching.pushCacheDirectory(gcloud, hashing, clientConnectHash, 'ClientConnect-Linux64', 'client_connect/sdk/Linux64')
                }
            }
        } else {
            echo ("Already built");
        }
    };
    parallel (parallelMap)
}
stage("Build UAL") {
    if (!preloaded["UAL"]) {
        node('windows') {
            timeout(30) {
                dir('ual_build') {
                    git changelog: false, poll: false, url: 'https://github.com/RedpointGames/UnityAutomaticLicensor'
                    bat 'dotnet publish -c Release -r win10-x64'
                    powershell 'Move-Item -Force UnityAutomaticLicensor\\bin\\Release\\netcoreapp2.1\\win10-x64\\publish ..\\ual'
                }
                caching.pushCacheDirectory(gcloud, hashing, ualBuildHash, 'UAL', 'ual')
            }
        }
    } else {
        echo ('No need to build UAL, it\'s already cached')
    }
}
if (preloaded["SDKs"]) {
    // Just emit all the stages, we don't have any steps for them because it's all preloaded.
    stage("Checkout") {
        echo ("Already built");
    }
    stage("Generate CC Embed for UE4") {
        echo ("Already built");
    }
    stage("Download Client Connect") {
        echo ("Already built");
    }
    stage("Generate") { 
        def parallelMap = [:]
        if (enableCSharp) {
            parallelMap["CSharp-4.5"] = {
                echo ("Already built");
            };
            parallelMap["CSharp-3.5"] = {
                echo ("Already built");
            };
        }
        if (enableUnity) {
            parallelMap["Unity"] = {
                echo ("Already built");
            };
        }
        if (enableTypeScript) {
            parallelMap["TypeScript"] = {
                echo ("Already built");
            };
        }
        if (enableUnrealEngine) {
            supportedUnrealVersions.each { version, platforms ->
                parallelMap["UnrealEngine-" + version] = {
                    echo ("Already built");
                };
            }
        }
        parallel (parallelMap)
    }
    if (enableUnity) {
        stage("Licensing") {
            echo ("Already built");
        }
    }
    stage("Package") {
        echo ("Already built");
    }
    stage("Stash Assets") {
        echo ("Already built");
    }
    stage("Generate Tests") {
        def parallelMap = [:]
        parallelMap["Stash-Test-Scripts"] = {
            echo ("Already built");
        };
        if (enableTypeScript) {
            parallelMap["TypeScript"] = {
                echo ("Already built");
            };
        }
        if (enableUnrealEngine) {
            supportedUnrealVersions.each { version, platforms ->
                parallelMap["UnrealEngine-" + version] = {
                    echo ("Already built");
                };
            }
        }
        if (enableUnity) {
            supportedUnityVersions.keySet().each { version ->
                parallelMap["Unity-" + version] = {
                    echo ("Already built");
                };
            }
        }
        parallel (parallelMap)
    }
} else {
    node('windows') {
        stage("Checkout") {
            timeout(60) {
                checkout(poll: false, changelog: false, scm: scm)
                bat 'git clean -xdf'
                bat 'git submodule update --init --recursive'
                bat 'git submodule foreach --recursive git clean -xdf'
                bat 'yarn'
            }
        }
        stage("Generate CC Embed for UE4") {
            // This is required because the UE4 SDK generator embeds the Client Connect
            // source code directly inside itself, and it therefore needs embed.cpp to
            // be available to copy. However, because Client Connect might not have been
            // built on this machine (or even built during this run at all), we need to
            // manually call the embed.ps1 script to generate it.
            timeout(10) {
                bat 'pwsh client_connect/patch.ps1'
                bat 'pwsh client_connect/cchost/embed.ps1'
            }
        }
        stage("Download Client Connect") {
            caching.pullCacheDirectoryMultiple(gcloud, hashing, clientConnectHash, [
                [
                    id: 'ClientConnect-Win32', 
                    dir: 'client_connect/sdk/Win32', 
                    targetType: 'dir',
                ],
                [
                    id: 'ClientConnect-Win64', 
                    dir: 'client_connect/sdk/Win64', 
                    targetType: 'dir',
                ],
                [
                    id: 'ClientConnect-Mac64', 
                    dir: 'client_connect/sdk/Mac64', 
                    targetType: 'dir',
                ],
                [
                    id: 'ClientConnect-Linux32', 
                    dir: 'client_connect/sdk/Linux32', 
                    targetType: 'dir',
                ],
                [
                    id: 'ClientConnect-Linux64', 
                    dir: 'client_connect/sdk/Linux64', 
                    targetType: 'dir',
                ],
            ]);
        }
        stage("Generate") {
            def parallelMap = [:]
            if (enableCSharp) {
                parallelMap["CSharp-4.5"] = {
                    timeout(15) {
                        bat 'yarn run generator generate --client-connect-sdk-path client_connect/sdk -c CSharp-4.5 dist/CSharp-4.5'
                        bat 'cd dist/CSharp-4.5 && dotnet restore HiveMP.sln && dotnet build -c Release HiveMP.sln'
                    }
                };
                parallelMap["CSharp-3.5"] = {
                    timeout(15) {
                        bat 'yarn run generator generate --client-connect-sdk-path client_connect/sdk -c CSharp-3.5 dist/CSharp-3.5'
                        bat 'pwsh util/Fetch-NuGet.ps1'
                        bat 'cd dist/CSharp-3.5 && nuget restore && %windir%\\Microsoft.NET\\Framework64\\v4.0.30319\\msbuild /p:Configuration=Release /m HiveMP.sln'
                    }
                };
            }
            if (enableUnity) {
                parallelMap["Unity"] = {
                    timeout(5) {
                        bat 'yarn run generator generate --client-connect-sdk-path client_connect/sdk -c Unity dist/Unity'
                    }
                };
            }
            if (enableTypeScript) {
                parallelMap["TypeScript"] = {
                    timeout(5) {
                        bat 'yarn run generator generate --client-connect-sdk-path client_connect/sdk -c TypeScript dist/TypeScript'
                    }
                };
            }
            if (enableUnrealEngine) {
                supportedUnrealVersions.each { version, platforms ->
                    parallelMap["UnrealEngine-" + version] =
                    {
                        timeout(5) {
                            bat 'yarn run generator generate --client-connect-sdk-path client_connect/sdk -c UnrealEngine-' + version + ' dist/UnrealEngine-' + version
                        }
                    };
                }
            }
            parallel (parallelMap)
        }
        if (enableUnity) {
            stage("Licensing") {
                withCredentials([usernamePassword(credentialsId: 'unity-license-account', passwordVariable: 'UNITY_LICENSE_PASSWORD', usernameVariable: 'UNITY_LICENSE_USERNAME')]) {
                    timeout(30) {
                        caching.pullCacheDirectory(gcloud, hashing, ualBuildHash, 'UAL', 'ual', 'dir')
                        bat 'pwsh util/License-Unity.ps1'
                    }
                }
            }
        }
        stage("Package") {
            def parallelMap = [:]
            if (enableCSharp) {
                parallelMap["CSharp"] = {
                    timeout(10) {
                        bat 'pwsh util/Fetch-NuGet-4.5.ps1'
                        bat ('cd dist/CSharp-4.5 && nuget pack -Version ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -NonInteractive -Verbosity detailed -OutputDirectory ..\\..\\assets -OutputFileNamesWithoutVersion HiveMP.nuspec')
                    }
                };
            }
            if (enableUnity) {
                parallelMap["Unity"] = {
                    timeout(20) {
                        withCredentials([usernamePassword(credentialsId: 'unity-license-account', passwordVariable: 'UNITY_LICENSE_PASSWORD', usernameVariable: 'UNITY_LICENSE_USERNAME')]) {
                            bat ('pwsh util/Unity-Package.ps1 -SdkVersion ' + sdkVersion)
                        }
                    }
                };
            }
            if (enableTypeScript) {
                parallelMap["TypeScript"] = {
                    timeout(20) {
                        withCredentials([file(credentialsId: 'hivemp-pgp-private-key', variable: 'PGP_PRIVATE_KEY'), string(credentialsId: 'hivemp-pgp-private-key-passphrase', variable: 'PGP_PRIVATE_KEY_PASSPHRASE')]) {
                            bat ('pwsh util/TypeScript-Package.ps1 -SdkVersion ' + sdkVersion)
                        }
                    }
                };
            }
            if (enableUnrealEngine) {
                supportedUnrealVersions.keySet().each { version ->
                    parallelMap["UnrealEngine-" + version] =
                    {
                        timeout(10) {
                            bat ('pwsh util/UE4-Package.ps1 -UeVersion ' + version + ' -SdkVersion ' + sdkVersion)
                        }
                    };
                }
            }
            parallel (parallelMap)
        }
        stage("Stash Assets") {
            timeout(15) {
                caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'Assets', 'assets/')
            }
        }
        stage("Generate Tests") {
            def parallelMap = [:]
            parallelMap["Stash-Test-Scripts"] =
            {
                timeout(20) {
                    if (enableUnity) {
                        caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'RunUnityTest', 'tests/Run-UnityTest.ps1')
                    }
                    if (enableUnrealEngine) {
                        caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'RunUE4Test', 'tests/Run-UE4Test.ps1')
                    }
                    if (enableTypeScript) {
                        caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'RunTypeScriptTest', 'tests/Run-TypeScriptTest.ps1')
                    }
                }
            };
            if (enableTypeScript) {
                parallelMap["TypeScript"] =
                {
                    timeout(60) {
                        bat 'pwsh tests/Generate-TypeScriptTests.ps1 -SdkVersion ' + sdkVersion
                    }
                    timeout(25) {
                        caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'TypeScriptTestUncompiled', 'tests/TypeScriptNodeJsTest/')
                    }
                };
            }
            if (enableUnity) {
                supportedUnityVersions.keySet().each { v ->
                    def version = v
                    parallelMap["Unity-" + version] =
                    {
                        timeout(60) {
                            bat 'pwsh tests/Generate-UnityTests.ps1 -Version ' + version + ' -SdkVersion ' + sdkVersion
                        }
                        timeout(25) {
                            caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'Unity' + version + 'TestUncompiled', 'tests/UnityTest-' + version + '/')
                        }
                    };
                }
            }
            if (enableUnrealEngine) {
                supportedUnrealVersions.keySet().each { version ->
                    parallelMap["UnrealEngine-" + version] =
                    {
                        timeout(60) {
                            bat 'pwsh tests/Generate-UE4Tests.ps1 -Version ' + version + ' -SdkVersion ' + sdkVersion
                        }
                        timeout(25) {
                            caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'UE' + version + 'TestUncompiled', 'tests/UnrealTest-' + version + '/')
                        }
                    };
                }
            }
            parallel (parallelMap)
        }
    }
}
stage("Build Tests") {
    def parallelMap = [:]
    if (enableTypeScript) {
        parallelMap["TypeScript"] =
        {
            if (!preloaded['CompiledTest-TypeScript']) {
                node('windows') {
                    timeout(30) {
                        dir('_test_env/TypeScript') {
                            caching.pullCacheDirectory(gcloud, hashing, mainBuildHash, 'TypeScriptTestUncompiled', 'tests/TypeScriptNodeJsTest/', 'dir')

                            bat('dir')
                            bat('dir tests')
                            bat('dir tests\\TypeScriptNodeJsTest')
                            bat('pwsh tests/TypeScriptNodeJsTest/Build-TypeScriptTest.ps1')

                            caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'CompiledTest-TypeScript', 'tests/TypeScriptNodeJsTest/')
                        }
                    }
                }
            } else {
                echo ("Already built");
            }
        }
    }
    if (enableUnrealEngine) {
        supportedUnrealVersions.each { version, platforms -> 
            platforms.each { platform ->
                parallelMap["Unreal-" + version + "-" + platform] =
                {
                    if (!preloaded['CompiledTest-Unreal-' + version + '-' + platform]) {
                        node('windows-hicpu') {
                            timeout(30) {
                                dir('_test_env/Unreal-' + version + '-' + platform) {
                                    caching.pullCacheDirectory(gcloud, hashing, mainBuildHash, 'UE' + version + 'TestUncompiled', 'tests/UnrealTest-' + version + '/', 'dir')

                                    bat('pwsh tests/UnrealTest-' + version + '/Build-UE4Test.ps1 -Version ' + version + ' -Target ' + platform)

                                    caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'CompiledTest-Unreal-' + version + '-' + platform, 'tests/UnrealBuilds-' + version + '/' + platform + '/')
                                }
                            }
                        }
                    } else {
                        echo ("Already built");
                    }
                }
            }         
        }
    }
    if (enableUnity) {
        supportedUnityVersions.each { version, platforms -> 
            platforms.each { platform ->
                parallelMap["Unity-" + version + "-" + platform] =
                {
                    if (!preloaded['CompiledTest-Unity-' + version + '-' + platform]) {
                        node('windows') {
                            timeout(30) {
                                dir('_test_env/Unity-' + version + '-' + platform) {
                                    caching.pullCacheDirectory(gcloud, hashing, ualBuildHash, 'UAL', 'ual', 'dir')
                                    caching.pullCacheDirectory(gcloud, hashing, mainBuildHash, 'Unity' + version + 'TestUncompiled', 'tests/UnityTest-' + version + '/', 'dir')

                                    withCredentials([usernamePassword(credentialsId: 'unity-license-account', passwordVariable: 'UNITY_LICENSE_PASSWORD', usernameVariable: 'UNITY_LICENSE_USERNAME')]) {
                                        bat('pwsh tests/UnityTest-' + version + '/License-Unity.ps1 -OnlyVersion ' + version)
                                        bat('pwsh tests/UnityTest-' + version + '/Build-UnityTest.ps1 -Version ' + version + ' -Target ' + platform)
                                    }

                                    caching.pushCacheDirectory(gcloud, hashing, mainBuildHash, 'CompiledTest-Unity-' + version + '-' + platform, 'tests/UnityTest-' + version + '/' + platform + '/')
                                }
                            }
                        }
                    } else {
                        echo ("Already built");
                    }
                }
            }         
        }
    }
    parallel (parallelMap)
}
stage("Run Tests") {
    def parallelMap = [:]
    if (enableUnrealEngine) {
        supportedUnrealVersions.each { version, platforms ->
            platforms.each { platform ->
                if (platform.startsWith("Mac")) {
                    // TODO: We don't run macOS tests yet (beyond making sure code compiles for macOS in the previous step)
                } else if (platform.startsWith("Linux")) {
                    // TODO: We don't run Linux tests yet (beyond making sure code compiles for Linux in the previous step)
                } else if (platform.startsWith("Win")) {
                    parallelMap["Unreal-" + version + "-" + platform] =
                    {
                        if (!testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-Unreal-' + version + '-' + platform]) {
                            node('windows') {
                                timeout(30) {
                                    caching.pullCacheDirectoryMultiple(gcloud, hashing, mainBuildHash, [
                                        [
                                            id: 'CompiledTest-Unreal-' + version + '-' + platform, 
                                            dir: 'tests/UnrealBuilds-' + version + '/' + platform + '/', 
                                            targetType: 'dir',
                                        ],
                                        [
                                            id: 'RunUE4Test', 
                                            dir: 'tests/Run-UE4Test.ps1', 
                                            targetType: 'file',
                                        ],
                                    ]);
                                    bat 'pwsh tests/Run-UE4Test.ps1 -Version ' + version + ' -Platform ' + platform
                                    gcloud.keySet('RUNTEST-' + mainBuildHash + 'CompiledTest-Unreal-' + version + '-' + platform, 'true')
                                }
                            }
                        } else {
                            echo 'Test already passed in previous build'
                        }
                    }
                }
            }
        }
    }
    if (enableTypeScript) {
        parallelMap["TypeScript"] =
        {
            if (!testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-TypeScript']) {
                node('windows') {
                    timeout(30) {
                        caching.pullCacheDirectoryMultiple(gcloud, hashing, mainBuildHash, [
                            [
                                id: 'CompiledTest-TypeScript', 
                                dir: 'tests/TypeScriptNodeJsTest/', 
                                targetType: 'dir',
                            ],
                            [
                                id: 'RunTypeScriptTest', 
                                dir: 'tests/Run-TypeScriptTest.ps1', 
                                targetType: 'file',
                            ],
                        ]);
                        bat 'pwsh tests/Run-TypeScriptTest.ps1'
                        gcloud.keySet('RUNTEST-' + mainBuildHash + 'CompiledTest-TypeScript', 'true')
                    }
                }
            } else {
                echo 'Test already passed in previous build'
            }
        }
    }
    if (enableUnity) {
        supportedUnityVersions.each { version, platforms ->
            platforms.each { platform ->
                if (platform.startsWith("Mac")) {
                    parallelMap["Unity-" + version + "-" + platform] =
                    {
                        if (!testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform]) {
                            node('mac') {
                                timeout(30) {
                                    caching.pullCacheDirectoryMultiple(gcloud, hashing, mainBuildHash, [
                                        [
                                            id: 'CompiledTest-Unity-' + version + '-' + platform, 
                                            dir: 'tests/UnityTest-' + version + '/' + platform + '/', 
                                            targetType: 'dir',
                                        ],
                                        [
                                            id: 'RunUnityTest', 
                                            dir: 'tests/Run-UnityTest.ps1', 
                                            targetType: 'file',
                                        ],
                                    ]);
                                    sh 'chmod a+x tests/Run-UnityTest.ps1'
                                    sh 'chmod -R a+rwx tests/UnityTest-' + version + '/' + platform + '/'
                                    sh 'perl -pi -e \'s/\\r\\n|\\n|\\r/\\n/g\' tests/Run-UnityTest.ps1'
                                    sh 'tests/Run-UnityTest.ps1 -Version ' + version + ' -Platform ' + platform
                                    gcloud.keySet('RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform, 'true')
                                }
                            }
                        } else {
                            echo 'Test already passed in previous build'
                        }
                    };
                } else if (platform.startsWith("Linux")) {
                    // TODO: We don't run Linux tests yet (beyond making sure code compiles on Linux in the previous step)
                } else if (platform.startsWith("Win")) {
                    parallelMap["Unity-" + version + "-" + platform] =
                    {
                        if (!testsAlreadyRan['RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform]) {
                            node('windows') {
                                timeout(30) {
                                    caching.pullCacheDirectoryMultiple(gcloud, hashing, mainBuildHash, [
                                        [
                                            id: 'CompiledTest-Unity-' + version + '-' + platform, 
                                            dir: 'tests/UnityTest-' + version + '/' + platform + '/', 
                                            targetType: 'dir',
                                        ],
                                        [
                                            id: 'RunUnityTest', 
                                            dir: 'tests/Run-UnityTest.ps1', 
                                            targetType: 'file',
                                        ],
                                    ]);
                                    bat 'pwsh tests/Run-UnityTest.ps1 -Version ' + version + ' -Platform ' + platform
                                    gcloud.keySet('RUNTEST-' + mainBuildHash + 'CompiledTest-Unity-' + version + '-' + platform, 'true')
                                }
                            }
                        } else {
                            echo 'Test already passed in previous build'
                        }
                    }
                }
            }
        }
    }
    parallel (parallelMap)
}
def targetRepo = 'SDKs-PR-Releases'
def gitCommitAppend = ''
if (env.BRANCH_NAME == 'master') {
    targetRepo = 'SDKs';
    gitCommitAppend = ' -c ' + gitCommit;
}
node('linux') {
    withCredentials([string(credentialsId: 'HiveMP-Deploy', variable: 'GITHUB_TOKEN')]) {
        timeout(60) {
            stage("Publish (Prepare)") {
                caching.pullCacheDirectory(gcloud, hashing, mainBuildHash, 'Assets', 'assets/', 'dir')
                sh('\$GITHUB_RELEASE release --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + gitCommitAppend + ' -n "HiveMP SDKs ' + sdkVersion + '.' + env.BUILD_NUMBER + '" -d "This release is being created by the build server." -p')
            }
            stage("Publish (Upload)") {                
                def parallelMap = [:]
                parallelMap['C# GitHub'] =
                {
                    sh('\$GITHUB_RELEASE upload --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n HiveMP.' + sdkVersion + '.' + env.BUILD_NUMBER + '.nupkg -f assets/HiveMP.nupkg -l "HiveMP SDK for C# (.NET Framework 3.5 and .NET Standard 2.0)"')
                }
                if (env.BRANCH_NAME == 'master') {
                    // This only operates for master branch because it pushes to other services.
                    parallelMap['C# NuGet'] =
                    {
                        withCredentials([string(credentialsId: 'nuget-api-key', variable: 'NUGET_API_KEY')]) {
                            sh('dotnet nuget push -k \$NUGET_API_KEY -s nuget.org assets/HiveMP.nupkg')
                        }
                    }
                }
                parallelMap['Unity ZIP GitHub'] =
                {
                    sh('\$GITHUB_RELEASE upload --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n HiveMP-Unity-SDK.' + sdkVersion + '.' + env.BUILD_NUMBER + '.zip -f assets/Unity-SDK.' + sdkVersion + '.zip -l "HiveMP SDK for Unity as a ZIP archive"')
                }
                parallelMap['Unity Package GitHub'] =
                {
                    sh('\$GITHUB_RELEASE upload --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n HiveMP-Unity-SDK.' + sdkVersion + '.' + env.BUILD_NUMBER + '.unitypackage -f assets/Unity-SDK.' + sdkVersion + '.unitypackage -l "HiveMP SDK as a Unity package"')
                }
                supportedUnrealVersions.each { version, platforms ->
                    parallelMap['UE' + version + ' GitHub'] =
                    {
                        sh('\$GITHUB_RELEASE upload --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n HiveMP-UnrealEngine-' + version + '-SDK.' + sdkVersion + '.' + env.BUILD_NUMBER + '.zip -f assets/UnrealEngine-' + version + '-SDK.' + sdkVersion + '.zip -l "HiveMP SDK for Unreal Engine ' + version + '"')
                    };
                }
                parallelMap['TypeScript GitHub'] =
                {
                    sh('\$GITHUB_RELEASE upload --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n hivemp.' + sdkVersion + '.' + env.BUILD_NUMBER + '.tgz -f assets/hivemp.tgz -l "HiveMP SDK for Node.js / TypeScript"')
                }
                // Not working yet because NPM is borked and won't let us publish the package.
                // if (env.BRANCH_NAME == 'master') {
                //     // This only operates for master branch because it pushes to other services.
                //     parallelMap['TypeScript NPM'] =
                //     {
                //         withCredentials([string(credentialsId: 'npm-publish-key', variable: 'npm_config_//registry.npmjs.org/:_authToken')]) {
                //             sh('npm publish ./assets/hivemp.tgz --access public')
                //         }
                //     }
                // }
                parallel (parallelMap)
            }
            stage('Publish (Finalise)') {
                sh('\$GITHUB_RELEASE edit --user HiveMP --repo ' + targetRepo + ' --tag ' + sdkVersion + '.' + env.BUILD_NUMBER + ' -n "HiveMP SDKs ' + sdkVersion + '.' + env.BUILD_NUMBER + '" -d "This is an automated release of the HiveMP SDKs. Refer to the [HiveMP documentation](https://hivemp.com/documentation/) for information on how to use these SDKs."')
            }
        }
    }
}