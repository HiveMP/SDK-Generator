import * as swagger from 'swagger2';
import * as schema from 'swagger2/src/schema';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as fragments from './csharp/fragments';
import { TargetGenerator, GeneratorUtility } from './TargetGenerator';
import { TargetOptions } from "./TargetOptions";
import { IApiSpec, loadApi } from './common/apiSpec';
import { generateCSharpNamespace } from './csharp/namespace';
import { emitCommonErrorStructures } from './csharp/error';
import { resolveType } from './csharp/typing';
import { emitControllerAndImplementation } from './csharp/controllers';

abstract class CSharpGenerator implements TargetGenerator {
  abstract get name(): string;

  get supportsMultitargeting(): boolean {
    return true;
  }

  abstract getDefines(): string;
  
  abstract postGenerate(opts: TargetOptions): Promise<void>;

  private writeFileContent(opts: TargetOptions, filename: string, code: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(path.join(opts.outputDir, filename), code, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        resolve();
      });
    });
  }

  async generate(documents: {[id: string]: swagger.Document}, opts: TargetOptions): Promise<void> {
    const apis = new Set<IApiSpec>();

    const calculateNamespace = (str: string) => {
      if (opts.isolatedNamespace) {
        return str.replace(/^HiveMP\./g, 'HiveMPIsolated.');
      } else {
        return str;
      }
    }

    const loadApiNamespace = (apiId: string, apiVersion: string, document: any) => {
      const result = generateCSharpNamespace(apiId, apiVersion, document);
      return calculateNamespace(result);
    }

    for (const apiIdAndVersion in documents) {
      const s = apiIdAndVersion.split(':', 2);
      const apiId = s[0];
      const apiVersion = s[1];
      apis.add(loadApi(apiId, apiVersion, documents[apiIdAndVersion], loadApiNamespace, (definitionSpec) => definitionSpec.name));
    }
    
    const defines = fragments.getDefines(this.getDefines(), opts);

    const genericNamespace = calculateNamespace('HiveMP.Api');

    let code = fragments.getCodePrefix(defines);
    code += fragments.namespaceBegin(genericNamespace);
    code += emitCommonErrorStructures(genericNamespace, apis.values().next().value);
    code += fragments.namespaceEnd;
    for (const api of apis) {
      code += fragments.namespaceBegin(calculateNamespace(api.namespace));
      for (const definition of api.definitions.values()) {
        const csType = resolveType(definition);
        code += csType.emitStructureDefinition(genericNamespace, definition);
      }

      for (const tag of api.tags.values()) {
        code += emitControllerAndImplementation(
          genericNamespace, 
          api,
          tag,
          opts);
      }
      code += fragments.namespaceEnd;
    }

    const httpClientClass = fragments.getHttpClientClass(genericNamespace, defines);
    const hiveExceptionClass = fragments.getExceptionClass(genericNamespace, defines);
    const hivePromiseSchedulerSettingsClass = fragments.getPromiseSchedulerSettingsClass(genericNamespace, defines);
    const hivePromiseMainThreadReturnClass = fragments.getPromiseMainThreadReturnClass(genericNamespace, defines);
    const hiveUnityMonoBehaviourClass = fragments.getPromiseUnityMonoBehaviourClass(genericNamespace, defines);
    const hiveSocketClass = fragments.getWebSocketClass(genericNamespace, defines);
    const hiveSdk = fragments.getSdk(genericNamespace, defines);
    const hivePromise = fragments.getPromiseClass(genericNamespace);
    const hivePromiseGeneric = fragments.getPromiseGenericClass(genericNamespace);
    const hivePromiseDelegate = fragments.getPromiseDelegateClass(genericNamespace);
    const hivePromiseDelegateGeneric = fragments.getPromiseDelegateGenericClass(genericNamespace);
    const hivePromiseScheduler = fragments.getPromiseSchedulerClass(genericNamespace);
    const hiveBaseClient = fragments.getBaseClientInterface(genericNamespace);

    await this.writeFileContent(opts, 'HiveMP.cs', code);
    await this.writeFileContent(opts, 'RetryableHttpClient.cs', httpClientClass);
    await this.writeFileContent(opts, 'HiveMPException.cs', hiveExceptionClass);
    await this.writeFileContent(opts, 'HiveMPPromiseSchedulerSettings.cs', hivePromiseSchedulerSettingsClass);
    await this.writeFileContent(opts, 'HiveMPPromiseMainThreadReturn.cs', hivePromiseMainThreadReturnClass);
    await this.writeFileContent(opts, 'HiveMPUnityMonoBehaviour.cs', hiveUnityMonoBehaviourClass);
    await this.writeFileContent(opts, 'HiveMPWebSocket.cs', hiveSocketClass);
    await this.writeFileContent(opts, 'HiveMPSDK.cs', hiveSdk);
    await this.writeFileContent(opts, 'HiveMPPromise.cs', hivePromise);
    await this.writeFileContent(opts, 'HiveMPPromise_T.cs', hivePromiseGeneric);
    await this.writeFileContent(opts, 'HiveMPPromiseDelegate.cs', hivePromiseDelegate);
    await this.writeFileContent(opts, 'HiveMPPromiseDelegate_T.cs', hivePromiseDelegateGeneric);
    await this.writeFileContent(opts, 'HiveMPPromiseScheduler.cs', hivePromiseScheduler)
    await this.writeFileContent(opts, 'HiveMPBaseClient.cs', hiveBaseClient);

    if (opts.enableClientConnect) {
      // Copy Client Connect SDK binaries.
      const copyClientConnectPlatformBinaries = async (platform: string) => {
        await new Promise<void>((resolve, reject) => {
          fs.mkdirp(opts.outputDir + "/" + platform, (err) => {
            if (err) {
              reject(err);
            }
            let src = null;
            if (opts.clientConnectSdkPath != null) {
              src = opts.clientConnectSdkPath + "/" + platform;
            } else {
              throw new Error('Path to Client Connect binaries must be specified to enable Client Connect!');
            }
            fs.copy(src, opts.outputDir + "/" + platform, { overwrite: true }, (err) => {
              if (this.name == "Unity") {
                // Unity requires macOS libraries to have .bundle extension.
                if (fs.existsSync(opts.outputDir + "/" + platform + "/libcchost.dylib")) {
                  try {
                    fs.unlinkSync(opts.outputDir + "/" + platform + "/libcchost.bundle");
                  } catch { }
                  fs.renameSync(opts.outputDir + "/" + platform + "/libcchost.dylib", opts.outputDir + "/" + platform + "/libcchost.bundle");
                }
              }
              if (err) {
                reject(err);
              }
              resolve();
            });
          });
        });
      }
      await copyClientConnectPlatformBinaries("Win32");
      await copyClientConnectPlatformBinaries("Win64");
      await copyClientConnectPlatformBinaries("Mac64");
      await copyClientConnectPlatformBinaries("Linux32");
      await copyClientConnectPlatformBinaries("Linux64");
    }

    await this.postGenerate(opts);
  }
}

