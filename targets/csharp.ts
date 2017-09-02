import * as swagger from 'swagger2';
import * as schema from 'swagger2/src/schema';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as xmlescape from 'xml-escape';
import { TargetGenerator, GeneratorUtility } from './TargetGenerator';

abstract class CSharpGenerator implements TargetGenerator {
  abstract get name(): string;

  abstract getDefines(): string;

  async postGenerate(outputDir: string, enableClientConnect: boolean): Promise<void> {
    if (enableClientConnect) {
      // Copy Client Connect SDK binaries.
      const copyClientConnectPlatformBinaries = async (platform: string) => {
        await new Promise<void>((resolve, reject) => {
          fs.mkdirp(outputDir + "/" + platform, (err) => {
            if (err) {
              reject(err);
            }
            fs.copy("deps/HiveMP.ClientConnect/" + platform, outputDir + "/" + platform, { overwrite: true }, (err) => {
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
    }
  }
  
  static stripDefinition(s: string): string {
    if (s.startsWith('#/definitions/')) {
      return s.substr('#/definitions/'.length);
    }
    return s;
  }

  static getCSharpTypeFromDefinition(namespace: string, definition: schema.Definition, useConst: boolean, useConstIn?: boolean): string {
    const constName = useConst ? 'const ' : '';
    const arrayConstName = useConstIn ? 'const ': '';
    const arrayConstSuffix = useConstIn ? '&' : '';
    const nullableSuffix = definition.required ? '' : '?';
    let type = null;
    try {
      if (definition.type != null) {
        switch (definition.type as string|null) {
          case 'string':
            switch (definition.format) {
              case 'byte':
                type = 'byte[]';
                break;
              default:
                type = 'string';
                break;
            }
            break;
          case 'integer':
            switch (definition.format) {
              case 'int32':
                type = 'int' + nullableSuffix;
                break;
              case 'int64':
                type = 'long' + nullableSuffix;
                break;
            }
            break;
          case 'number':
            switch (definition.format) {
              case 'float':
                type = 'float' + nullableSuffix;
                break;
              case 'double':
                type = 'double' + nullableSuffix;
                break;
            }
            break;
          case 'boolean':
            type = 'bool' + nullableSuffix;
            break;
          case 'object':
            type = 'string /* JSON STRING */';
            break;
          case 'array':
            type = 
              CSharpGenerator.getCSharpTypeFromDefinition(namespace, definition.items, false, useConstIn) +
              '[]';
            break;
        }
      } else if (definition.schema != null) {
        if (definition.schema.type == 'array') {
          type = 
            CSharpGenerator.getCSharpTypeFromDefinition(namespace, definition.schema.items, false, useConstIn) +
            '[]';
        } else if (definition.schema.$ref != null) {
          type = namespace + '.' + CSharpGenerator.stripDefinition(definition.schema.$ref);
        } else {
          return CSharpGenerator.getCSharpTypeFromDefinition(namespace, definition.schema, useConst, useConstIn);
        }
      } else if (definition.$ref != null) {
        type = namespace + '.' + CSharpGenerator.stripDefinition(definition.$ref);
      }
    } catch (ex) {
      console.warn(ex);
      type = 'int' + nullableSuffix + ' /* unknown */';
    }
    return type;
  }

  static getParametersFromMethodParameter(namespace: string, parameters: any): string {
    let parametersArr = [];
    if (parameters != null) {
      for (let parameter of parameters) {
        let name = parameter.name;
        if (name == "cancellationToken") {
          name = "_cancellationToken";
        }
        parametersArr.push(
          CSharpGenerator.getCSharpTypeFromDefinition(namespace, parameter, false) +
          " @" + 
          name
        );
      }
    }
    return parametersArr.join(", ");
  }

  static getArgumentsFromMethodParameter(namespace: string, parameters: any): string {
    let argumentsArr = [];
    if (parameters != null) {
      for (let parameter of parameters) {
        let name = parameter.name;
        if (name == "cancellationToken") {
          name = "_cancellationToken";
        }
        argumentsArr.push(
          name
        );
      }
    }
    return argumentsArr.join(", ");
  }

  static applyCommentLines(s: string, i: string): string {
    if (s == null) {
      return "";
    }
    return xmlescape(s).replace(/(?:\r\n|\r|\n)/g, "\n" + i);
  }

  async generate(documents: {[id: string]: swagger.Document}, outputDir: string, includeClusterOnly: boolean, enableClientConnect: boolean): Promise<void> {
    let clientConnectDefines = '';
    if (enableClientConnect) {
      clientConnectDefines = `
#define ENABLE_CLIENT_CONNECT_SDK`;
    }
    let code = `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${this.getDefines()}
${clientConnectDefines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif
#if !(NET35 || (IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)))
#define HAS_TASKS
#define HAS_HTTPCLIENT
#endif

`;

    for (let apiId in documents) {
      let api = documents[apiId];
      let csharpName = api.info["x-sdk-csharp-package-name"];
      let namespace = csharpName + '.Api';

      code += `
namespace ${namespace}
{
    #pragma warning disable // Disable all warnings
`;

      let tags = {};
      for (let pathName in api.paths) {
        for (let methodName in api.paths[pathName]) {
          let tag = api.paths[pathName][methodName].tags[0];
          if (tags[tag] == undefined) {
            tags[tag] = [];
          }
          tags[tag].push({
            pathName: pathName,
            methodName: methodName
          });
        }
      }

      for (let definitionName in api.definitions) {
        if (definitionName == 'HiveSystemError') {
          continue;
        }
        code += `
    [System.CodeDom.Compiler.GeneratedCode("HiveMP SDK Generator", "1.0.0.0")]
    public class ${definitionName}
    {
        static ${definitionName}()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

`;
        for (let propertyName in api.definitions[definitionName].properties) {
          let propertyValue = api.definitions[definitionName].properties[propertyName];
          let propertyType = CSharpGenerator.getCSharpTypeFromDefinition(namespace, propertyValue, false);
          let name = propertyName[0].toUpperCase() + propertyName.substr(1);
          if (name == definitionName) {
            // C# does not allow member names to be the same as their types.
            name += "_";
          }
          code += `
        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(propertyValue.description, "        /// ")}
        /// </summary>
        [Newtonsoft.Json.JsonProperty("${propertyName}")]
        public ${propertyType} ${name} { get; set; }
`;
        }
        code += `
    }
`;
      }

      for (let tag in tags) {
        code += `
    [System.CodeDom.Compiler.GeneratedCode("HiveMP SDK Generator", "1.0.0.0")]
    public interface I${tag}Client
    {
        /// <summary>
        /// The API key sent in requests to Hive.  When calling methods that require no API key, this should
        /// be null, otherwise set it to the API key.
        /// </summary>
        string ApiKey { get; set; }
        
        /// <summary>
        /// The base URL for the API. This is set to production for you by default, but if want to use development or
        /// enterprise endpoints, you'll need to set this.
        /// </summary>
        string BaseUrl { get; set; }
    
        /// <summary>
        /// Called when preparing an API request; you can use this event to modify where the
        /// request is sent.
        /// </summary>
        System.Func<HiveMP.Api.RetryableHttpClient, string, string> InterceptRequest { get; set; }
`;

        for (let el of tags[tag]) {
          let methodValue = api.paths[el.pathName][el.methodName];
          if (GeneratorUtility.isClusterOnlyMethod(methodValue) && !includeClusterOnly) {
            continue;
          }
          let methodName = 
            methodValue.operationId[0].toUpperCase() +
            methodValue.operationId.substr(1);
          let returnValue = 'void';
          let asyncReturnValue = 'System.Threading.Tasks.Task';
          if (methodValue.responses != null && methodValue.responses["200"] != null) {
            returnValue = CSharpGenerator.getCSharpTypeFromDefinition(namespace, methodValue.responses["200"], false);
            if (returnValue == null) {
              returnValue = 'void';
            } else {
              asyncReturnValue = 'System.Threading.Tasks.Task<' + returnValue + '>';
            }
          }
          let parameters = CSharpGenerator.getParametersFromMethodParameter(namespace, methodValue.parameters);
          let argumentsSuffix = parameters != '' ? ', ' : '';
          code += `
#if HAS_TASKS
        ${asyncReturnValue} ${methodName}Async(${parameters});
        ${asyncReturnValue} ${methodName}Async(${parameters}${argumentsSuffix}System.Threading.CancellationToken cancellationToken);
#endif
        ${returnValue} ${methodName}(${parameters});
`;
        }

        code += `
    }

    [System.CodeDom.Compiler.GeneratedCode("HiveMP SDK Generator", "1.0.0.0")]
    public class ${tag}Client : I${tag}Client
    {
        static ${tag}Client()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

        /// <summary>
        /// The API key sent in requests to Hive.  When calling methods that require no API key, this should
        /// be null, otherwise set it to the API key.
        /// </summary>
        public string ApiKey { get; set; }
    
        /// <summary>
        /// The base URL for the API. This is set to production for you by default, but if want to use development or
        /// enterprise endpoints, you'll need to set this.
        /// </summary>
        public string BaseUrl { get; set; }
    
        /// <summary>
        /// Called when preparing an API request; you can use this event to modify where the
        /// request is sent.
        /// </summary>
        public System.Func<HiveMP.Api.RetryableHttpClient, string, string> InterceptRequest { get; set; }
        
        private void PrepareRequest(HiveMP.Api.RetryableHttpClient request, string url)
        {
            request.DefaultRequestHeaders.Add("X-API-Key", ApiKey ?? string.Empty);
        }

        private void PrepareRequest(HiveMP.Api.RetryableHttpClient request, System.Text.StringBuilder urlBuilder)
        {
            if (InterceptRequest != null)
            {
                var url = urlBuilder.ToString();
                var newUrl = InterceptRequest(request, url);
                urlBuilder.Remove(0, urlBuilder.Length);
                urlBuilder.Append(newUrl);
            }
        }

        /// <summary>
        /// Constructs a new ${tag}Client for calling the ${api.host} API.
        /// </summary>
        /// <param name="apiKey">The HiveMP API key to use.</param>
        public ${tag}Client(string apiKey)
        {
            ApiKey = apiKey;
            BaseUrl = "https://${api.host}${api.basePath}";
        }

        /// <summary>
        /// Constructs a new ${tag}Client for calling the ${api.host} API, with a default empty API key.
        /// </summary>
        public ${tag}Client()
        {
            ApiKey = string.Empty;
            BaseUrl = "https://${api.host}${api.basePath}";
        }
`;

        for (let el of tags[tag]) {
          let methodValue = api.paths[el.pathName][el.methodName];
          if (GeneratorUtility.isClusterOnlyMethod(methodValue) && !includeClusterOnly) {
            continue;
          }
          let methodName = 
            methodValue.operationId[0].toUpperCase() +
            methodValue.operationId.substr(1);
          let returnValue = 'void';
          let asyncReturnValue = 'System.Threading.Tasks.Task';
          if (methodValue.responses != null && methodValue.responses["200"] != null) {
            returnValue = CSharpGenerator.getCSharpTypeFromDefinition(namespace, methodValue.responses["200"], false);
            if (returnValue == null) {
              returnValue = 'void';
            } else {
              asyncReturnValue = 'System.Threading.Tasks.Task<' + returnValue + '>';
            }
          }
          let parameters = CSharpGenerator.getParametersFromMethodParameter(namespace, methodValue.parameters);
          let argumentsSuffix = parameters != '' ? ', ' : '';
          let returnSyncPrefix = returnValue == 'void' ? '' : 'return ';
          let createRequest = `new ${methodName}Request
            {`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              let csharpType = CSharpGenerator.getCSharpTypeFromDefinition(namespace, parameter, false);
              let name = parameter.name[0].toUpperCase() + parameter.name.substr(1);
              createRequest += `
                  ${name} = @${parameter.name},`;
            }
          }
          createRequest += `
            }`;
          code += `
#if HAS_TASKS
        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              let name = parameter.name[0].toUpperCase() + parameter.name.substr(1);
              code += `
        /// <param name="${xmlescape(name)}">${CSharpGenerator.applyCommentLines(parameter.description, "        /// ")}</param>`;
            }
          }
          code += `
        [System.Obsolete(
            "API calls with fixed position parameters are subject to change when new optional parameters " +
            "are added to the API; use the ${methodName}Async(${methodName}Request) version of this method " +
            "instead to ensure forward compatibility")]
        public ${asyncReturnValue} ${methodName}Async(${parameters})
        {
            return ${methodName}Async(${createRequest}, System.Threading.CancellationToken.None);
        }

        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              code += `
        /// <param name="${xmlescape(parameter.name)}">${CSharpGenerator.applyCommentLines(parameter.description, "        /// ")}</param>`;
            }
          }
          code += `
        /// <param name="cancellationToken">The cancellation token for the asynchronous request.</param>
        [System.Obsolete(
            "API calls with fixed position parameters are subject to change when new optional parameters " +
            "are added to the API; use the ${methodName}Async(${methodName}Request,CancellationToken) version of this method " +
            "instead to ensure forward compatibility")]
        public ${asyncReturnValue} ${methodName}Async(${parameters}${argumentsSuffix}System.Threading.CancellationToken cancellationToken)
        {
            return ${methodName}Async(${createRequest}, cancellationToken);
        }
        
        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>
        /// <param name="arguments">The ${xmlescape(methodName)} arguments.</param>
        public ${asyncReturnValue} ${methodName}Async(${methodName}Request arguments)
        {
            return ${methodName}Async(arguments, System.Threading.CancellationToken.None);
        }

        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>
        /// <param name="arguments">The ${xmlescape(methodName)} arguments.</param>
        /// <param name="cancellationToken">The cancellation token for the asynchronous request.</param>
        public async ${asyncReturnValue} ${methodName}Async(${methodName}Request arguments, System.Threading.CancellationToken cancellationToken)
        {
            var urlBuilder_ = new System.Text.StringBuilder();
            urlBuilder_.Append(BaseUrl).Append("${el.pathName}?");`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              let csharpType = CSharpGenerator.getCSharpTypeFromDefinition(namespace, parameter, false);
              let name = parameter.name[0].toUpperCase() + parameter.name.substr(1);
              if (parameter.required) {
                if (!csharpType.startsWith("int") && csharpType != "long" && csharpType != "float" && csharpType != "double") {
                  code += `
            if (arguments.${name} == null) throw new System.ArgumentNullException("arguments.${name}");`;
                }
                code += `
            urlBuilder_.Append("${parameter.name}=").Append(System.Uri.EscapeDataString(arguments.${name} == null ? "" : arguments.${name}.ToString())).Append("&");`;
              } else {
                code += `
            if (arguments.${name} != null) urlBuilder_.Append("${parameter.name}=").Append(System.Uri.EscapeDataString(arguments.${name}.ToString())).Append("&");`;
              }
            }
          }
          code += `
            urlBuilder_.Length--;
    
            var client_ = new HiveMP.Api.RetryableHttpClient();
            try
            {
                using (var request_ = new System.Net.Http.HttpRequestMessage())
                {
                    PrepareRequest(client_, urlBuilder_);
                    var url_ = urlBuilder_.ToString();
                    PrepareRequest(client_, url_);
    
                    // TODO: Support methods with body parameters.
                    var content_ = new System.Net.Http.StringContent(string.Empty);
                    
                    request_.Content = content_;
                    request_.Method = new System.Net.Http.HttpMethod("${el.methodName.toUpperCase()}");
                    request_.RequestUri = new System.Uri(url_, System.UriKind.RelativeOrAbsolute);
                    request_.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("application/json"));
                    var response_ = await client_.SendAsync(request_, System.Net.Http.HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
                    try
                    {
                        var headers_ = System.Linq.Enumerable.ToDictionary(response_.Headers, h_ => h_.Key, h_ => h_.Value);
                        foreach (var item_ in response_.Content.Headers)
                            headers_[item_.Key] = item_.Value;
    
                        var status_ = ((int)response_.StatusCode).ToString();
                        if (status_ == "200") 
                        {
                            var responseData_ = await response_.Content.ReadAsStringAsync().ConfigureAwait(false); 
`;
          if (returnValue != 'void') {
            code += `
                            var result_ = default(${returnValue}); 
                            try
                            {
                                result_ = Newtonsoft.Json.JsonConvert.DeserializeObject<${returnValue}>(responseData_);
                                return result_; 
                            } 
                            catch (System.Exception exception) 
                            {
                                throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, 0, "Could not deserialize the response body.", string.Empty);
                            }
`;
          }
          code += `
                        }
                        else
                        {
                            var responseData_ = await response_.Content.ReadAsStringAsync().ConfigureAwait(false); 
                            var result_ = default(HiveMP.Api.HiveMPSystemError); 
                            try
                            {
                                result_ = Newtonsoft.Json.JsonConvert.DeserializeObject<HiveMP.Api.HiveMPSystemError>(responseData_);
                            } 
                            catch (System.Exception exception_) 
                            {
                                throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, 0, "Could not deserialize the response body.", string.Empty);
                            }
    
                            throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, result_.Code, result_.Message, result_.Fields);
                        }
                    }
                    finally
                    {
                        if (response_ != null)
                            response_.Dispose();
                    }
                }
            }
            finally
            {
                if (client_ != null)
                    client_.Dispose();
            }
        }
#endif

        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              code += `
        /// <param name="${xmlescape(parameter.name)}">${CSharpGenerator.applyCommentLines(parameter.description, "        /// ")}</param>`;
            }
          }
          code += `
        [System.Obsolete(
            "API calls with fixed position parameters are subject to change when new optional parameters " +
            "are added to the API; use the ${methodName}(${methodName}Request) version of this method " +
            "instead to ensure forward compatibility")]
        public ${returnValue} ${methodName}(${parameters})
        {
#if HAS_TASKS
            ${returnSyncPrefix}System.Threading.Tasks.Task.Run(async () => await ${methodName}Async(${createRequest}, System.Threading.CancellationToken.None)).GetAwaiter().GetResult();
#else
            ${returnSyncPrefix}${methodName}(${createRequest});
#endif
        }

        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(methodValue.summary, "        /// ")}
        /// </summary>
        /// <remarks>
        /// ${CSharpGenerator.applyCommentLines(methodValue.description, "        /// ")}
        /// </remarks>
        /// <param name="arguments">The ${xmlescape(methodName)} arguments.</param>
        public ${returnValue} ${methodName}(${methodName}Request arguments)
        {
#if HAS_TASKS
            ${returnSyncPrefix}System.Threading.Tasks.Task.Run(async () => await ${methodName}Async(arguments, System.Threading.CancellationToken.None)).GetAwaiter().GetResult();
#else
            var urlBuilder_ = new System.Text.StringBuilder();
            urlBuilder_.Append(BaseUrl).Append("${el.pathName}?");`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              let csharpType = CSharpGenerator.getCSharpTypeFromDefinition(namespace, parameter, false);
              let name = parameter.name[0].toUpperCase() + parameter.name.substr(1);
              if (parameter.required) {
                if (!csharpType.startsWith("int") && csharpType != "long" && csharpType != "float" && csharpType != "double") {
                  code += `
            if (arguments.${name} == null) throw new System.ArgumentNullException("arguments.${name}");`;
                }
                code += `
            urlBuilder_.Append("${parameter.name}=").Append(System.Uri.EscapeDataString(arguments.${name} == null ? "" : arguments.${name}.ToString())).Append("&");`;
              } else {
                code += `
            if (arguments.${name} != null) urlBuilder_.Append("${parameter.name}=").Append(System.Uri.EscapeDataString(arguments.${name}.ToString())).Append("&");`;
              }
            }
          }
          code += `
            urlBuilder_.Length--;
    
            var client_ = new HiveMP.Api.RetryableHttpClient();
            try
            {
                PrepareRequest(client_, urlBuilder_);
                var url_ = urlBuilder_.ToString();
                PrepareRequest(client_, url_);

                // TODO: Support methods with body parameters.
                var content = string.Empty;
                
                var request_ = (System.Net.HttpWebRequest)System.Net.HttpWebRequest.Create(url_);
                request_.Method = "${el.methodName.toUpperCase()}";
                request_.ContentLength = content.Length;
                request_.Accept = "application/json";
                client_.UpdateRequest(request_);

                if (request_.Method != "GET" && request_.Method != "DELETE")
                {
                    request_.ContentType = "application/json";

                    // This will actually start the request, so we can't send any more headers
                    // after opening the request stream.
                    using (var writer = new System.IO.StreamWriter(request_.GetRequestStream()))
                    {
                        writer.Write(content);
                    }
                }

                var response_ = client_.ExecuteRequest(request_);
                var headers_ = System.Linq.Enumerable.ToDictionary(response_.Headers.AllKeys, h_ => h_, h_ => response_.Headers[h_]);

                var status_ = ((int)response_.StatusCode).ToString();
                if (status_ == "200") 
                {
                    string responseData_;
                    using (var reader = new System.IO.StreamReader(response_.GetResponseStream()))
                    {
                        responseData_ = reader.ReadToEnd();
                    }
`;
          if (returnValue != 'void') {
            code += `
                    var result_ = default(${returnValue}); 
                    try
                    {
                        result_ = Newtonsoft.Json.JsonConvert.DeserializeObject<${returnValue}>(responseData_);
                        return result_; 
                    } 
                    catch (System.Exception exception) 
                    {
                        throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, 0, "Could not deserialize the response body.", string.Empty);
                    }
`;
          }
          code += `
                }
                else
                {
                    string responseData_;
                    using (var reader = new System.IO.StreamReader(response_.GetResponseStream()))
                    {
                        responseData_ = reader.ReadToEnd();
                    }
                    var result_ = default(HiveMP.Api.HiveMPSystemError); 
                    try
                    {
                        result_ = Newtonsoft.Json.JsonConvert.DeserializeObject<HiveMP.Api.HiveMPSystemError>(responseData_);
                    } 
                    catch (System.Exception exception_) 
                    {
                        throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, 0, "Could not deserialize the response body.", string.Empty);
                    }

                    throw new HiveMP.Api.HiveMPException((int)response_.StatusCode, result_.Code, result_.Message, result_.Fields);
                }
            }
            finally
            {
                if (client_ != null)
                    client_.Dispose();
            }
#endif
        }
`;
        }

        code += `
    }
`;

        for (let el of tags[tag]) {
          let methodValue = api.paths[el.pathName][el.methodName];
          if (GeneratorUtility.isClusterOnlyMethod(methodValue) && !includeClusterOnly) {
            continue;
          }
          let methodName = 
            methodValue.operationId[0].toUpperCase() +
            methodValue.operationId.substr(1);
          code += `
    [System.CodeDom.Compiler.GeneratedCode("HiveMP SDK Generator", "1.0.0.0")]
    public struct ${methodName}Request
    {
`;
          if (methodValue.parameters != null) {
            for (let parameter of methodValue.parameters) {
              let csharpType = CSharpGenerator.getCSharpTypeFromDefinition(namespace, parameter, false);
              let name = parameter.name[0].toUpperCase() + parameter.name.substr(1);
              code += `
        /// <summary>
        /// ${CSharpGenerator.applyCommentLines(parameter.description, "        /// ")}
        /// </summary>
        public ${csharpType} ${name} { get; set; }
  `;
            }
          }
          code += `
    }
`;
        }
      }

      code += `
}
`;
    }

    let httpClient = `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${this.getDefines()}
${clientConnectDefines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif
#if !(NET35 || (IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)))
#define HAS_TASKS
#define HAS_HTTPCLIENT
#endif

using Newtonsoft.Json;
using System;
using System.IO;
#if HAS_HTTPCLIENT
using System.Net.Http;
#else
using System.Net;
#endif
using System.Threading;
#if HAS_TASKS
using System.Threading.Tasks;
#endif

namespace HiveMP.Api
{
#if HAS_HTTPCLIENT
    public class RetryableHttpClient : HttpClient
    {
        static RetryableHttpClient()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

        public new async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, HttpCompletionOption completionOption, CancellationToken cancellationToken)
        {
            using (var memory = new MemoryStream())
            {
                byte[] bytes = null;
                if (request.Content != null)
                {
                    await request.Content.CopyToAsync(memory);
                    memory.Seek(0, SeekOrigin.Begin);

                    bytes = new byte[memory.Length];
                    await memory.ReadAsync(bytes, 0, bytes.Length);
                }

                var delay = 1000;
                do
                {
                    // Make the request retryable
                    var newContent = bytes != null ? new ByteArrayContent(bytes) : null;
                    if (newContent != null)
                    {
                        foreach (var h in request.Content.Headers)
                        {
                            newContent.Headers.Add(h.Key, h.Value);
                        }
                    }
                    var newRequest = new HttpRequestMessage
                    {
                        Content = newContent,
                        Method = request.Method,
                        RequestUri = request.RequestUri,
                        Version = request.Version
                    };
                    foreach (var h in request.Headers)
                    {
                        newRequest.Headers.Add(h.Key, h.Value);
                    }
                    foreach (var p in request.Properties)
                    {
                        newRequest.Properties.Add(p);
                    }
                    
                    var response = await base.SendAsync(newRequest, completionOption, cancellationToken);
                    
                    if (!response.IsSuccessStatusCode)
                    {
                        var responseData = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        var result = default(HiveMPSystemError);
                        try
                        {
                            result = JsonConvert.DeserializeObject<HiveMPSystemError>(responseData);
                        }
                        catch (Exception)
                        {
                            // Allow the handle to fail parsing this.
                            return response;
                        }

                        if (result.Code == 6001)
                        {
                            await Task.Delay(delay);
                            delay *= 2;
                            delay = Math.Min(30000, delay);
                            continue;
                        }
                    }

                    return response;
                }
                while (true);
            }
        }
    }
#else
    public class RetryableHttpClient : System.IDisposable
    {
        static RetryableHttpClient()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

        public RetryableHttpClient()
        {
            DefaultRequestHeaders = new System.Collections.Generic.Dictionary<string, string>();
        }

        public System.Collections.Generic.Dictionary<string, string> DefaultRequestHeaders { get; set; }
        
        public HttpWebRequest UpdateRequest(HttpWebRequest request)
        {
            foreach (var kv in DefaultRequestHeaders)
            {
                request.Headers.Add(kv.Key, kv.Value);
            }
            return request;
        }

        public HttpWebResponse ExecuteRequest(HttpWebRequest request)
        {
            // TODO: Handle #6001 errors with retry logic
            return (HttpWebResponse)request.GetResponse();
        }

        public void Dispose()
        {
        }
    }
#endif
}    
`;

    let hiveException = `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${this.getDefines()}
${clientConnectDefines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif
#if !(NET35 || (IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)))
#define HAS_TASKS
#define HAS_HTTPCLIENT
#endif

using System;
using System.IO;
using System.Threading;

namespace HiveMP.Api
{
    public class HiveMPException : Exception
    {
        static HiveMPException()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

        public HiveMPException(int httpStatusCode, int errorCode, string message, string fields)
            : base("#" + errorCode + ": " + message + " (" + (fields ?? "") + ")")
        {
            HttpStatusCode = httpStatusCode;
            HiveErrorCode = errorCode;
            HiveErrorMessage = message;
            HiveErrorFields = fields;
        }

        public int HttpStatusCode { get; set; }

        public int HiveErrorCode { get; set; }

        public string HiveErrorMessage { get; set; }

        public string HiveErrorFields { get; set; }
    }
}    
`;

    let hiveSystemError = `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${this.getDefines()}
${clientConnectDefines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif
#if !(NET35 || (IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)))
#define HAS_TASKS
#define HAS_HTTPCLIENT
#endif

using Newtonsoft.Json;
using System;
using System.IO;
using System.Threading;

namespace HiveMP.Api
{
    public class HiveMPSystemError
    {
        static HiveMPSystemError()
        {
            HiveMP.Api.HiveMPSDKSetup.EnsureInited();
        }

        [JsonProperty("code")]
        public int Code { get; set; }

        [JsonProperty("message")]
        public string Message { get; set; }

        [JsonProperty("fields")]
        public string Fields { get; set; }
    }
}    
`;

    let hiveSdkSetup = `
//------------------------
// <auto-generated>
//     Generated with HiveMP SDK Generator
// </auto-generated>
//------------------------

${this.getDefines()}
${clientConnectDefines}

#if UNITY_5 || UNITY_5_3_OR_NEWER
#define IS_UNITY
#endif
#if !(NET35 || (IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)))
#define HAS_TASKS
#define HAS_HTTPCLIENT
#endif

using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

namespace HiveMP.Api
{
    public static class HiveMPSDKSetup
    {
        private static IClientConnect _clientConnect;

        static HiveMPSDKSetup()
        {
#if IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)
            ServicePointManager.ServerCertificateValidationCallback = HiveMPCertificateValidationCheck;
#endif
#if ENABLE_CLIENT_CONNECT_SDK
            SetupClientConnect();
#endif
        }

#if ENABLE_CLIENT_CONNECT_SDK
#if HAS_TASKS
        [System.Runtime.ExceptionServices.HandleProcessCorruptedStateExceptions]
#endif
        private static void SetupClientConnect()
        {
#if IS_UNITY
#if UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
            // Windows
            if (System.IntPtr.Size == 8)
            {
                // 64-bit
                _clientConnect = new ClientConnectWin64Platform();
            }
            else
            {
                // 32-bit
                _clientConnect = new ClientConnectWin32Platform(); 
            }
#else
            // Client Connect SDK not supported on this platform yet.
            _clientConnect = null;
#endif
#else
            if (System.IO.Path.DirectorySeparatorChar == '\\\\')
            {
                // Windows
                if (System.IntPtr.Size == 8)
                {
                    // 64-bit
                    _clientConnect = new ClientConnectWin64Platform();
                }
                else
                {
                    // 32-bit
                    _clientConnect = new ClientConnectWin32Platform(); 
                }
            }
            else
            {
                // Client Connect SDK not supported on this platform yet.
                _clientConnect = null;
            }
#endif

            if (_clientConnect != null)
            {
                try
                {
                    _clientConnect.MapChunk("_startupTest.lua", System.Text.Encoding.ASCII.GetBytes(@"
function _startupTest_hotpatch(id, endpoint, api_key, parameters_json)
    return 403, ""Nope""
end
register_hotpatch(""no-api:testPUT"", ""_startupTest_hotpatch"")"));
                    _clientConnect.Run("_startupTest.lua");
                    int statusCode;
                    var response = _clientConnect.CallHotpatch("no-api", "testPUT", "https://no-api.hivemp.nonexistent.com", "", "{}", out statusCode);
                    if (response != "Nope")
                    {
                        // Something went wrong and we can't use Client Connect.
                        _clientConnect = null;
                    }
                }
                catch (System.Exception ex)
                {
                    // We can't use Client Connect
                    _clientConnect = null;
                }
            }
        }
#endif

#if IS_UNITY && (NET_2_0 || NET_2_0_SUBSET)
        public static bool HiveMPCertificateValidationCheck(System.Object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors sslPolicyErrors)
        {
            // TODO: Before we ship a public SDK, we must change this to validate
            // that the root of the certificate chain is Let's Encrypt, and that the
            // certificate chain is valid.
            return true;
        }
#endif

        public static void EnsureInited()
        {
        }

        private interface IClientConnect
        {
            void MapChunk(string name, byte[] data);
            void FreeChunk(string name);
            void Run(string name);
            bool IsHotpatched(string api, string operation);
            string CallHotpatch(string api, string operation, string endpoint, string apiKey, string parametersAsJson, out int statusCode);
        }
`;
    let clientConnectPlatforms = [
      'Win32',
      'Win64'
    ];
    for (let platform of clientConnectPlatforms) {
      hiveSdkSetup += `
        private class ClientConnect${platform}Platform : IClientConnect
        {
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern void cc_map_chunk([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string name, byte[] data, int len);
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern void cc_free_chunk([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string name);
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern void cc_run([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string name);
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern bool cc_is_hotpatched([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string api, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string operation);
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern System.IntPtr cc_call_hotpatch([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string api, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string operation, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string endpoint, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string apiKey, [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPStr)] string parametersAsJson, out System.Int32 statusCode);
            [System.Runtime.InteropServices.DllImport("${platform}\\\\HiveMP.ClientConnect.dll", CallingConvention = System.Runtime.InteropServices.CallingConvention.Cdecl)]
            private static extern void cc_free_string(System.IntPtr ptr);

            public void MapChunk(string name, byte[] data)
            {
                cc_map_chunk(name, data, data.Length);
            }

            public void FreeChunk(string name)
            {
                cc_free_chunk(name);
            }

            public void Run(string name)
            {
                cc_run(name);
            }

            public bool IsHotpatched(string api, string operation)
            {
                return cc_is_hotpatched(api, operation);
            }

            public string CallHotpatch(string api, string operation, string endpoint, string apiKey, string parametersAsJson, out int statusCode)
            {
                var strPtr = cc_call_hotpatch(api, operation, endpoint, apiKey, parametersAsJson, out statusCode);
                var ret = System.Runtime.InteropServices.Marshal.PtrToStringAnsi(strPtr);
                cc_free_string(strPtr);
                return ret;
            }
        }
`
    }
    hiveSdkSetup += `
    }
}    
`;
    
    await new Promise((resolve, reject) => {
      fs.writeFile(path.join(outputDir, 'HiveMP.cs'), code, (err) => {
        if (err) {
          reject(err);
          return;
        }
        fs.writeFile(path.join(outputDir, 'RetryableHttpClient.cs'), httpClient, (err) => {
          if (err) {
            reject(err);
            return;
          }
          fs.writeFile(path.join(outputDir, 'HiveMPException.cs'), hiveException, (err) => {
            if (err) {
              reject(err);
              return;
            }
            fs.writeFile(path.join(outputDir, 'HiveMPSystemError.cs'), hiveSystemError, (err) => {
              if (err) {
                reject(err);
                return;
              }
              fs.writeFile(path.join(outputDir, 'HiveMPSDKSetup.cs'), hiveSdkSetup, (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              });
            });
          });
        });
      });
    });
    await this.postGenerate(outputDir, enableClientConnect);
  }
}

export class CSharp35Generator extends CSharpGenerator {
  get name(): string {
    return 'CSharp-3.5';
  }

  getDefines(): string {
    return '#define NET35';
  }
}

export class CSharp45Generator extends CSharpGenerator {
  get name(): string {
    return 'CSharp-4.5';
  }
  
  getDefines(): string {
    return '';
  }
}

export class UnityGenerator extends CSharpGenerator {
  get name(): string {
    return 'Unity';
  }
  
  getDefines(): string {
    return '';
  }
  
  async postGenerate(outputDir: string, enableClientConnect: boolean): Promise<void> {
    await super.postGenerate(outputDir, enableClientConnect);

    // Copy Unity-specific dependencies out.
    await new Promise<void>((resolve, reject) => {
      fs.copy("deps/Unity-3.5/", outputDir, { overwrite: true }, (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }
}