export class CSharp35Generator extends CSharpGenerator {
  get name(): string {
    return 'CSharp-3.5';
  }

  getDefines(): string {
    return '#define NET35';
  }
  
  async postGenerate(opts: TargetOptions): Promise<void> {
    if (opts.enableClientConnect) {
      fs.copySync(path.join(__dirname, "../sdks/CSharp-3.5/HiveMP.csproj"), path.join(opts.outputDir, "HiveMP.csproj"));
    } else {
      fs.copySync(path.join(__dirname, "../sdks/CSharp-3.5/HiveMP.NoClientConnect.csproj"), path.join(opts.outputDir, "HiveMP.csproj"));
    }
    fs.copySync(path.join(__dirname, "../sdks/CSharp-3.5/HiveMP.sln"), path.join(opts.outputDir, "HiveMP.sln"));
    fs.copySync(path.join(__dirname, "../sdks/CSharp-3.5/packages.config"), path.join(opts.outputDir, "packages.config"));
  }
}

export class CSharp45Generator extends CSharpGenerator {
  get name(): string {
    return 'CSharp-4.5';
  }
  
  getDefines(): string {
    return '';
  }
  
  async postGenerate(opts: TargetOptions): Promise<void> {
    if (opts.enableClientConnect) {
      fs.copySync(path.join(__dirname, "../sdks/CSharp-4.5/HiveMP.csproj"), path.join(opts.outputDir, "HiveMP.csproj"));
    } else {
      fs.copySync(path.join(__dirname, "../sdks/CSharp-4.5/HiveMP.NoClientConnect.csproj"), path.join(opts.outputDir, "HiveMP.csproj"));
    }
    fs.copySync(path.join(__dirname, "../sdks/CSharp-4.5/HiveMP.sln"), path.join(opts.outputDir, "HiveMP.sln"));
    fs.copySync(path.join(__dirname, "../sdks/CSharp-4.5/HiveMP.nuspec"), path.join(opts.outputDir, "HiveMP.nuspec"));
  }
}

export class UnityGenerator extends CSharpGenerator {
  get name(): string {
    return 'Unity';
  }
  
  getDefines(): string {
    return '';
  }
  
  async postGenerate(opts: TargetOptions): Promise<void> {
    // Copy Unity-specific dependencies out.
    await new Promise<void>((resolve, reject) => {
      fs.copy("sdks/Unity/", opts.outputDir, { overwrite: true }, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });

    if (opts.enableClientConnect) {
      await new Promise<void>((resolve, reject) => {
        fs.copy("sdks/Unity-ClientConnect/", opts.outputDir, { overwrite: true }, (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    }
  }
}
