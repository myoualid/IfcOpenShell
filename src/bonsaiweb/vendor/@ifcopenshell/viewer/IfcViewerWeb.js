var createIfcViewer = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  return (
async function(moduleArg = {}) {
  var moduleRtn;

// include: shell.js
// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(moduleArg) => Promise<Module>
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = moduleArg;

// Determine the runtime environment we are in. You can customize this by
// setting the ENVIRONMENT setting at compile time (see settings.js).
// Attempt to auto-detect the environment
var ENVIRONMENT_IS_WEB = typeof window == "object";

var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";

// N.b. Electron.js environment is simultaneously a NODE-environment, but
// also a web environment.
var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";

var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
var arguments_ = [];

var thisProgram = "./this.program";

var quit_ = (status, toThrow) => {
  throw toThrow;
};

if (typeof __filename != "undefined") {
  // Node
  _scriptName = __filename;
} else if (ENVIRONMENT_IS_WORKER) {
  _scriptName = self.location.href;
}

// `/` should be present at the end if `scriptDirectory` is not empty
var scriptDirectory = "";

function locateFile(path) {
  if (Module["locateFile"]) {
    return Module["locateFile"](path, scriptDirectory);
  }
  return scriptDirectory + path;
}

// Hooks that are implemented differently in different runtime environments.
var readAsync, readBinary;

if (ENVIRONMENT_IS_NODE) {
  const isNode = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (!isNode) throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
  var nodeVersion = process.versions.node;
  var numericVersion = nodeVersion.split(".").slice(0, 3);
  numericVersion = (numericVersion[0] * 1e4) + (numericVersion[1] * 100) + (numericVersion[2].split("-")[0] * 1);
  if (numericVersion < 16e4) {
    throw new Error("This emscripten-generated code requires node v16.0.0 (detected v" + nodeVersion + ")");
  }
  // These modules will usually be used on Node.js. Load them eagerly to avoid
  // the complexity of lazy-loading.
  var fs = require("fs");
  scriptDirectory = __dirname + "/";
  // include: node_shell_read.js
  readBinary = filename => {
    // We need to re-wrap `file://` strings to URLs.
    filename = isFileURI(filename) ? new URL(filename) : filename;
    var ret = fs.readFileSync(filename);
    assert(Buffer.isBuffer(ret));
    return ret;
  };
  readAsync = async (filename, binary = true) => {
    // See the comment in the `readBinary` function.
    filename = isFileURI(filename) ? new URL(filename) : filename;
    var ret = fs.readFileSync(filename, binary ? undefined : "utf8");
    assert(binary ? Buffer.isBuffer(ret) : typeof ret == "string");
    return ret;
  };
  // end include: node_shell_read.js
  if (process.argv.length > 1) {
    thisProgram = process.argv[1].replace(/\\/g, "/");
  }
  arguments_ = process.argv.slice(2);
  quit_ = (status, toThrow) => {
    process.exitCode = status;
    throw toThrow;
  };
} else if (ENVIRONMENT_IS_SHELL) {
  const isNode = typeof process == "object" && process.versions?.node && process.type != "renderer";
  if (isNode || typeof window == "object" || typeof WorkerGlobalScope != "undefined") throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
} else // Note that this includes Node.js workers when relevant (pthreads is enabled).
// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
// ENVIRONMENT_IS_NODE.
if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  try {
    scriptDirectory = new URL(".", _scriptName).href;
  } catch {}
  if (!(typeof window == "object" || typeof WorkerGlobalScope != "undefined")) throw new Error("not compiled for this environment (did you build to HTML and try to run it not on the web, or set ENVIRONMENT to something - like node - and run it someplace else - like on the web?)");
  {
    // include: web_or_worker_shell_read.js
    if (ENVIRONMENT_IS_WORKER) {
      readBinary = url => {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, false);
        xhr.responseType = "arraybuffer";
        xhr.send(null);
        return new Uint8Array(/** @type{!ArrayBuffer} */ (xhr.response));
      };
    }
    readAsync = async url => {
      // Fetch has some additional restrictions over XHR, like it can't be used on a file:// url.
      // See https://github.com/github/fetch/pull/92#issuecomment-140665932
      // Cordova or Electron apps are typically loaded from a file:// url.
      // So use XHR on webview if URL is a file URL.
      if (isFileURI(url)) {
        return new Promise((resolve, reject) => {
          var xhr = new XMLHttpRequest;
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = () => {
            if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) {
              // file URLs can return 0
              resolve(xhr.response);
              return;
            }
            reject(xhr.status);
          };
          xhr.onerror = reject;
          xhr.send(null);
        });
      }
      var response = await fetch(url, {
        credentials: "same-origin"
      });
      if (response.ok) {
        return response.arrayBuffer();
      }
      throw new Error(response.status + " : " + response.url);
    };
  }
} else {
  throw new Error("environment detection error");
}

var out = console.log.bind(console);

var err = console.error.bind(console);

var IDBFS = "IDBFS is no longer included by default; build with -lidbfs.js";

var PROXYFS = "PROXYFS is no longer included by default; build with -lproxyfs.js";

var WORKERFS = "WORKERFS is no longer included by default; build with -lworkerfs.js";

var FETCHFS = "FETCHFS is no longer included by default; build with -lfetchfs.js";

var ICASEFS = "ICASEFS is no longer included by default; build with -licasefs.js";

var JSFILEFS = "JSFILEFS is no longer included by default; build with -ljsfilefs.js";

var OPFS = "OPFS is no longer included by default; build with -lopfs.js";

var NODEFS = "NODEFS is no longer included by default; build with -lnodefs.js";

// perform assertions in shell.js after we set up out() and err(), as otherwise
// if an assertion fails it cannot print the message
assert(!ENVIRONMENT_IS_SHELL, "shell environment detected but not enabled at build time.  Add `shell` to `-sENVIRONMENT` to enable.");

// end include: shell.js
// include: preamble.js
// === Preamble library stuff ===
// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html
var wasmBinary;

if (typeof WebAssembly != "object") {
  err("no native wasm support detected");
}

// Wasm globals
//========================================
// Runtime essentials
//========================================
// whether we are quitting the application. no code should run after this.
// set in exit() and abort()
var ABORT = false;

// set by exit() and abort().  Passed to 'onExit' handler.
// NOTE: This is also used as the process return code code in shell environments
// but only when noExitRuntime is false.
var EXITSTATUS;

// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
// don't define it at all in release modes.  This matches the behaviour of
// MINIMAL_RUNTIME.
// TODO(sbc): Make this the default even without STRICT enabled.
/** @type {function(*, string=)} */ function assert(condition, text) {
  if (!condition) {
    abort("Assertion failed" + (text ? ": " + text : ""));
  }
}

// We used to include malloc/free by default in the past. Show a helpful error in
// builds with assertions.
/**
 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
 * @noinline
 */ var isFileURI = filename => filename.startsWith("file://");

// include: runtime_common.js
// include: runtime_stack_check.js
// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  var max = _emscripten_stack_get_end();
  assert((max & 3) == 0);
  // If the stack ends at address zero we write our cookies 4 bytes into the
  // stack.  This prevents interference with SAFE_HEAP and ASAN which also
  // monitor writes to address zero.
  if (max == 0) {
    max += 4;
  }
  // The stack grow downwards towards _emscripten_stack_get_end.
  // We write cookies to the final two words in the stack and detect if they are
  // ever overwritten.
  HEAPU32[((max) >>> 2) >>> 0] = 34821223;
  HEAPU32[(((max) + (4)) >>> 2) >>> 0] = 2310721022;
  // Also test the global address 0 for integrity.
  HEAPU32[((0) >>> 2) >>> 0] = 1668509029;
}

function checkStackCookie() {
  if (ABORT) return;
  var max = _emscripten_stack_get_end();
  // See writeStackCookie().
  if (max == 0) {
    max += 4;
  }
  var cookie1 = HEAPU32[((max) >>> 2) >>> 0];
  var cookie2 = HEAPU32[(((max) + (4)) >>> 2) >>> 0];
  if (cookie1 != 34821223 || cookie2 != 2310721022) {
    abort(`Stack overflow! Stack cookie has been overwritten at ${ptrToString(max)}, expected hex dwords 0x89BACDFE and 0x2135467, but received ${ptrToString(cookie2)} ${ptrToString(cookie1)}`);
  }
  // Also test the global address 0 for integrity.
  if (HEAPU32[((0) >>> 2) >>> 0] != 1668509029) {
    abort("Runtime error: The application has corrupted its heap memory area (address zero)!");
  }
}

// end include: runtime_stack_check.js
// include: runtime_exceptions.js
// end include: runtime_exceptions.js
// include: runtime_debug.js
var runtimeDebug = true;

// Switch to false at runtime to disable logging at the right times
// Used by XXXXX_DEBUG settings to output debug messages.
function dbg(...args) {
  if (!runtimeDebug && typeof runtimeDebug != "undefined") return;
  // TODO(sbc): Make this configurable somehow.  Its not always convenient for
  // logging to show up as warnings.
  console.warn(...args);
}

// Endianness check
(() => {
  var h16 = new Int16Array(1);
  var h8 = new Int8Array(h16.buffer);
  h16[0] = 25459;
  if (h8[0] !== 115 || h8[1] !== 99) throw "Runtime error: expected the system to be little-endian! (Run with -sSUPPORT_BIG_ENDIAN to bypass)";
})();

function consumedModuleProp(prop) {
  if (!Object.getOwnPropertyDescriptor(Module, prop)) {
    Object.defineProperty(Module, prop, {
      configurable: true,
      set() {
        abort(`Attempt to set \`Module.${prop}\` after it has already been processed.  This can happen, for example, when code is injected via '--post-js' rather than '--pre-js'`);
      }
    });
  }
}

function makeInvalidEarlyAccess(name) {
  return () => assert(false, `call to '${name}' via reference taken before Wasm module initialization`);
}

function ignoredModuleProp(prop) {
  if (Object.getOwnPropertyDescriptor(Module, prop)) {
    abort(`\`Module.${prop}\` was supplied but \`${prop}\` not included in INCOMING_MODULE_JS_API`);
  }
}

// forcing the filesystem exports a few things by default
function isExportedByForceFilesystem(name) {
  return name === "FS_createPath" || name === "FS_createDataFile" || name === "FS_createPreloadedFile" || name === "FS_unlink" || name === "addRunDependency" || // The old FS has some functionality that WasmFS lacks.
  name === "FS_createLazyFile" || name === "FS_createDevice" || name === "removeRunDependency";
}

/**
 * Intercept access to a global symbol.  This enables us to give informative
 * warnings/errors when folks attempt to use symbols they did not include in
 * their build, or no symbols that no longer exist.
 */ function hookGlobalSymbolAccess(sym, func) {}

function missingGlobal(sym, msg) {
  hookGlobalSymbolAccess(sym, () => {
    warnOnce(`\`${sym}\` is not longer defined by emscripten. ${msg}`);
  });
}

missingGlobal("buffer", "Please use HEAP8.buffer or wasmMemory.buffer");

missingGlobal("asm", "Please use wasmExports instead");

function missingLibrarySymbol(sym) {
  hookGlobalSymbolAccess(sym, () => {
    // Can't `abort()` here because it would break code that does runtime
    // checks.  e.g. `if (typeof SDL === 'undefined')`.
    var msg = `\`${sym}\` is a library symbol and not included by default; add it to your library.js __deps or to DEFAULT_LIBRARY_FUNCS_TO_INCLUDE on the command line`;
    // DEFAULT_LIBRARY_FUNCS_TO_INCLUDE requires the name as it appears in
    // library.js, which means $name for a JS name with no prefix, or name
    // for a JS name like _name.
    var librarySymbol = sym;
    if (!librarySymbol.startsWith("_")) {
      librarySymbol = "$" + sym;
    }
    msg += ` (e.g. -sDEFAULT_LIBRARY_FUNCS_TO_INCLUDE='${librarySymbol}')`;
    if (isExportedByForceFilesystem(sym)) {
      msg += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
    }
    warnOnce(msg);
  });
  // Any symbol that is not included from the JS library is also (by definition)
  // not exported on the Module object.
  unexportedRuntimeSymbol(sym);
}

function unexportedRuntimeSymbol(sym) {
  if (!Object.getOwnPropertyDescriptor(Module, sym)) {
    Object.defineProperty(Module, sym, {
      configurable: true,
      get() {
        var msg = `'${sym}' was not exported. add it to EXPORTED_RUNTIME_METHODS (see the Emscripten FAQ)`;
        if (isExportedByForceFilesystem(sym)) {
          msg += ". Alternatively, forcing filesystem support (-sFORCE_FILESYSTEM) can export this for you";
        }
        abort(msg);
      }
    });
  }
}

// end include: runtime_debug.js
var readyPromiseResolve, readyPromiseReject;

// Memory management
var wasmMemory;

var /** @type {!Int8Array} */ HEAP8, /** @type {!Uint8Array} */ HEAPU8, /** @type {!Int16Array} */ HEAP16, /** @type {!Uint16Array} */ HEAPU16, /** @type {!Int32Array} */ HEAP32, /** @type {!Uint32Array} */ HEAPU32, /** @type {!Float32Array} */ HEAPF32, /** @type {!Float64Array} */ HEAPF64;

// BigInt64Array type is not correctly defined in closure
var /** not-@type {!BigInt64Array} */ HEAP64, /* BigUint64Array type is not correctly defined in closure
/** not-@type {!BigUint64Array} */ HEAPU64;

var runtimeInitialized = false;

function updateMemoryViews() {
  var b = wasmMemory.buffer;
  HEAP8 = new Int8Array(b);
  HEAP16 = new Int16Array(b);
  Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
  HEAPU16 = new Uint16Array(b);
  HEAP32 = new Int32Array(b);
  Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
  Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
  Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
  HEAP64 = new BigInt64Array(b);
  HEAPU64 = new BigUint64Array(b);
}

// include: memoryprofiler.js
// end include: memoryprofiler.js
// end include: runtime_common.js
assert(typeof Int32Array != "undefined" && typeof Float64Array !== "undefined" && Int32Array.prototype.subarray != undefined && Int32Array.prototype.set != undefined, "JS engine does not provide full typed array support");

function preRun() {
  if (Module["preRun"]) {
    if (typeof Module["preRun"] == "function") Module["preRun"] = [ Module["preRun"] ];
    while (Module["preRun"].length) {
      addOnPreRun(Module["preRun"].shift());
    }
  }
  consumedModuleProp("preRun");
  // Begin ATPRERUNS hooks
  callRuntimeCallbacks(onPreRuns);
}

function initRuntime() {
  assert(!runtimeInitialized);
  runtimeInitialized = true;
  checkStackCookie();
  // Begin ATINITS hooks
  if (!Module["noFSInit"] && !FS.initialized) FS.init();
  TTY.init();
  // End ATINITS hooks
  wasmExports["__wasm_call_ctors"]();
  // Begin ATPOSTCTORS hooks
  FS.ignorePermissions = false;
}

function preMain() {
  checkStackCookie();
}

function postRun() {
  checkStackCookie();
  // PThreads reuse the runtime from the main thread.
  if (Module["postRun"]) {
    if (typeof Module["postRun"] == "function") Module["postRun"] = [ Module["postRun"] ];
    while (Module["postRun"].length) {
      addOnPostRun(Module["postRun"].shift());
    }
  }
  consumedModuleProp("postRun");
  // Begin ATPOSTRUNS hooks
  callRuntimeCallbacks(onPostRuns);
}

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// Module.preRun (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;

var dependenciesFulfilled = null;

// overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

var runDependencyWatcher = null;

function addRunDependency(id) {
  runDependencies++;
  Module["monitorRunDependencies"]?.(runDependencies);
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval != "undefined") {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(() => {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            err("still waiting on run dependencies:");
          }
          err(`dependency: ${dep}`);
        }
        if (shown) {
          err("(end of list)");
        }
      }, 1e4);
    }
  } else {
    err("warning: run dependency added without ID");
  }
}

function removeRunDependency(id) {
  runDependencies--;
  Module["monitorRunDependencies"]?.(runDependencies);
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    err("warning: run dependency removed without ID");
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}

/** @param {string|number=} what */ function abort(what) {
  Module["onAbort"]?.(what);
  what = "Aborted(" + what + ")";
  // TODO(sbc): Should we remove printing and leave it up to whoever
  // catches the exception?
  err(what);
  ABORT = true;
  // Use a wasm runtime error, because a JS error might be seen as a foreign
  // exception, which means we'd run destructors on it. We need the error to
  // simply make the program stop.
  // FIXME This approach does not work in Wasm EH because it currently does not assume
  // all RuntimeErrors are from traps; it decides whether a RuntimeError is from
  // a trap or not based on a hidden field within the object. So at the moment
  // we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
  // allows this in the wasm spec.
  // Suppress closure compiler warning here. Closure compiler's builtin extern
  // definition for WebAssembly.RuntimeError claims it takes no arguments even
  // though it can.
  // TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
  /** @suppress {checkTypes} */ var e = new WebAssembly.RuntimeError(what);
  readyPromiseReject?.(e);
  // Throw the error whether or not MODULARIZE is set because abort is used
  // in code paths apart from instantiation where an exception is expected
  // to be thrown when abort is called.
  throw e;
}

function createExportWrapper(name, nargs) {
  return (...args) => {
    assert(runtimeInitialized, `native function \`${name}\` called before runtime initialization`);
    var f = wasmExports[name];
    assert(f, `exported native function \`${name}\` not found`);
    // Only assert for too many arguments. Too few can be valid since the missing arguments will be zero filled.
    assert(args.length <= nargs, `native function \`${name}\` called with ${args.length} args but expects ${nargs}`);
    return f(...args);
  };
}

var wasmBinaryFile;

function findWasmBinary() {
  return locateFile("IfcViewerWeb.wasm");
}

function getBinarySync(file) {
  if (file == wasmBinaryFile && wasmBinary) {
    return new Uint8Array(wasmBinary);
  }
  if (readBinary) {
    return readBinary(file);
  }
  throw "both async and sync fetching of the wasm failed";
}

async function getWasmBinary(binaryFile) {
  // If we don't have the binary yet, load it asynchronously using readAsync.
  if (!wasmBinary) {
    // Fetch the binary using readAsync
    try {
      var response = await readAsync(binaryFile);
      return new Uint8Array(response);
    } catch {}
  }
  // Otherwise, getBinarySync should be able to get it synchronously
  return getBinarySync(binaryFile);
}

async function instantiateArrayBuffer(binaryFile, imports) {
  try {
    var binary = await getWasmBinary(binaryFile);
    var instance = await WebAssembly.instantiate(binary, imports);
    return instance;
  } catch (reason) {
    err(`failed to asynchronously prepare wasm: ${reason}`);
    // Warn on some common problems.
    if (isFileURI(wasmBinaryFile)) {
      err(`warning: Loading from a file URI (${wasmBinaryFile}) is not supported in most browsers. See https://emscripten.org/docs/getting_started/FAQ.html#how-do-i-run-a-local-webserver-for-testing-why-does-my-program-stall-in-downloading-or-preparing`);
    }
    abort(reason);
  }
}

async function instantiateAsync(binary, binaryFile, imports) {
  if (!binary && typeof WebAssembly.instantiateStreaming == "function" && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
    try {
      var response = fetch(binaryFile, {
        credentials: "same-origin"
      });
      var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
      return instantiationResult;
    } catch (reason) {
      // We expect the most common failure cause to be a bad MIME type for the binary,
      // in which case falling back to ArrayBuffer instantiation should work.
      err(`wasm streaming compile failed: ${reason}`);
      err("falling back to ArrayBuffer instantiation");
    }
  }
  return instantiateArrayBuffer(binaryFile, imports);
}

function getWasmImports() {
  // prepare imports
  return {
    "env": wasmImports,
    "wasi_snapshot_preview1": wasmImports
  };
}

// Create the wasm instance.
// Receives the wasm imports, returns the exports.
async function createWasm() {
  // Load the wasm module and create an instance of using native support in the JS engine.
  // handle a generated wasm instance, receiving its exports and
  // performing other necessary setup
  /** @param {WebAssembly.Module=} module*/ function receiveInstance(instance, module) {
    wasmExports = instance.exports;
    wasmExports = applySignatureConversions(wasmExports);
    wasmMemory = wasmExports["memory"];
    assert(wasmMemory, "memory not found in wasm exports");
    updateMemoryViews();
    wasmTable = wasmExports["__indirect_function_table"];
    assert(wasmTable, "table not found in wasm exports");
    assignWasmExports(wasmExports);
    removeRunDependency("wasm-instantiate");
    return wasmExports;
  }
  // wait for the pthread pool (if any)
  addRunDependency("wasm-instantiate");
  // Prefer streaming instantiation if available.
  // Async compilation can be confusing when an error on the page overwrites Module
  // (for example, if the order of elements is wrong, and the one defining Module is
  // later), so we save Module and check it later.
  var trueModule = Module;
  function receiveInstantiationResult(result) {
    // 'result' is a ResultObject object which has both the module and instance.
    // receiveInstance() will swap in the exports (to Module.asm) so they can be called
    assert(Module === trueModule, "the Module object should not be replaced during async compilation - perhaps the order of HTML elements is wrong?");
    trueModule = null;
    // TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
    // When the regression is fixed, can restore the above PTHREADS-enabled path.
    return receiveInstance(result["instance"]);
  }
  var info = getWasmImports();
  // User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
  // to manually instantiate the Wasm module themselves. This allows pages to
  // run the instantiation parallel to any other async startup actions they are
  // performing.
  // Also pthreads and wasm workers initialize the wasm instance through this
  // path.
  if (Module["instantiateWasm"]) {
    return new Promise((resolve, reject) => {
      try {
        Module["instantiateWasm"](info, (mod, inst) => {
          resolve(receiveInstance(mod, inst));
        });
      } catch (e) {
        err(`Module.instantiateWasm callback failed with error: ${e}`);
        reject(e);
      }
    });
  }
  wasmBinaryFile ??= findWasmBinary();
  var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
  var exports = receiveInstantiationResult(result);
  return exports;
}

// end include: preamble.js
// Begin JS library code
class ExitStatus {
  name="ExitStatus";
  constructor(status) {
    this.message = `Program terminated with exit(${status})`;
    this.status = status;
  }
}

var callRuntimeCallbacks = callbacks => {
  while (callbacks.length > 0) {
    // Pass the module as the first argument.
    callbacks.shift()(Module);
  }
};

var onPostRuns = [];

var addOnPostRun = cb => onPostRuns.push(cb);

var onPreRuns = [];

var addOnPreRun = cb => onPreRuns.push(cb);

/**
     * @param {number} ptr
     * @param {string} type
     */ function getValue(ptr, type = "i8") {
  if (type.endsWith("*")) type = "*";
  switch (type) {
   case "i1":
    return HEAP8[ptr >>> 0];

   case "i8":
    return HEAP8[ptr >>> 0];

   case "i16":
    return HEAP16[((ptr) >>> 1) >>> 0];

   case "i32":
    return HEAP32[((ptr) >>> 2) >>> 0];

   case "i64":
    return HEAP64[((ptr) >>> 3) >>> 0];

   case "float":
    return HEAPF32[((ptr) >>> 2) >>> 0];

   case "double":
    return HEAPF64[((ptr) >>> 3) >>> 0];

   case "*":
    return HEAPU32[((ptr) >>> 2) >>> 0];

   default:
    abort(`invalid type for getValue: ${type}`);
  }
}

var noExitRuntime = true;

var ptrToString = ptr => {
  assert(typeof ptr === "number");
  return "0x" + ptr.toString(16).padStart(8, "0");
};

/**
     * @param {number} ptr
     * @param {number} value
     * @param {string} type
     */ function setValue(ptr, value, type = "i8") {
  if (type.endsWith("*")) type = "*";
  switch (type) {
   case "i1":
    HEAP8[ptr >>> 0] = value;
    break;

   case "i8":
    HEAP8[ptr >>> 0] = value;
    break;

   case "i16":
    HEAP16[((ptr) >>> 1) >>> 0] = value;
    break;

   case "i32":
    HEAP32[((ptr) >>> 2) >>> 0] = value;
    break;

   case "i64":
    HEAP64[((ptr) >>> 3) >>> 0] = BigInt(value);
    break;

   case "float":
    HEAPF32[((ptr) >>> 2) >>> 0] = value;
    break;

   case "double":
    HEAPF64[((ptr) >>> 3) >>> 0] = value;
    break;

   case "*":
    HEAPU32[((ptr) >>> 2) >>> 0] = value;
    break;

   default:
    abort(`invalid type for setValue: ${type}`);
  }
}

var stackRestore = val => __emscripten_stack_restore(val);

var stackSave = () => _emscripten_stack_get_current();

var warnOnce = text => {
  warnOnce.shown ||= {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    if (ENVIRONMENT_IS_NODE) text = "warning: " + text;
    err(text);
  }
};

var INT53_MAX = 9007199254740992;

var INT53_MIN = -9007199254740992;

var bigintToI53Checked = num => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);

var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder : undefined;

/**
     * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
     * array that contains uint8 values, returns a copy of that string as a
     * Javascript String object.
     * heapOrArray is either a regular array, or a JavaScript typed array view.
     * @param {number=} idx
     * @param {number=} maxBytesToRead
     * @return {string}
     */ var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead = NaN) => {
  idx >>>= 0;
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on
  // null terminator by itself.  Also, use the length info to avoid running tiny
  // strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation,
  // so that undefined/NaN means Infinity)
  while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
  // When using conditional TextDecoder, skip it for short strings as the overhead of the native call is not worth it.
  if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
    return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
  }
  var str = "";
  // If building with TextDecoder, we have already computed the string length
  // above, so test loop end condition against that
  while (idx < endPtr) {
    // For UTF8 byte structure, see:
    // http://en.wikipedia.org/wiki/UTF-8#Description
    // https://www.ietf.org/rfc/rfc2279.txt
    // https://tools.ietf.org/html/rfc3629
    var u0 = heapOrArray[idx++];
    if (!(u0 & 128)) {
      str += String.fromCharCode(u0);
      continue;
    }
    var u1 = heapOrArray[idx++] & 63;
    if ((u0 & 224) == 192) {
      str += String.fromCharCode(((u0 & 31) << 6) | u1);
      continue;
    }
    var u2 = heapOrArray[idx++] & 63;
    if ((u0 & 240) == 224) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      if ((u0 & 248) != 240) warnOnce("Invalid UTF-8 leading byte " + ptrToString(u0) + " encountered when deserializing a UTF-8 string in wasm memory to a JS string!");
      u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heapOrArray[idx++] & 63);
    }
    if (u0 < 65536) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 65536;
      str += String.fromCharCode(55296 | (ch >> 10), 56320 | (ch & 1023));
    }
  }
  return str;
};

/**
     * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
     * emscripten HEAP, returns a copy of that string as a Javascript String object.
     *
     * @param {number} ptr
     * @param {number=} maxBytesToRead - An optional length that specifies the
     *   maximum number of bytes to read. You can omit this parameter to scan the
     *   string until the first 0 byte. If maxBytesToRead is passed, and the string
     *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
     *   string will cut short at that byte index (i.e. maxBytesToRead will not
     *   produce a string of exact length [ptr, ptr+maxBytesToRead[) N.B. mixing
     *   frequent uses of UTF8ToString() with and without maxBytesToRead may throw
     *   JS JIT optimizations off, so it is worth to consider consistently using one
     * @return {string}
     */ var UTF8ToString = (ptr, maxBytesToRead) => {
  assert(typeof ptr == "number", `UTF8ToString expects a number (got ${typeof ptr})`);
  ptr >>>= 0;
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "";
};

function ___assert_fail(condition, filename, line, func) {
  condition >>>= 0;
  filename >>>= 0;
  func >>>= 0;
  return abort(`Assertion failed: ${UTF8ToString(condition)}, at: ` + [ filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function" ]);
}

class ExceptionInfo {
  // excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
  constructor(excPtr) {
    this.excPtr = excPtr;
    this.ptr = excPtr - 24;
  }
  set_type(type) {
    HEAPU32[(((this.ptr) + (4)) >>> 2) >>> 0] = type;
  }
  get_type() {
    return HEAPU32[(((this.ptr) + (4)) >>> 2) >>> 0];
  }
  set_destructor(destructor) {
    HEAPU32[(((this.ptr) + (8)) >>> 2) >>> 0] = destructor;
  }
  get_destructor() {
    return HEAPU32[(((this.ptr) + (8)) >>> 2) >>> 0];
  }
  set_caught(caught) {
    caught = caught ? 1 : 0;
    HEAP8[(this.ptr) + (12) >>> 0] = caught;
  }
  get_caught() {
    return HEAP8[(this.ptr) + (12) >>> 0] != 0;
  }
  set_rethrown(rethrown) {
    rethrown = rethrown ? 1 : 0;
    HEAP8[(this.ptr) + (13) >>> 0] = rethrown;
  }
  get_rethrown() {
    return HEAP8[(this.ptr) + (13) >>> 0] != 0;
  }
  // Initialize native structure fields. Should be called once after allocated.
  init(type, destructor) {
    this.set_adjusted_ptr(0);
    this.set_type(type);
    this.set_destructor(destructor);
  }
  set_adjusted_ptr(adjustedPtr) {
    HEAPU32[(((this.ptr) + (16)) >>> 2) >>> 0] = adjustedPtr;
  }
  get_adjusted_ptr() {
    return HEAPU32[(((this.ptr) + (16)) >>> 2) >>> 0];
  }
}

var exceptionLast = 0;

var uncaughtExceptionCount = 0;

function ___cxa_throw(ptr, type, destructor) {
  ptr >>>= 0;
  type >>>= 0;
  destructor >>>= 0;
  var info = new ExceptionInfo(ptr);
  // Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
  info.init(type, destructor);
  exceptionLast = ptr;
  uncaughtExceptionCount++;
  assert(false, "Exception thrown, but exception catching is not enabled. Compile with -sNO_DISABLE_EXCEPTION_CATCHING or -sEXCEPTION_CATCHING_ALLOWED=[..] to catch.");
}

/** @suppress {duplicate } */ var syscallGetVarargI = () => {
  assert(SYSCALLS.varargs != undefined);
  // the `+` prepended here is necessary to convince the JSCompiler that varargs is indeed a number.
  var ret = HEAP32[((+SYSCALLS.varargs) >>> 2) >>> 0];
  SYSCALLS.varargs += 4;
  return ret;
};

var syscallGetVarargP = syscallGetVarargI;

var PATH = {
  isAbs: path => path.charAt(0) === "/",
  splitPath: filename => {
    var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
    return splitPathRe.exec(filename).slice(1);
  },
  normalizeArray: (parts, allowAboveRoot) => {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === ".") {
        parts.splice(i, 1);
      } else if (last === "..") {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }
    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (;up; up--) {
        parts.unshift("..");
      }
    }
    return parts;
  },
  normalize: path => {
    var isAbsolute = PATH.isAbs(path), trailingSlash = path.slice(-1) === "/";
    // Normalize the path
    path = PATH.normalizeArray(path.split("/").filter(p => !!p), !isAbsolute).join("/");
    if (!path && !isAbsolute) {
      path = ".";
    }
    if (path && trailingSlash) {
      path += "/";
    }
    return (isAbsolute ? "/" : "") + path;
  },
  dirname: path => {
    var result = PATH.splitPath(path), root = result[0], dir = result[1];
    if (!root && !dir) {
      // No dirname whatsoever
      return ".";
    }
    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.slice(0, -1);
    }
    return root + dir;
  },
  basename: path => path && path.match(/([^\/]+|\/)\/*$/)[1],
  join: (...paths) => PATH.normalize(paths.join("/")),
  join2: (l, r) => PATH.normalize(l + "/" + r)
};

var initRandomFill = () => {
  // This block is not needed on v19+ since crypto.getRandomValues is builtin
  if (ENVIRONMENT_IS_NODE) {
    var nodeCrypto = require("crypto");
    return view => nodeCrypto.randomFillSync(view);
  }
  return view => crypto.getRandomValues(view);
};

var randomFill = view => {
  // Lazily init on the first invocation.
  (randomFill = initRandomFill())(view);
};

var PATH_FS = {
  resolve: (...args) => {
    var resolvedPath = "", resolvedAbsolute = false;
    for (var i = args.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? args[i] : FS.cwd();
      // Skip empty and invalid entries
      if (typeof path != "string") {
        throw new TypeError("Arguments to path.resolve must be strings");
      } else if (!path) {
        return "";
      }
      resolvedPath = path + "/" + resolvedPath;
      resolvedAbsolute = PATH.isAbs(path);
    }
    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)
    resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(p => !!p), !resolvedAbsolute).join("/");
    return ((resolvedAbsolute ? "/" : "") + resolvedPath) || ".";
  },
  relative: (from, to) => {
    from = PATH_FS.resolve(from).slice(1);
    to = PATH_FS.resolve(to).slice(1);
    function trim(arr) {
      var start = 0;
      for (;start < arr.length; start++) {
        if (arr[start] !== "") break;
      }
      var end = arr.length - 1;
      for (;end >= 0; end--) {
        if (arr[end] !== "") break;
      }
      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }
    var fromParts = trim(from.split("/"));
    var toParts = trim(to.split("/"));
    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }
    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push("..");
    }
    outputParts = outputParts.concat(toParts.slice(samePartsLength));
    return outputParts.join("/");
  }
};

var FS_stdin_getChar_buffer = [];

var lengthBytesUTF8 = str => {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code
    // unit, not a Unicode code point of the character! So decode
    // UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var c = str.charCodeAt(i);
    // possibly a lead surrogate
    if (c <= 127) {
      len++;
    } else if (c <= 2047) {
      len += 2;
    } else if (c >= 55296 && c <= 57343) {
      len += 4;
      ++i;
    } else {
      len += 3;
    }
  }
  return len;
};

var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
  outIdx >>>= 0;
  assert(typeof str === "string", `stringToUTF8Array expects a string (got ${typeof str})`);
  // Parameter maxBytesToWrite is not optional. Negative values, 0, null,
  // undefined and false each don't write out any bytes.
  if (!(maxBytesToWrite > 0)) return 0;
  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1;
  // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
    // and https://www.ietf.org/rfc/rfc2279.txt
    // and https://tools.ietf.org/html/rfc3629
    var u = str.codePointAt(i);
    if (u <= 127) {
      if (outIdx >= endIdx) break;
      heap[outIdx++ >>> 0] = u;
    } else if (u <= 2047) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++ >>> 0] = 192 | (u >> 6);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
    } else if (u <= 65535) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++ >>> 0] = 224 | (u >> 12);
      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      if (u > 1114111) warnOnce("Invalid Unicode code point " + ptrToString(u) + " encountered when serializing a JS string to a UTF-8 string in wasm memory! (Valid unicode code points should be in range 0-0x10FFFF).");
      heap[outIdx++ >>> 0] = 240 | (u >> 18);
      heap[outIdx++ >>> 0] = 128 | ((u >> 12) & 63);
      heap[outIdx++ >>> 0] = 128 | ((u >> 6) & 63);
      heap[outIdx++ >>> 0] = 128 | (u & 63);
      // Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
      // We need to manually skip over the second code unit for correct iteration.
      i++;
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx >>> 0] = 0;
  return outIdx - startIdx;
};

/** @type {function(string, boolean=, number=)} */ var intArrayFromString = (stringy, dontAddNull, length) => {
  var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
};

var FS_stdin_getChar = () => {
  if (!FS_stdin_getChar_buffer.length) {
    var result = null;
    if (ENVIRONMENT_IS_NODE) {
      // we will read data by chunks of BUFSIZE
      var BUFSIZE = 256;
      var buf = Buffer.alloc(BUFSIZE);
      var bytesRead = 0;
      // For some reason we must suppress a closure warning here, even though
      // fd definitely exists on process.stdin, and is even the proper way to
      // get the fd of stdin,
      // https://github.com/nodejs/help/issues/2136#issuecomment-523649904
      // This started to happen after moving this logic out of library_tty.js,
      // so it is related to the surrounding code in some unclear manner.
      /** @suppress {missingProperties} */ var fd = process.stdin.fd;
      try {
        bytesRead = fs.readSync(fd, buf, 0, BUFSIZE);
      } catch (e) {
        // Cross-platform differences: on Windows, reading EOF throws an
        // exception, but on other OSes, reading EOF returns 0. Uniformize
        // behavior by treating the EOF exception to return 0.
        if (e.toString().includes("EOF")) bytesRead = 0; else throw e;
      }
      if (bytesRead > 0) {
        result = buf.slice(0, bytesRead).toString("utf-8");
      }
    } else if (typeof window != "undefined" && typeof window.prompt == "function") {
      // Browser.
      result = window.prompt("Input: ");
      // returns null on cancel
      if (result !== null) {
        result += "\n";
      }
    } else {}
    if (!result) {
      return null;
    }
    FS_stdin_getChar_buffer = intArrayFromString(result, true);
  }
  return FS_stdin_getChar_buffer.shift();
};

var TTY = {
  ttys: [],
  init() {},
  shutdown() {},
  register(dev, ops) {
    TTY.ttys[dev] = {
      input: [],
      output: [],
      ops
    };
    FS.registerDevice(dev, TTY.stream_ops);
  },
  stream_ops: {
    open(stream) {
      var tty = TTY.ttys[stream.node.rdev];
      if (!tty) {
        throw new FS.ErrnoError(43);
      }
      stream.tty = tty;
      stream.seekable = false;
    },
    close(stream) {
      // flush any pending line data
      stream.tty.ops.fsync(stream.tty);
    },
    fsync(stream) {
      stream.tty.ops.fsync(stream.tty);
    },
    read(stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.get_char) {
        throw new FS.ErrnoError(60);
      }
      var bytesRead = 0;
      for (var i = 0; i < length; i++) {
        var result;
        try {
          result = stream.tty.ops.get_char(stream.tty);
        } catch (e) {
          throw new FS.ErrnoError(29);
        }
        if (result === undefined && bytesRead === 0) {
          throw new FS.ErrnoError(6);
        }
        if (result === null || result === undefined) break;
        bytesRead++;
        buffer[offset + i] = result;
      }
      if (bytesRead) {
        stream.node.atime = Date.now();
      }
      return bytesRead;
    },
    write(stream, buffer, offset, length, pos) {
      if (!stream.tty || !stream.tty.ops.put_char) {
        throw new FS.ErrnoError(60);
      }
      try {
        for (var i = 0; i < length; i++) {
          stream.tty.ops.put_char(stream.tty, buffer[offset + i]);
        }
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
      if (length) {
        stream.node.mtime = stream.node.ctime = Date.now();
      }
      return i;
    }
  },
  default_tty_ops: {
    get_char(tty) {
      return FS_stdin_getChar();
    },
    put_char(tty, val) {
      if (val === null || val === 10) {
        out(UTF8ArrayToString(tty.output));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    },
    fsync(tty) {
      if (tty.output?.length > 0) {
        out(UTF8ArrayToString(tty.output));
        tty.output = [];
      }
    },
    ioctl_tcgets(tty) {
      // typical setting
      return {
        c_iflag: 25856,
        c_oflag: 5,
        c_cflag: 191,
        c_lflag: 35387,
        c_cc: [ 3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ]
      };
    },
    ioctl_tcsets(tty, optional_actions, data) {
      // currently just ignore
      return 0;
    },
    ioctl_tiocgwinsz(tty) {
      return [ 24, 80 ];
    }
  },
  default_tty1_ops: {
    put_char(tty, val) {
      if (val === null || val === 10) {
        err(UTF8ArrayToString(tty.output));
        tty.output = [];
      } else {
        if (val != 0) tty.output.push(val);
      }
    },
    fsync(tty) {
      if (tty.output?.length > 0) {
        err(UTF8ArrayToString(tty.output));
        tty.output = [];
      }
    }
  }
};

var mmapAlloc = size => {
  abort("internal error: mmapAlloc called but `emscripten_builtin_memalign` native symbol not exported");
};

var MEMFS = {
  ops_table: null,
  mount(mount) {
    return MEMFS.createNode(null, "/", 16895, 0);
  },
  createNode(parent, name, mode, dev) {
    if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
      // no supported
      throw new FS.ErrnoError(63);
    }
    MEMFS.ops_table ||= {
      dir: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr,
          lookup: MEMFS.node_ops.lookup,
          mknod: MEMFS.node_ops.mknod,
          rename: MEMFS.node_ops.rename,
          unlink: MEMFS.node_ops.unlink,
          rmdir: MEMFS.node_ops.rmdir,
          readdir: MEMFS.node_ops.readdir,
          symlink: MEMFS.node_ops.symlink
        },
        stream: {
          llseek: MEMFS.stream_ops.llseek
        }
      },
      file: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr
        },
        stream: {
          llseek: MEMFS.stream_ops.llseek,
          read: MEMFS.stream_ops.read,
          write: MEMFS.stream_ops.write,
          mmap: MEMFS.stream_ops.mmap,
          msync: MEMFS.stream_ops.msync
        }
      },
      link: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr,
          readlink: MEMFS.node_ops.readlink
        },
        stream: {}
      },
      chrdev: {
        node: {
          getattr: MEMFS.node_ops.getattr,
          setattr: MEMFS.node_ops.setattr
        },
        stream: FS.chrdev_stream_ops
      }
    };
    var node = FS.createNode(parent, name, mode, dev);
    if (FS.isDir(node.mode)) {
      node.node_ops = MEMFS.ops_table.dir.node;
      node.stream_ops = MEMFS.ops_table.dir.stream;
      node.contents = {};
    } else if (FS.isFile(node.mode)) {
      node.node_ops = MEMFS.ops_table.file.node;
      node.stream_ops = MEMFS.ops_table.file.stream;
      node.usedBytes = 0;
      // The actual number of bytes used in the typed array, as opposed to contents.length which gives the whole capacity.
      // When the byte data of the file is populated, this will point to either a typed array, or a normal JS array. Typed arrays are preferred
      // for performance, and used by default. However, typed arrays are not resizable like normal JS arrays are, so there is a small disk size
      // penalty involved for appending file writes that continuously grow a file similar to std::vector capacity vs used -scheme.
      node.contents = null;
    } else if (FS.isLink(node.mode)) {
      node.node_ops = MEMFS.ops_table.link.node;
      node.stream_ops = MEMFS.ops_table.link.stream;
    } else if (FS.isChrdev(node.mode)) {
      node.node_ops = MEMFS.ops_table.chrdev.node;
      node.stream_ops = MEMFS.ops_table.chrdev.stream;
    }
    node.atime = node.mtime = node.ctime = Date.now();
    // add the new node to the parent
    if (parent) {
      parent.contents[name] = node;
      parent.atime = parent.mtime = parent.ctime = node.atime;
    }
    return node;
  },
  getFileDataAsTypedArray(node) {
    if (!node.contents) return new Uint8Array(0);
    if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
    // Make sure to not return excess unused bytes.
    return new Uint8Array(node.contents);
  },
  expandFileStorage(node, newCapacity) {
    var prevCapacity = node.contents ? node.contents.length : 0;
    if (prevCapacity >= newCapacity) return;
    // No need to expand, the storage was already large enough.
    // Don't expand strictly to the given requested limit if it's only a very small increase, but instead geometrically grow capacity.
    // For small filesizes (<1MB), perform size*2 geometric increase, but for large sizes, do a much more conservative size*1.125 increase to
    // avoid overshooting the allocation cap by a very large margin.
    var CAPACITY_DOUBLING_MAX = 1024 * 1024;
    newCapacity = Math.max(newCapacity, (prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125)) >>> 0);
    if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
    // At minimum allocate 256b for each file when expanding.
    var oldContents = node.contents;
    node.contents = new Uint8Array(newCapacity);
    // Allocate new storage.
    if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
  },
  resizeFileStorage(node, newSize) {
    if (node.usedBytes == newSize) return;
    if (newSize == 0) {
      node.contents = null;
      // Fully decommit when requesting a resize to zero.
      node.usedBytes = 0;
    } else {
      var oldContents = node.contents;
      node.contents = new Uint8Array(newSize);
      // Allocate new storage.
      if (oldContents) {
        node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)));
      }
      node.usedBytes = newSize;
    }
  },
  node_ops: {
    getattr(node) {
      var attr = {};
      // device numbers reuse inode numbers.
      attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
      attr.ino = node.id;
      attr.mode = node.mode;
      attr.nlink = 1;
      attr.uid = 0;
      attr.gid = 0;
      attr.rdev = node.rdev;
      if (FS.isDir(node.mode)) {
        attr.size = 4096;
      } else if (FS.isFile(node.mode)) {
        attr.size = node.usedBytes;
      } else if (FS.isLink(node.mode)) {
        attr.size = node.link.length;
      } else {
        attr.size = 0;
      }
      attr.atime = new Date(node.atime);
      attr.mtime = new Date(node.mtime);
      attr.ctime = new Date(node.ctime);
      // NOTE: In our implementation, st_blocks = Math.ceil(st_size/st_blksize),
      //       but this is not required by the standard.
      attr.blksize = 4096;
      attr.blocks = Math.ceil(attr.size / attr.blksize);
      return attr;
    },
    setattr(node, attr) {
      for (const key of [ "mode", "atime", "mtime", "ctime" ]) {
        if (attr[key] != null) {
          node[key] = attr[key];
        }
      }
      if (attr.size !== undefined) {
        MEMFS.resizeFileStorage(node, attr.size);
      }
    },
    lookup(parent, name) {
      throw new FS.ErrnoError(44);
    },
    mknod(parent, name, mode, dev) {
      return MEMFS.createNode(parent, name, mode, dev);
    },
    rename(old_node, new_dir, new_name) {
      var new_node;
      try {
        new_node = FS.lookupNode(new_dir, new_name);
      } catch (e) {}
      if (new_node) {
        if (FS.isDir(old_node.mode)) {
          // if we're overwriting a directory at new_name, make sure it's empty.
          for (var i in new_node.contents) {
            throw new FS.ErrnoError(55);
          }
        }
        FS.hashRemoveNode(new_node);
      }
      // do the internal rewiring
      delete old_node.parent.contents[old_node.name];
      new_dir.contents[new_name] = old_node;
      old_node.name = new_name;
      new_dir.ctime = new_dir.mtime = old_node.parent.ctime = old_node.parent.mtime = Date.now();
    },
    unlink(parent, name) {
      delete parent.contents[name];
      parent.ctime = parent.mtime = Date.now();
    },
    rmdir(parent, name) {
      var node = FS.lookupNode(parent, name);
      for (var i in node.contents) {
        throw new FS.ErrnoError(55);
      }
      delete parent.contents[name];
      parent.ctime = parent.mtime = Date.now();
    },
    readdir(node) {
      return [ ".", "..", ...Object.keys(node.contents) ];
    },
    symlink(parent, newname, oldpath) {
      var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
      node.link = oldpath;
      return node;
    },
    readlink(node) {
      if (!FS.isLink(node.mode)) {
        throw new FS.ErrnoError(28);
      }
      return node.link;
    }
  },
  stream_ops: {
    read(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= stream.node.usedBytes) return 0;
      var size = Math.min(stream.node.usedBytes - position, length);
      assert(size >= 0);
      if (size > 8 && contents.subarray) {
        // non-trivial, and typed array
        buffer.set(contents.subarray(position, position + size), offset);
      } else {
        for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i];
      }
      return size;
    },
    write(stream, buffer, offset, length, position, canOwn) {
      // The data buffer should be a typed array view
      assert(!(buffer instanceof ArrayBuffer));
      // If the buffer is located in main memory (HEAP), and if
      // memory can grow, we can't hold on to references of the
      // memory buffer, as they may get invalidated. That means we
      // need to do copy its contents.
      if (buffer.buffer === HEAP8.buffer) {
        canOwn = false;
      }
      if (!length) return 0;
      var node = stream.node;
      node.mtime = node.ctime = Date.now();
      if (buffer.subarray && (!node.contents || node.contents.subarray)) {
        // This write is from a typed array to a typed array?
        if (canOwn) {
          assert(position === 0, "canOwn must imply no weird position inside the file");
          node.contents = buffer.subarray(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (node.usedBytes === 0 && position === 0) {
          // If this is a simple first write to an empty file, do a fast set since we don't need to care about old data.
          node.contents = buffer.slice(offset, offset + length);
          node.usedBytes = length;
          return length;
        } else if (position + length <= node.usedBytes) {
          // Writing to an already allocated and used subrange of the file?
          node.contents.set(buffer.subarray(offset, offset + length), position);
          return length;
        }
      }
      // Appending to an existing file and we need to reallocate, or source data did not come as a typed array.
      MEMFS.expandFileStorage(node, position + length);
      if (node.contents.subarray && buffer.subarray) {
        // Use typed array write which is available.
        node.contents.set(buffer.subarray(offset, offset + length), position);
      } else {
        for (var i = 0; i < length; i++) {
          node.contents[position + i] = buffer[offset + i];
        }
      }
      node.usedBytes = Math.max(node.usedBytes, position + length);
      return length;
    },
    llseek(stream, offset, whence) {
      var position = offset;
      if (whence === 1) {
        position += stream.position;
      } else if (whence === 2) {
        if (FS.isFile(stream.node.mode)) {
          position += stream.node.usedBytes;
        }
      }
      if (position < 0) {
        throw new FS.ErrnoError(28);
      }
      return position;
    },
    mmap(stream, length, position, prot, flags) {
      if (!FS.isFile(stream.node.mode)) {
        throw new FS.ErrnoError(43);
      }
      var ptr;
      var allocated;
      var contents = stream.node.contents;
      // Only make a new copy when MAP_PRIVATE is specified.
      if (!(flags & 2) && contents && contents.buffer === HEAP8.buffer) {
        // We can't emulate MAP_SHARED when the file is not backed by the
        // buffer we're mapping to (e.g. the HEAP buffer).
        allocated = false;
        ptr = contents.byteOffset;
      } else {
        allocated = true;
        ptr = mmapAlloc(length);
        if (!ptr) {
          throw new FS.ErrnoError(48);
        }
        if (contents) {
          // Try to avoid unnecessary slices.
          if (position > 0 || position + length < contents.length) {
            if (contents.subarray) {
              contents = contents.subarray(position, position + length);
            } else {
              contents = Array.prototype.slice.call(contents, position, position + length);
            }
          }
          HEAP8.set(contents, ptr >>> 0);
        }
      }
      return {
        ptr,
        allocated
      };
    },
    msync(stream, buffer, offset, length, mmapFlags) {
      MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
      // should we check if bytesWritten and length are the same?
      return 0;
    }
  }
};

var asyncLoad = async url => {
  var arrayBuffer = await readAsync(url);
  assert(arrayBuffer, `Loading data file "${url}" failed (no arrayBuffer).`);
  return new Uint8Array(arrayBuffer);
};

var FS_createDataFile = (...args) => FS.createDataFile(...args);

var getUniqueRunDependency = id => {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
};

var preloadPlugins = [];

var FS_handledByPreloadPlugin = (byteArray, fullname, finish, onerror) => {
  // Ensure plugins are ready.
  if (typeof Browser != "undefined") Browser.init();
  var handled = false;
  preloadPlugins.forEach(plugin => {
    if (handled) return;
    if (plugin["canHandle"](fullname)) {
      plugin["handle"](byteArray, fullname, finish, onerror);
      handled = true;
    }
  });
  return handled;
};

var FS_createPreloadedFile = (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) => {
  // TODO we should allow people to just pass in a complete filename instead
  // of parent and name being that we just join them anyways
  var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
  var dep = getUniqueRunDependency(`cp ${fullname}`);
  // might have several active requests for the same fullname
  function processData(byteArray) {
    function finish(byteArray) {
      preFinish?.();
      if (!dontCreateFile) {
        FS_createDataFile(parent, name, byteArray, canRead, canWrite, canOwn);
      }
      onload?.();
      removeRunDependency(dep);
    }
    if (FS_handledByPreloadPlugin(byteArray, fullname, finish, () => {
      onerror?.();
      removeRunDependency(dep);
    })) {
      return;
    }
    finish(byteArray);
  }
  addRunDependency(dep);
  if (typeof url == "string") {
    asyncLoad(url).then(processData, onerror);
  } else {
    processData(url);
  }
};

var FS_modeStringToFlags = str => {
  var flagModes = {
    "r": 0,
    "r+": 2,
    "w": 512 | 64 | 1,
    "w+": 512 | 64 | 2,
    "a": 1024 | 64 | 1,
    "a+": 1024 | 64 | 2
  };
  var flags = flagModes[str];
  if (typeof flags == "undefined") {
    throw new Error(`Unknown file open mode: ${str}`);
  }
  return flags;
};

var FS_getMode = (canRead, canWrite) => {
  var mode = 0;
  if (canRead) mode |= 292 | 73;
  if (canWrite) mode |= 146;
  return mode;
};

var strError = errno => UTF8ToString(_strerror(errno));

var ERRNO_CODES = {
  "EPERM": 63,
  "ENOENT": 44,
  "ESRCH": 71,
  "EINTR": 27,
  "EIO": 29,
  "ENXIO": 60,
  "E2BIG": 1,
  "ENOEXEC": 45,
  "EBADF": 8,
  "ECHILD": 12,
  "EAGAIN": 6,
  "EWOULDBLOCK": 6,
  "ENOMEM": 48,
  "EACCES": 2,
  "EFAULT": 21,
  "ENOTBLK": 105,
  "EBUSY": 10,
  "EEXIST": 20,
  "EXDEV": 75,
  "ENODEV": 43,
  "ENOTDIR": 54,
  "EISDIR": 31,
  "EINVAL": 28,
  "ENFILE": 41,
  "EMFILE": 33,
  "ENOTTY": 59,
  "ETXTBSY": 74,
  "EFBIG": 22,
  "ENOSPC": 51,
  "ESPIPE": 70,
  "EROFS": 69,
  "EMLINK": 34,
  "EPIPE": 64,
  "EDOM": 18,
  "ERANGE": 68,
  "ENOMSG": 49,
  "EIDRM": 24,
  "ECHRNG": 106,
  "EL2NSYNC": 156,
  "EL3HLT": 107,
  "EL3RST": 108,
  "ELNRNG": 109,
  "EUNATCH": 110,
  "ENOCSI": 111,
  "EL2HLT": 112,
  "EDEADLK": 16,
  "ENOLCK": 46,
  "EBADE": 113,
  "EBADR": 114,
  "EXFULL": 115,
  "ENOANO": 104,
  "EBADRQC": 103,
  "EBADSLT": 102,
  "EDEADLOCK": 16,
  "EBFONT": 101,
  "ENOSTR": 100,
  "ENODATA": 116,
  "ETIME": 117,
  "ENOSR": 118,
  "ENONET": 119,
  "ENOPKG": 120,
  "EREMOTE": 121,
  "ENOLINK": 47,
  "EADV": 122,
  "ESRMNT": 123,
  "ECOMM": 124,
  "EPROTO": 65,
  "EMULTIHOP": 36,
  "EDOTDOT": 125,
  "EBADMSG": 9,
  "ENOTUNIQ": 126,
  "EBADFD": 127,
  "EREMCHG": 128,
  "ELIBACC": 129,
  "ELIBBAD": 130,
  "ELIBSCN": 131,
  "ELIBMAX": 132,
  "ELIBEXEC": 133,
  "ENOSYS": 52,
  "ENOTEMPTY": 55,
  "ENAMETOOLONG": 37,
  "ELOOP": 32,
  "EOPNOTSUPP": 138,
  "EPFNOSUPPORT": 139,
  "ECONNRESET": 15,
  "ENOBUFS": 42,
  "EAFNOSUPPORT": 5,
  "EPROTOTYPE": 67,
  "ENOTSOCK": 57,
  "ENOPROTOOPT": 50,
  "ESHUTDOWN": 140,
  "ECONNREFUSED": 14,
  "EADDRINUSE": 3,
  "ECONNABORTED": 13,
  "ENETUNREACH": 40,
  "ENETDOWN": 38,
  "ETIMEDOUT": 73,
  "EHOSTDOWN": 142,
  "EHOSTUNREACH": 23,
  "EINPROGRESS": 26,
  "EALREADY": 7,
  "EDESTADDRREQ": 17,
  "EMSGSIZE": 35,
  "EPROTONOSUPPORT": 66,
  "ESOCKTNOSUPPORT": 137,
  "EADDRNOTAVAIL": 4,
  "ENETRESET": 39,
  "EISCONN": 30,
  "ENOTCONN": 53,
  "ETOOMANYREFS": 141,
  "EUSERS": 136,
  "EDQUOT": 19,
  "ESTALE": 72,
  "ENOTSUP": 138,
  "ENOMEDIUM": 148,
  "EILSEQ": 25,
  "EOVERFLOW": 61,
  "ECANCELED": 11,
  "ENOTRECOVERABLE": 56,
  "EOWNERDEAD": 62,
  "ESTRPIPE": 135
};

var FS = {
  root: null,
  mounts: [],
  devices: {},
  streams: [],
  nextInode: 1,
  nameTable: null,
  currentPath: "/",
  initialized: false,
  ignorePermissions: true,
  filesystems: null,
  syncFSRequests: 0,
  readFiles: {},
  ErrnoError: class extends Error {
    name="ErrnoError";
    // We set the `name` property to be able to identify `FS.ErrnoError`
    // - the `name` is a standard ECMA-262 property of error objects. Kind of good to have it anyway.
    // - when using PROXYFS, an error can come from an underlying FS
    // as different FS objects have their own FS.ErrnoError each,
    // the test `err instanceof FS.ErrnoError` won't detect an error coming from another filesystem, causing bugs.
    // we'll use the reliable test `err.name == "ErrnoError"` instead
    constructor(errno) {
      super(runtimeInitialized ? strError(errno) : "");
      this.errno = errno;
      for (var key in ERRNO_CODES) {
        if (ERRNO_CODES[key] === errno) {
          this.code = key;
          break;
        }
      }
    }
  },
  FSStream: class {
    shared={};
    get object() {
      return this.node;
    }
    set object(val) {
      this.node = val;
    }
    get isRead() {
      return (this.flags & 2097155) !== 1;
    }
    get isWrite() {
      return (this.flags & 2097155) !== 0;
    }
    get isAppend() {
      return (this.flags & 1024);
    }
    get flags() {
      return this.shared.flags;
    }
    set flags(val) {
      this.shared.flags = val;
    }
    get position() {
      return this.shared.position;
    }
    set position(val) {
      this.shared.position = val;
    }
  },
  FSNode: class {
    node_ops={};
    stream_ops={};
    readMode=292 | 73;
    writeMode=146;
    mounted=null;
    constructor(parent, name, mode, rdev) {
      if (!parent) {
        parent = this;
      }
      this.parent = parent;
      this.mount = parent.mount;
      this.id = FS.nextInode++;
      this.name = name;
      this.mode = mode;
      this.rdev = rdev;
      this.atime = this.mtime = this.ctime = Date.now();
    }
    get read() {
      return (this.mode & this.readMode) === this.readMode;
    }
    set read(val) {
      val ? this.mode |= this.readMode : this.mode &= ~this.readMode;
    }
    get write() {
      return (this.mode & this.writeMode) === this.writeMode;
    }
    set write(val) {
      val ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
    }
    get isFolder() {
      return FS.isDir(this.mode);
    }
    get isDevice() {
      return FS.isChrdev(this.mode);
    }
  },
  lookupPath(path, opts = {}) {
    if (!path) {
      throw new FS.ErrnoError(44);
    }
    opts.follow_mount ??= true;
    if (!PATH.isAbs(path)) {
      path = FS.cwd() + "/" + path;
    }
    // limit max consecutive symlinks to 40 (SYMLOOP_MAX).
    linkloop: for (var nlinks = 0; nlinks < 40; nlinks++) {
      // split the absolute path
      var parts = path.split("/").filter(p => !!p);
      // start at the root
      var current = FS.root;
      var current_path = "/";
      for (var i = 0; i < parts.length; i++) {
        var islast = (i === parts.length - 1);
        if (islast && opts.parent) {
          // stop resolving
          break;
        }
        if (parts[i] === ".") {
          continue;
        }
        if (parts[i] === "..") {
          current_path = PATH.dirname(current_path);
          if (FS.isRoot(current)) {
            path = current_path + "/" + parts.slice(i + 1).join("/");
            continue linkloop;
          } else {
            current = current.parent;
          }
          continue;
        }
        current_path = PATH.join2(current_path, parts[i]);
        try {
          current = FS.lookupNode(current, parts[i]);
        } catch (e) {
          // if noent_okay is true, suppress a ENOENT in the last component
          // and return an object with an undefined node. This is needed for
          // resolving symlinks in the path when creating a file.
          if ((e?.errno === 44) && islast && opts.noent_okay) {
            return {
              path: current_path
            };
          }
          throw e;
        }
        // jump to the mount's root node if this is a mountpoint
        if (FS.isMountpoint(current) && (!islast || opts.follow_mount)) {
          current = current.mounted.root;
        }
        // by default, lookupPath will not follow a symlink if it is the final path component.
        // setting opts.follow = true will override this behavior.
        if (FS.isLink(current.mode) && (!islast || opts.follow)) {
          if (!current.node_ops.readlink) {
            throw new FS.ErrnoError(52);
          }
          var link = current.node_ops.readlink(current);
          if (!PATH.isAbs(link)) {
            link = PATH.dirname(current_path) + "/" + link;
          }
          path = link + "/" + parts.slice(i + 1).join("/");
          continue linkloop;
        }
      }
      return {
        path: current_path,
        node: current
      };
    }
    throw new FS.ErrnoError(32);
  },
  getPath(node) {
    var path;
    while (true) {
      if (FS.isRoot(node)) {
        var mount = node.mount.mountpoint;
        if (!path) return mount;
        return mount[mount.length - 1] !== "/" ? `${mount}/${path}` : mount + path;
      }
      path = path ? `${node.name}/${path}` : node.name;
      node = node.parent;
    }
  },
  hashName(parentid, name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    }
    return ((parentid + hash) >>> 0) % FS.nameTable.length;
  },
  hashAddNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    node.name_next = FS.nameTable[hash];
    FS.nameTable[hash] = node;
  },
  hashRemoveNode(node) {
    var hash = FS.hashName(node.parent.id, node.name);
    if (FS.nameTable[hash] === node) {
      FS.nameTable[hash] = node.name_next;
    } else {
      var current = FS.nameTable[hash];
      while (current) {
        if (current.name_next === node) {
          current.name_next = node.name_next;
          break;
        }
        current = current.name_next;
      }
    }
  },
  lookupNode(parent, name) {
    var errCode = FS.mayLookup(parent);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    var hash = FS.hashName(parent.id, name);
    for (var node = FS.nameTable[hash]; node; node = node.name_next) {
      var nodeName = node.name;
      if (node.parent.id === parent.id && nodeName === name) {
        return node;
      }
    }
    // if we failed to find it in the cache, call into the VFS
    return FS.lookup(parent, name);
  },
  createNode(parent, name, mode, rdev) {
    assert(typeof parent == "object");
    var node = new FS.FSNode(parent, name, mode, rdev);
    FS.hashAddNode(node);
    return node;
  },
  destroyNode(node) {
    FS.hashRemoveNode(node);
  },
  isRoot(node) {
    return node === node.parent;
  },
  isMountpoint(node) {
    return !!node.mounted;
  },
  isFile(mode) {
    return (mode & 61440) === 32768;
  },
  isDir(mode) {
    return (mode & 61440) === 16384;
  },
  isLink(mode) {
    return (mode & 61440) === 40960;
  },
  isChrdev(mode) {
    return (mode & 61440) === 8192;
  },
  isBlkdev(mode) {
    return (mode & 61440) === 24576;
  },
  isFIFO(mode) {
    return (mode & 61440) === 4096;
  },
  isSocket(mode) {
    return (mode & 49152) === 49152;
  },
  flagsToPermissionString(flag) {
    var perms = [ "r", "w", "rw" ][flag & 3];
    if ((flag & 512)) {
      perms += "w";
    }
    return perms;
  },
  nodePermissions(node, perms) {
    if (FS.ignorePermissions) {
      return 0;
    }
    // return 0 if any user, group or owner bits are set.
    if (perms.includes("r") && !(node.mode & 292)) {
      return 2;
    } else if (perms.includes("w") && !(node.mode & 146)) {
      return 2;
    } else if (perms.includes("x") && !(node.mode & 73)) {
      return 2;
    }
    return 0;
  },
  mayLookup(dir) {
    if (!FS.isDir(dir.mode)) return 54;
    var errCode = FS.nodePermissions(dir, "x");
    if (errCode) return errCode;
    if (!dir.node_ops.lookup) return 2;
    return 0;
  },
  mayCreate(dir, name) {
    if (!FS.isDir(dir.mode)) {
      return 54;
    }
    try {
      var node = FS.lookupNode(dir, name);
      return 20;
    } catch (e) {}
    return FS.nodePermissions(dir, "wx");
  },
  mayDelete(dir, name, isdir) {
    var node;
    try {
      node = FS.lookupNode(dir, name);
    } catch (e) {
      return e.errno;
    }
    var errCode = FS.nodePermissions(dir, "wx");
    if (errCode) {
      return errCode;
    }
    if (isdir) {
      if (!FS.isDir(node.mode)) {
        return 54;
      }
      if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
        return 10;
      }
    } else {
      if (FS.isDir(node.mode)) {
        return 31;
      }
    }
    return 0;
  },
  mayOpen(node, flags) {
    if (!node) {
      return 44;
    }
    if (FS.isLink(node.mode)) {
      return 32;
    } else if (FS.isDir(node.mode)) {
      if (FS.flagsToPermissionString(flags) !== "r" || (flags & (512 | 64))) {
        // TODO: check for O_SEARCH? (== search for dir only)
        return 31;
      }
    }
    return FS.nodePermissions(node, FS.flagsToPermissionString(flags));
  },
  checkOpExists(op, err) {
    if (!op) {
      throw new FS.ErrnoError(err);
    }
    return op;
  },
  MAX_OPEN_FDS: 4096,
  nextfd() {
    for (var fd = 0; fd <= FS.MAX_OPEN_FDS; fd++) {
      if (!FS.streams[fd]) {
        return fd;
      }
    }
    throw new FS.ErrnoError(33);
  },
  getStreamChecked(fd) {
    var stream = FS.getStream(fd);
    if (!stream) {
      throw new FS.ErrnoError(8);
    }
    return stream;
  },
  getStream: fd => FS.streams[fd],
  createStream(stream, fd = -1) {
    assert(fd >= -1);
    // clone it, so we can return an instance of FSStream
    stream = Object.assign(new FS.FSStream, stream);
    if (fd == -1) {
      fd = FS.nextfd();
    }
    stream.fd = fd;
    FS.streams[fd] = stream;
    return stream;
  },
  closeStream(fd) {
    FS.streams[fd] = null;
  },
  dupStream(origStream, fd = -1) {
    var stream = FS.createStream(origStream, fd);
    stream.stream_ops?.dup?.(stream);
    return stream;
  },
  doSetAttr(stream, node, attr) {
    var setattr = stream?.stream_ops.setattr;
    var arg = setattr ? stream : node;
    setattr ??= node.node_ops.setattr;
    FS.checkOpExists(setattr, 63);
    setattr(arg, attr);
  },
  chrdev_stream_ops: {
    open(stream) {
      var device = FS.getDevice(stream.node.rdev);
      // override node's stream ops with the device's
      stream.stream_ops = device.stream_ops;
      // forward the open call
      stream.stream_ops.open?.(stream);
    },
    llseek() {
      throw new FS.ErrnoError(70);
    }
  },
  major: dev => ((dev) >> 8),
  minor: dev => ((dev) & 255),
  makedev: (ma, mi) => ((ma) << 8 | (mi)),
  registerDevice(dev, ops) {
    FS.devices[dev] = {
      stream_ops: ops
    };
  },
  getDevice: dev => FS.devices[dev],
  getMounts(mount) {
    var mounts = [];
    var check = [ mount ];
    while (check.length) {
      var m = check.pop();
      mounts.push(m);
      check.push(...m.mounts);
    }
    return mounts;
  },
  syncfs(populate, callback) {
    if (typeof populate == "function") {
      callback = populate;
      populate = false;
    }
    FS.syncFSRequests++;
    if (FS.syncFSRequests > 1) {
      err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
    }
    var mounts = FS.getMounts(FS.root.mount);
    var completed = 0;
    function doCallback(errCode) {
      assert(FS.syncFSRequests > 0);
      FS.syncFSRequests--;
      return callback(errCode);
    }
    function done(errCode) {
      if (errCode) {
        if (!done.errored) {
          done.errored = true;
          return doCallback(errCode);
        }
        return;
      }
      if (++completed >= mounts.length) {
        doCallback(null);
      }
    }
    // sync all mounts
    mounts.forEach(mount => {
      if (!mount.type.syncfs) {
        return done(null);
      }
      mount.type.syncfs(mount, populate, done);
    });
  },
  mount(type, opts, mountpoint) {
    if (typeof type == "string") {
      // The filesystem was not included, and instead we have an error
      // message stored in the variable.
      throw type;
    }
    var root = mountpoint === "/";
    var pseudo = !mountpoint;
    var node;
    if (root && FS.root) {
      throw new FS.ErrnoError(10);
    } else if (!root && !pseudo) {
      var lookup = FS.lookupPath(mountpoint, {
        follow_mount: false
      });
      mountpoint = lookup.path;
      // use the absolute path
      node = lookup.node;
      if (FS.isMountpoint(node)) {
        throw new FS.ErrnoError(10);
      }
      if (!FS.isDir(node.mode)) {
        throw new FS.ErrnoError(54);
      }
    }
    var mount = {
      type,
      opts,
      mountpoint,
      mounts: []
    };
    // create a root node for the fs
    var mountRoot = type.mount(mount);
    mountRoot.mount = mount;
    mount.root = mountRoot;
    if (root) {
      FS.root = mountRoot;
    } else if (node) {
      // set as a mountpoint
      node.mounted = mount;
      // add the new mount to the current mount's children
      if (node.mount) {
        node.mount.mounts.push(mount);
      }
    }
    return mountRoot;
  },
  unmount(mountpoint) {
    var lookup = FS.lookupPath(mountpoint, {
      follow_mount: false
    });
    if (!FS.isMountpoint(lookup.node)) {
      throw new FS.ErrnoError(28);
    }
    // destroy the nodes for this mount, and all its child mounts
    var node = lookup.node;
    var mount = node.mounted;
    var mounts = FS.getMounts(mount);
    Object.keys(FS.nameTable).forEach(hash => {
      var current = FS.nameTable[hash];
      while (current) {
        var next = current.name_next;
        if (mounts.includes(current.mount)) {
          FS.destroyNode(current);
        }
        current = next;
      }
    });
    // no longer a mountpoint
    node.mounted = null;
    // remove this mount from the child mounts
    var idx = node.mount.mounts.indexOf(mount);
    assert(idx !== -1);
    node.mount.mounts.splice(idx, 1);
  },
  lookup(parent, name) {
    return parent.node_ops.lookup(parent, name);
  },
  mknod(path, mode, dev) {
    var lookup = FS.lookupPath(path, {
      parent: true
    });
    var parent = lookup.node;
    var name = PATH.basename(path);
    if (!name) {
      throw new FS.ErrnoError(28);
    }
    if (name === "." || name === "..") {
      throw new FS.ErrnoError(20);
    }
    var errCode = FS.mayCreate(parent, name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.mknod) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.mknod(parent, name, mode, dev);
  },
  statfs(path) {
    return FS.statfsNode(FS.lookupPath(path, {
      follow: true
    }).node);
  },
  statfsStream(stream) {
    // We keep a separate statfsStream function because noderawfs overrides
    // it. In noderawfs, stream.node is sometimes null. Instead, we need to
    // look at stream.path.
    return FS.statfsNode(stream.node);
  },
  statfsNode(node) {
    // NOTE: None of the defaults here are true. We're just returning safe and
    //       sane values. Currently nodefs and rawfs replace these defaults,
    //       other file systems leave them alone.
    var rtn = {
      bsize: 4096,
      frsize: 4096,
      blocks: 1e6,
      bfree: 5e5,
      bavail: 5e5,
      files: FS.nextInode,
      ffree: FS.nextInode - 1,
      fsid: 42,
      flags: 2,
      namelen: 255
    };
    if (node.node_ops.statfs) {
      Object.assign(rtn, node.node_ops.statfs(node.mount.opts.root));
    }
    return rtn;
  },
  create(path, mode = 438) {
    mode &= 4095;
    mode |= 32768;
    return FS.mknod(path, mode, 0);
  },
  mkdir(path, mode = 511) {
    mode &= 511 | 512;
    mode |= 16384;
    return FS.mknod(path, mode, 0);
  },
  mkdirTree(path, mode) {
    var dirs = path.split("/");
    var d = "";
    for (var dir of dirs) {
      if (!dir) continue;
      if (d || PATH.isAbs(path)) d += "/";
      d += dir;
      try {
        FS.mkdir(d, mode);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
    }
  },
  mkdev(path, mode, dev) {
    if (typeof dev == "undefined") {
      dev = mode;
      mode = 438;
    }
    mode |= 8192;
    return FS.mknod(path, mode, dev);
  },
  symlink(oldpath, newpath) {
    if (!PATH_FS.resolve(oldpath)) {
      throw new FS.ErrnoError(44);
    }
    var lookup = FS.lookupPath(newpath, {
      parent: true
    });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var newname = PATH.basename(newpath);
    var errCode = FS.mayCreate(parent, newname);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.symlink) {
      throw new FS.ErrnoError(63);
    }
    return parent.node_ops.symlink(parent, newname, oldpath);
  },
  rename(old_path, new_path) {
    var old_dirname = PATH.dirname(old_path);
    var new_dirname = PATH.dirname(new_path);
    var old_name = PATH.basename(old_path);
    var new_name = PATH.basename(new_path);
    // parents must exist
    var lookup, old_dir, new_dir;
    // let the errors from non existent directories percolate up
    lookup = FS.lookupPath(old_path, {
      parent: true
    });
    old_dir = lookup.node;
    lookup = FS.lookupPath(new_path, {
      parent: true
    });
    new_dir = lookup.node;
    if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
    // need to be part of the same mount
    if (old_dir.mount !== new_dir.mount) {
      throw new FS.ErrnoError(75);
    }
    // source must exist
    var old_node = FS.lookupNode(old_dir, old_name);
    // old path should not be an ancestor of the new path
    var relative = PATH_FS.relative(old_path, new_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(28);
    }
    // new path should not be an ancestor of the old path
    relative = PATH_FS.relative(new_path, old_dirname);
    if (relative.charAt(0) !== ".") {
      throw new FS.ErrnoError(55);
    }
    // see if the new path already exists
    var new_node;
    try {
      new_node = FS.lookupNode(new_dir, new_name);
    } catch (e) {}
    // early out if nothing needs to change
    if (old_node === new_node) {
      return;
    }
    // we'll need to delete the old entry
    var isdir = FS.isDir(old_node.mode);
    var errCode = FS.mayDelete(old_dir, old_name, isdir);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    // need delete permissions if we'll be overwriting.
    // need create permissions if new doesn't already exist.
    errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!old_dir.node_ops.rename) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(old_node) || (new_node && FS.isMountpoint(new_node))) {
      throw new FS.ErrnoError(10);
    }
    // if we are going to change the parent, check write permissions
    if (new_dir !== old_dir) {
      errCode = FS.nodePermissions(old_dir, "w");
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // remove the node from the lookup hash
    FS.hashRemoveNode(old_node);
    // do the underlying fs rename
    try {
      old_dir.node_ops.rename(old_node, new_dir, new_name);
      // update old node (we do this here to avoid each backend
      // needing to)
      old_node.parent = new_dir;
    } catch (e) {
      throw e;
    } finally {
      // add the node back to the hash (in case node_ops.rename
      // changed its name)
      FS.hashAddNode(old_node);
    }
  },
  rmdir(path) {
    var lookup = FS.lookupPath(path, {
      parent: true
    });
    var parent = lookup.node;
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, true);
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.rmdir) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.rmdir(parent, name);
    FS.destroyNode(node);
  },
  readdir(path) {
    var lookup = FS.lookupPath(path, {
      follow: true
    });
    var node = lookup.node;
    var readdir = FS.checkOpExists(node.node_ops.readdir, 54);
    return readdir(node);
  },
  unlink(path) {
    var lookup = FS.lookupPath(path, {
      parent: true
    });
    var parent = lookup.node;
    if (!parent) {
      throw new FS.ErrnoError(44);
    }
    var name = PATH.basename(path);
    var node = FS.lookupNode(parent, name);
    var errCode = FS.mayDelete(parent, name, false);
    if (errCode) {
      // According to POSIX, we should map EISDIR to EPERM, but
      // we instead do what Linux does (and we must, as we use
      // the musl linux libc).
      throw new FS.ErrnoError(errCode);
    }
    if (!parent.node_ops.unlink) {
      throw new FS.ErrnoError(63);
    }
    if (FS.isMountpoint(node)) {
      throw new FS.ErrnoError(10);
    }
    parent.node_ops.unlink(parent, name);
    FS.destroyNode(node);
  },
  readlink(path) {
    var lookup = FS.lookupPath(path);
    var link = lookup.node;
    if (!link) {
      throw new FS.ErrnoError(44);
    }
    if (!link.node_ops.readlink) {
      throw new FS.ErrnoError(28);
    }
    return link.node_ops.readlink(link);
  },
  stat(path, dontFollow) {
    var lookup = FS.lookupPath(path, {
      follow: !dontFollow
    });
    var node = lookup.node;
    var getattr = FS.checkOpExists(node.node_ops.getattr, 63);
    return getattr(node);
  },
  fstat(fd) {
    var stream = FS.getStreamChecked(fd);
    var node = stream.node;
    var getattr = stream.stream_ops.getattr;
    var arg = getattr ? stream : node;
    getattr ??= node.node_ops.getattr;
    FS.checkOpExists(getattr, 63);
    return getattr(arg);
  },
  lstat(path) {
    return FS.stat(path, true);
  },
  doChmod(stream, node, mode, dontFollow) {
    FS.doSetAttr(stream, node, {
      mode: (mode & 4095) | (node.mode & ~4095),
      ctime: Date.now(),
      dontFollow
    });
  },
  chmod(path, mode, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, {
        follow: !dontFollow
      });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChmod(null, node, mode, dontFollow);
  },
  lchmod(path, mode) {
    FS.chmod(path, mode, true);
  },
  fchmod(fd, mode) {
    var stream = FS.getStreamChecked(fd);
    FS.doChmod(stream, stream.node, mode, false);
  },
  doChown(stream, node, dontFollow) {
    FS.doSetAttr(stream, node, {
      timestamp: Date.now(),
      dontFollow
    });
  },
  chown(path, uid, gid, dontFollow) {
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, {
        follow: !dontFollow
      });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doChown(null, node, dontFollow);
  },
  lchown(path, uid, gid) {
    FS.chown(path, uid, gid, true);
  },
  fchown(fd, uid, gid) {
    var stream = FS.getStreamChecked(fd);
    FS.doChown(stream, stream.node, false);
  },
  doTruncate(stream, node, len) {
    if (FS.isDir(node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!FS.isFile(node.mode)) {
      throw new FS.ErrnoError(28);
    }
    var errCode = FS.nodePermissions(node, "w");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.doSetAttr(stream, node, {
      size: len,
      timestamp: Date.now()
    });
  },
  truncate(path, len) {
    if (len < 0) {
      throw new FS.ErrnoError(28);
    }
    var node;
    if (typeof path == "string") {
      var lookup = FS.lookupPath(path, {
        follow: true
      });
      node = lookup.node;
    } else {
      node = path;
    }
    FS.doTruncate(null, node, len);
  },
  ftruncate(fd, len) {
    var stream = FS.getStreamChecked(fd);
    if (len < 0 || (stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(28);
    }
    FS.doTruncate(stream, stream.node, len);
  },
  utime(path, atime, mtime) {
    var lookup = FS.lookupPath(path, {
      follow: true
    });
    var node = lookup.node;
    var setattr = FS.checkOpExists(node.node_ops.setattr, 63);
    setattr(node, {
      atime,
      mtime
    });
  },
  open(path, flags, mode = 438) {
    if (path === "") {
      throw new FS.ErrnoError(44);
    }
    flags = typeof flags == "string" ? FS_modeStringToFlags(flags) : flags;
    if ((flags & 64)) {
      mode = (mode & 4095) | 32768;
    } else {
      mode = 0;
    }
    var node;
    var isDirPath;
    if (typeof path == "object") {
      node = path;
    } else {
      isDirPath = path.endsWith("/");
      // noent_okay makes it so that if the final component of the path
      // doesn't exist, lookupPath returns `node: undefined`. `path` will be
      // updated to point to the target of all symlinks.
      var lookup = FS.lookupPath(path, {
        follow: !(flags & 131072),
        noent_okay: true
      });
      node = lookup.node;
      path = lookup.path;
    }
    // perhaps we need to create the node
    var created = false;
    if ((flags & 64)) {
      if (node) {
        // if O_CREAT and O_EXCL are set, error out if the node already exists
        if ((flags & 128)) {
          throw new FS.ErrnoError(20);
        }
      } else if (isDirPath) {
        throw new FS.ErrnoError(31);
      } else {
        // node doesn't exist, try to create it
        // Ignore the permission bits here to ensure we can `open` this new
        // file below. We use chmod below the apply the permissions once the
        // file is open.
        node = FS.mknod(path, mode | 511, 0);
        created = true;
      }
    }
    if (!node) {
      throw new FS.ErrnoError(44);
    }
    // can't truncate a device
    if (FS.isChrdev(node.mode)) {
      flags &= ~512;
    }
    // if asked only for a directory, then this must be one
    if ((flags & 65536) && !FS.isDir(node.mode)) {
      throw new FS.ErrnoError(54);
    }
    // check permissions, if this is not a file we just created now (it is ok to
    // create and write to a file with read-only permissions; it is read-only
    // for later use)
    if (!created) {
      var errCode = FS.mayOpen(node, flags);
      if (errCode) {
        throw new FS.ErrnoError(errCode);
      }
    }
    // do truncation if necessary
    if ((flags & 512) && !created) {
      FS.truncate(node, 0);
    }
    // we've already handled these, don't pass down to the underlying vfs
    flags &= ~(128 | 512 | 131072);
    // register the stream with the filesystem
    var stream = FS.createStream({
      node,
      path: FS.getPath(node),
      // we want the absolute path to the node
      flags,
      seekable: true,
      position: 0,
      stream_ops: node.stream_ops,
      // used by the file family libc calls (fopen, fwrite, ferror, etc.)
      ungotten: [],
      error: false
    });
    // call the new stream's open function
    if (stream.stream_ops.open) {
      stream.stream_ops.open(stream);
    }
    if (created) {
      FS.chmod(node, mode & 511);
    }
    if (Module["logReadFiles"] && !(flags & 1)) {
      if (!(path in FS.readFiles)) {
        FS.readFiles[path] = 1;
      }
    }
    return stream;
  },
  close(stream) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (stream.getdents) stream.getdents = null;
    // free readdir state
    try {
      if (stream.stream_ops.close) {
        stream.stream_ops.close(stream);
      }
    } catch (e) {
      throw e;
    } finally {
      FS.closeStream(stream.fd);
    }
    stream.fd = null;
  },
  isClosed(stream) {
    return stream.fd === null;
  },
  llseek(stream, offset, whence) {
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if (!stream.seekable || !stream.stream_ops.llseek) {
      throw new FS.ErrnoError(70);
    }
    if (whence != 0 && whence != 1 && whence != 2) {
      throw new FS.ErrnoError(28);
    }
    stream.position = stream.stream_ops.llseek(stream, offset, whence);
    stream.ungotten = [];
    return stream.position;
  },
  read(stream, buffer, offset, length, position) {
    assert(offset >= 0);
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.read) {
      throw new FS.ErrnoError(28);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
    if (!seeking) stream.position += bytesRead;
    return bytesRead;
  },
  write(stream, buffer, offset, length, position, canOwn) {
    assert(offset >= 0);
    if (length < 0 || position < 0) {
      throw new FS.ErrnoError(28);
    }
    if (FS.isClosed(stream)) {
      throw new FS.ErrnoError(8);
    }
    if ((stream.flags & 2097155) === 0) {
      throw new FS.ErrnoError(8);
    }
    if (FS.isDir(stream.node.mode)) {
      throw new FS.ErrnoError(31);
    }
    if (!stream.stream_ops.write) {
      throw new FS.ErrnoError(28);
    }
    if (stream.seekable && stream.flags & 1024) {
      // seek to the end before writing in append mode
      FS.llseek(stream, 0, 2);
    }
    var seeking = typeof position != "undefined";
    if (!seeking) {
      position = stream.position;
    } else if (!stream.seekable) {
      throw new FS.ErrnoError(70);
    }
    var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
    if (!seeking) stream.position += bytesWritten;
    return bytesWritten;
  },
  mmap(stream, length, position, prot, flags) {
    // User requests writing to file (prot & PROT_WRITE != 0).
    // Checking if we have permissions to write to the file unless
    // MAP_PRIVATE flag is set. According to POSIX spec it is possible
    // to write to file opened in read-only mode with MAP_PRIVATE flag,
    // as all modifications will be visible only in the memory of
    // the current process.
    if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
      throw new FS.ErrnoError(2);
    }
    if ((stream.flags & 2097155) === 1) {
      throw new FS.ErrnoError(2);
    }
    if (!stream.stream_ops.mmap) {
      throw new FS.ErrnoError(43);
    }
    if (!length) {
      throw new FS.ErrnoError(28);
    }
    return stream.stream_ops.mmap(stream, length, position, prot, flags);
  },
  msync(stream, buffer, offset, length, mmapFlags) {
    assert(offset >= 0);
    if (!stream.stream_ops.msync) {
      return 0;
    }
    return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags);
  },
  ioctl(stream, cmd, arg) {
    if (!stream.stream_ops.ioctl) {
      throw new FS.ErrnoError(59);
    }
    return stream.stream_ops.ioctl(stream, cmd, arg);
  },
  readFile(path, opts = {}) {
    opts.flags = opts.flags || 0;
    opts.encoding = opts.encoding || "binary";
    if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
      throw new Error(`Invalid encoding type "${opts.encoding}"`);
    }
    var stream = FS.open(path, opts.flags);
    var stat = FS.stat(path);
    var length = stat.size;
    var buf = new Uint8Array(length);
    FS.read(stream, buf, 0, length, 0);
    if (opts.encoding === "utf8") {
      buf = UTF8ArrayToString(buf);
    }
    FS.close(stream);
    return buf;
  },
  writeFile(path, data, opts = {}) {
    opts.flags = opts.flags || 577;
    var stream = FS.open(path, opts.flags, opts.mode);
    if (typeof data == "string") {
      data = new Uint8Array(intArrayFromString(data, true));
    }
    if (ArrayBuffer.isView(data)) {
      FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn);
    } else {
      throw new Error("Unsupported data type");
    }
    FS.close(stream);
  },
  cwd: () => FS.currentPath,
  chdir(path) {
    var lookup = FS.lookupPath(path, {
      follow: true
    });
    if (lookup.node === null) {
      throw new FS.ErrnoError(44);
    }
    if (!FS.isDir(lookup.node.mode)) {
      throw new FS.ErrnoError(54);
    }
    var errCode = FS.nodePermissions(lookup.node, "x");
    if (errCode) {
      throw new FS.ErrnoError(errCode);
    }
    FS.currentPath = lookup.path;
  },
  createDefaultDirectories() {
    FS.mkdir("/tmp");
    FS.mkdir("/home");
    FS.mkdir("/home/web_user");
  },
  createDefaultDevices() {
    // create /dev
    FS.mkdir("/dev");
    // setup /dev/null
    FS.registerDevice(FS.makedev(1, 3), {
      read: () => 0,
      write: (stream, buffer, offset, length, pos) => length,
      llseek: () => 0
    });
    FS.mkdev("/dev/null", FS.makedev(1, 3));
    // setup /dev/tty and /dev/tty1
    // stderr needs to print output using err() rather than out()
    // so we register a second tty just for it.
    TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
    TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
    FS.mkdev("/dev/tty", FS.makedev(5, 0));
    FS.mkdev("/dev/tty1", FS.makedev(6, 0));
    // setup /dev/[u]random
    // use a buffer to avoid overhead of individual crypto calls per byte
    var randomBuffer = new Uint8Array(1024), randomLeft = 0;
    var randomByte = () => {
      if (randomLeft === 0) {
        randomFill(randomBuffer);
        randomLeft = randomBuffer.byteLength;
      }
      return randomBuffer[--randomLeft];
    };
    FS.createDevice("/dev", "random", randomByte);
    FS.createDevice("/dev", "urandom", randomByte);
    // we're not going to emulate the actual shm device,
    // just create the tmp dirs that reside in it commonly
    FS.mkdir("/dev/shm");
    FS.mkdir("/dev/shm/tmp");
  },
  createSpecialDirectories() {
    // create /proc/self/fd which allows /proc/self/fd/6 => readlink gives the
    // name of the stream for fd 6 (see test_unistd_ttyname)
    FS.mkdir("/proc");
    var proc_self = FS.mkdir("/proc/self");
    FS.mkdir("/proc/self/fd");
    FS.mount({
      mount() {
        var node = FS.createNode(proc_self, "fd", 16895, 73);
        node.stream_ops = {
          llseek: MEMFS.stream_ops.llseek
        };
        node.node_ops = {
          lookup(parent, name) {
            var fd = +name;
            var stream = FS.getStreamChecked(fd);
            var ret = {
              parent: null,
              mount: {
                mountpoint: "fake"
              },
              node_ops: {
                readlink: () => stream.path
              },
              id: fd + 1
            };
            ret.parent = ret;
            // make it look like a simple root node
            return ret;
          },
          readdir() {
            return Array.from(FS.streams.entries()).filter(([k, v]) => v).map(([k, v]) => k.toString());
          }
        };
        return node;
      }
    }, {}, "/proc/self/fd");
  },
  createStandardStreams(input, output, error) {
    // TODO deprecate the old functionality of a single
    // input / output callback and that utilizes FS.createDevice
    // and instead require a unique set of stream ops
    // by default, we symlink the standard streams to the
    // default tty devices. however, if the standard streams
    // have been overwritten we create a unique device for
    // them instead.
    if (input) {
      FS.createDevice("/dev", "stdin", input);
    } else {
      FS.symlink("/dev/tty", "/dev/stdin");
    }
    if (output) {
      FS.createDevice("/dev", "stdout", null, output);
    } else {
      FS.symlink("/dev/tty", "/dev/stdout");
    }
    if (error) {
      FS.createDevice("/dev", "stderr", null, error);
    } else {
      FS.symlink("/dev/tty1", "/dev/stderr");
    }
    // open default streams for the stdin, stdout and stderr devices
    var stdin = FS.open("/dev/stdin", 0);
    var stdout = FS.open("/dev/stdout", 1);
    var stderr = FS.open("/dev/stderr", 1);
    assert(stdin.fd === 0, `invalid handle for stdin (${stdin.fd})`);
    assert(stdout.fd === 1, `invalid handle for stdout (${stdout.fd})`);
    assert(stderr.fd === 2, `invalid handle for stderr (${stderr.fd})`);
  },
  staticInit() {
    FS.nameTable = new Array(4096);
    FS.mount(MEMFS, {}, "/");
    FS.createDefaultDirectories();
    FS.createDefaultDevices();
    FS.createSpecialDirectories();
    FS.filesystems = {
      "MEMFS": MEMFS
    };
  },
  init(input, output, error) {
    assert(!FS.initialized, "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");
    FS.initialized = true;
    // Allow Module.stdin etc. to provide defaults, if none explicitly passed to us here
    input ??= Module["stdin"];
    output ??= Module["stdout"];
    error ??= Module["stderr"];
    FS.createStandardStreams(input, output, error);
  },
  quit() {
    FS.initialized = false;
    // force-flush all streams, so we get musl std streams printed out
    _fflush(0);
    // close all of our streams
    for (var stream of FS.streams) {
      if (stream) {
        FS.close(stream);
      }
    }
  },
  findObject(path, dontResolveLastLink) {
    var ret = FS.analyzePath(path, dontResolveLastLink);
    if (!ret.exists) {
      return null;
    }
    return ret.object;
  },
  analyzePath(path, dontResolveLastLink) {
    // operate from within the context of the symlink's target
    try {
      var lookup = FS.lookupPath(path, {
        follow: !dontResolveLastLink
      });
      path = lookup.path;
    } catch (e) {}
    var ret = {
      isRoot: false,
      exists: false,
      error: 0,
      name: null,
      path: null,
      object: null,
      parentExists: false,
      parentPath: null,
      parentObject: null
    };
    try {
      var lookup = FS.lookupPath(path, {
        parent: true
      });
      ret.parentExists = true;
      ret.parentPath = lookup.path;
      ret.parentObject = lookup.node;
      ret.name = PATH.basename(path);
      lookup = FS.lookupPath(path, {
        follow: !dontResolveLastLink
      });
      ret.exists = true;
      ret.path = lookup.path;
      ret.object = lookup.node;
      ret.name = lookup.node.name;
      ret.isRoot = lookup.path === "/";
    } catch (e) {
      ret.error = e.errno;
    }
    return ret;
  },
  createPath(parent, path, canRead, canWrite) {
    parent = typeof parent == "string" ? parent : FS.getPath(parent);
    var parts = path.split("/").reverse();
    while (parts.length) {
      var part = parts.pop();
      if (!part) continue;
      var current = PATH.join2(parent, part);
      try {
        FS.mkdir(current);
      } catch (e) {
        if (e.errno != 20) throw e;
      }
      parent = current;
    }
    return current;
  },
  createFile(parent, name, properties, canRead, canWrite) {
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(canRead, canWrite);
    return FS.create(path, mode);
  },
  createDataFile(parent, name, data, canRead, canWrite, canOwn) {
    var path = name;
    if (parent) {
      parent = typeof parent == "string" ? parent : FS.getPath(parent);
      path = name ? PATH.join2(parent, name) : parent;
    }
    var mode = FS_getMode(canRead, canWrite);
    var node = FS.create(path, mode);
    if (data) {
      if (typeof data == "string") {
        var arr = new Array(data.length);
        for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
        data = arr;
      }
      // make sure we can write to the file
      FS.chmod(node, mode | 146);
      var stream = FS.open(node, 577);
      FS.write(stream, data, 0, data.length, 0, canOwn);
      FS.close(stream);
      FS.chmod(node, mode);
    }
  },
  createDevice(parent, name, input, output) {
    var path = PATH.join2(typeof parent == "string" ? parent : FS.getPath(parent), name);
    var mode = FS_getMode(!!input, !!output);
    FS.createDevice.major ??= 64;
    var dev = FS.makedev(FS.createDevice.major++, 0);
    // Create a fake device that a set of stream ops to emulate
    // the old behavior.
    FS.registerDevice(dev, {
      open(stream) {
        stream.seekable = false;
      },
      close(stream) {
        // flush any pending line data
        if (output?.buffer?.length) {
          output(10);
        }
      },
      read(stream, buffer, offset, length, pos) {
        var bytesRead = 0;
        for (var i = 0; i < length; i++) {
          var result;
          try {
            result = input();
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
          if (result === undefined && bytesRead === 0) {
            throw new FS.ErrnoError(6);
          }
          if (result === null || result === undefined) break;
          bytesRead++;
          buffer[offset + i] = result;
        }
        if (bytesRead) {
          stream.node.atime = Date.now();
        }
        return bytesRead;
      },
      write(stream, buffer, offset, length, pos) {
        for (var i = 0; i < length; i++) {
          try {
            output(buffer[offset + i]);
          } catch (e) {
            throw new FS.ErrnoError(29);
          }
        }
        if (length) {
          stream.node.mtime = stream.node.ctime = Date.now();
        }
        return i;
      }
    });
    return FS.mkdev(path, mode, dev);
  },
  forceLoadFile(obj) {
    if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
    if (typeof XMLHttpRequest != "undefined") {
      throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
    } else {
      // Command-line.
      try {
        obj.contents = readBinary(obj.url);
        obj.usedBytes = obj.contents.length;
      } catch (e) {
        throw new FS.ErrnoError(29);
      }
    }
  },
  createLazyFile(parent, name, url, canRead, canWrite) {
    // Lazy chunked Uint8Array (implements get and length from Uint8Array).
    // Actual getting is abstracted away for eventual reuse.
    class LazyUint8Array {
      lengthKnown=false;
      chunks=[];
      // Loaded chunks. Index is the chunk number
      get(idx) {
        if (idx > this.length - 1 || idx < 0) {
          return undefined;
        }
        var chunkOffset = idx % this.chunkSize;
        var chunkNum = (idx / this.chunkSize) | 0;
        return this.getter(chunkNum)[chunkOffset];
      }
      setDataGetter(getter) {
        this.getter = getter;
      }
      cacheLength() {
        // Find length
        var xhr = new XMLHttpRequest;
        xhr.open("HEAD", url, false);
        xhr.send(null);
        if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
        var datalength = Number(xhr.getResponseHeader("Content-length"));
        var header;
        var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
        var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
        var chunkSize = 1024 * 1024;
        // Chunk size in bytes
        if (!hasByteServing) chunkSize = datalength;
        // Function to get a range from the remote URL.
        var doXHR = (from, to) => {
          if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
          if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
          // TODO: Use mozResponseArrayBuffer, responseStream, etc. if available.
          var xhr = new XMLHttpRequest;
          xhr.open("GET", url, false);
          if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
          // Some hints to the browser that we want binary data.
          xhr.responseType = "arraybuffer";
          if (xhr.overrideMimeType) {
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
          }
          xhr.send(null);
          if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
          if (xhr.response !== undefined) {
            return new Uint8Array(/** @type{Array<number>} */ (xhr.response || []));
          }
          return intArrayFromString(xhr.responseText || "", true);
        };
        var lazyArray = this;
        lazyArray.setDataGetter(chunkNum => {
          var start = chunkNum * chunkSize;
          var end = (chunkNum + 1) * chunkSize - 1;
          // including this byte
          end = Math.min(end, datalength - 1);
          // if datalength-1 is selected, this is the last block
          if (typeof lazyArray.chunks[chunkNum] == "undefined") {
            lazyArray.chunks[chunkNum] = doXHR(start, end);
          }
          if (typeof lazyArray.chunks[chunkNum] == "undefined") throw new Error("doXHR failed!");
          return lazyArray.chunks[chunkNum];
        });
        if (usesGzip || !datalength) {
          // if the server uses gzip or doesn't supply the length, we have to download the whole file to get the (uncompressed) length
          chunkSize = datalength = 1;
          // this will force getter(0)/doXHR do download the whole file
          datalength = this.getter(0).length;
          chunkSize = datalength;
          out("LazyFiles on gzip forces download of the whole file when length is accessed");
        }
        this._length = datalength;
        this._chunkSize = chunkSize;
        this.lengthKnown = true;
      }
      get length() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._length;
      }
      get chunkSize() {
        if (!this.lengthKnown) {
          this.cacheLength();
        }
        return this._chunkSize;
      }
    }
    if (typeof XMLHttpRequest != "undefined") {
      if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
      var lazyArray = new LazyUint8Array;
      var properties = {
        isDevice: false,
        contents: lazyArray
      };
    } else {
      var properties = {
        isDevice: false,
        url
      };
    }
    var node = FS.createFile(parent, name, properties, canRead, canWrite);
    // This is a total hack, but I want to get this lazy file code out of the
    // core of MEMFS. If we want to keep this lazy file concept I feel it should
    // be its own thin LAZYFS proxying calls to MEMFS.
    if (properties.contents) {
      node.contents = properties.contents;
    } else if (properties.url) {
      node.contents = null;
      node.url = properties.url;
    }
    // Add a function that defers querying the file size until it is asked the first time.
    Object.defineProperties(node, {
      usedBytes: {
        get: function() {
          return this.contents.length;
        }
      }
    });
    // override each stream op with one that tries to force load the lazy file first
    var stream_ops = {};
    var keys = Object.keys(node.stream_ops);
    keys.forEach(key => {
      var fn = node.stream_ops[key];
      stream_ops[key] = (...args) => {
        FS.forceLoadFile(node);
        return fn(...args);
      };
    });
    function writeChunks(stream, buffer, offset, length, position) {
      var contents = stream.node.contents;
      if (position >= contents.length) return 0;
      var size = Math.min(contents.length - position, length);
      assert(size >= 0);
      if (contents.slice) {
        // normal array
        for (var i = 0; i < size; i++) {
          buffer[offset + i] = contents[position + i];
        }
      } else {
        for (var i = 0; i < size; i++) {
          // LazyUint8Array from sync binary XHR
          buffer[offset + i] = contents.get(position + i);
        }
      }
      return size;
    }
    // use a custom read function
    stream_ops.read = (stream, buffer, offset, length, position) => {
      FS.forceLoadFile(node);
      return writeChunks(stream, buffer, offset, length, position);
    };
    // use a custom mmap function
    stream_ops.mmap = (stream, length, position, prot, flags) => {
      FS.forceLoadFile(node);
      var ptr = mmapAlloc(length);
      if (!ptr) {
        throw new FS.ErrnoError(48);
      }
      writeChunks(stream, HEAP8, ptr, length, position);
      return {
        ptr,
        allocated: true
      };
    };
    node.stream_ops = stream_ops;
    return node;
  },
  absolutePath() {
    abort("FS.absolutePath has been removed; use PATH_FS.resolve instead");
  },
  createFolder() {
    abort("FS.createFolder has been removed; use FS.mkdir instead");
  },
  createLink() {
    abort("FS.createLink has been removed; use FS.symlink instead");
  },
  joinPath() {
    abort("FS.joinPath has been removed; use PATH.join instead");
  },
  mmapAlloc() {
    abort("FS.mmapAlloc has been replaced by the top level function mmapAlloc");
  },
  standardizePath() {
    abort("FS.standardizePath has been removed; use PATH.normalize instead");
  }
};

var SYSCALLS = {
  DEFAULT_POLLMASK: 5,
  calculateAt(dirfd, path, allowEmpty) {
    if (PATH.isAbs(path)) {
      return path;
    }
    // relative path
    var dir;
    if (dirfd === -100) {
      dir = FS.cwd();
    } else {
      var dirstream = SYSCALLS.getStreamFromFD(dirfd);
      dir = dirstream.path;
    }
    if (path.length == 0) {
      if (!allowEmpty) {
        throw new FS.ErrnoError(44);
      }
      return dir;
    }
    return dir + "/" + path;
  },
  writeStat(buf, stat) {
    HEAP32[((buf) >>> 2) >>> 0] = stat.dev;
    HEAP32[(((buf) + (4)) >>> 2) >>> 0] = stat.mode;
    HEAPU32[(((buf) + (8)) >>> 2) >>> 0] = stat.nlink;
    HEAP32[(((buf) + (12)) >>> 2) >>> 0] = stat.uid;
    HEAP32[(((buf) + (16)) >>> 2) >>> 0] = stat.gid;
    HEAP32[(((buf) + (20)) >>> 2) >>> 0] = stat.rdev;
    HEAP64[(((buf) + (24)) >>> 3) >>> 0] = BigInt(stat.size);
    HEAP32[(((buf) + (32)) >>> 2) >>> 0] = 4096;
    HEAP32[(((buf) + (36)) >>> 2) >>> 0] = stat.blocks;
    var atime = stat.atime.getTime();
    var mtime = stat.mtime.getTime();
    var ctime = stat.ctime.getTime();
    HEAP64[(((buf) + (40)) >>> 3) >>> 0] = BigInt(Math.floor(atime / 1e3));
    HEAPU32[(((buf) + (48)) >>> 2) >>> 0] = (atime % 1e3) * 1e3 * 1e3;
    HEAP64[(((buf) + (56)) >>> 3) >>> 0] = BigInt(Math.floor(mtime / 1e3));
    HEAPU32[(((buf) + (64)) >>> 2) >>> 0] = (mtime % 1e3) * 1e3 * 1e3;
    HEAP64[(((buf) + (72)) >>> 3) >>> 0] = BigInt(Math.floor(ctime / 1e3));
    HEAPU32[(((buf) + (80)) >>> 2) >>> 0] = (ctime % 1e3) * 1e3 * 1e3;
    HEAP64[(((buf) + (88)) >>> 3) >>> 0] = BigInt(stat.ino);
    return 0;
  },
  writeStatFs(buf, stats) {
    HEAP32[(((buf) + (4)) >>> 2) >>> 0] = stats.bsize;
    HEAP32[(((buf) + (40)) >>> 2) >>> 0] = stats.bsize;
    HEAP32[(((buf) + (8)) >>> 2) >>> 0] = stats.blocks;
    HEAP32[(((buf) + (12)) >>> 2) >>> 0] = stats.bfree;
    HEAP32[(((buf) + (16)) >>> 2) >>> 0] = stats.bavail;
    HEAP32[(((buf) + (20)) >>> 2) >>> 0] = stats.files;
    HEAP32[(((buf) + (24)) >>> 2) >>> 0] = stats.ffree;
    HEAP32[(((buf) + (28)) >>> 2) >>> 0] = stats.fsid;
    HEAP32[(((buf) + (44)) >>> 2) >>> 0] = stats.flags;
    // ST_NOSUID
    HEAP32[(((buf) + (36)) >>> 2) >>> 0] = stats.namelen;
  },
  doMsync(addr, stream, len, flags, offset) {
    if (!FS.isFile(stream.node.mode)) {
      throw new FS.ErrnoError(43);
    }
    if (flags & 2) {
      // MAP_PRIVATE calls need not to be synced back to underlying fs
      return 0;
    }
    var buffer = HEAPU8.slice(addr, addr + len);
    FS.msync(stream, buffer, offset, len, flags);
  },
  getStreamFromFD(fd) {
    var stream = FS.getStreamChecked(fd);
    return stream;
  },
  varargs: undefined,
  getStr(ptr) {
    var ret = UTF8ToString(ptr);
    return ret;
  }
};

function ___syscall_fcntl64(fd, cmd, varargs) {
  varargs >>>= 0;
  SYSCALLS.varargs = varargs;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (cmd) {
     case 0:
      {
        var arg = syscallGetVarargI();
        if (arg < 0) {
          return -28;
        }
        while (FS.streams[arg]) {
          arg++;
        }
        var newStream;
        newStream = FS.dupStream(stream, arg);
        return newStream.fd;
      }

     case 1:
     case 2:
      return 0;

     // FD_CLOEXEC makes no sense for a single process.
      case 3:
      return stream.flags;

     case 4:
      {
        var arg = syscallGetVarargI();
        stream.flags |= arg;
        return 0;
      }

     case 12:
      {
        var arg = syscallGetVarargP();
        var offset = 0;
        // We're always unlocked.
        HEAP16[(((arg) + (offset)) >>> 1) >>> 0] = 2;
        return 0;
      }

     case 13:
     case 14:
      // Pretend that the locking is successful. These are process-level locks,
      // and Emscripten programs are a single process. If we supported linking a
      // filesystem between programs, we'd need to do more here.
      // See https://github.com/emscripten-core/emscripten/issues/23697
      return 0;
    }
    return -28;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return -e.errno;
  }
}

function ___syscall_ioctl(fd, op, varargs) {
  varargs >>>= 0;
  SYSCALLS.varargs = varargs;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    switch (op) {
     case 21509:
      {
        if (!stream.tty) return -59;
        return 0;
      }

     case 21505:
      {
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tcgets) {
          var termios = stream.tty.ops.ioctl_tcgets(stream);
          var argp = syscallGetVarargP();
          HEAP32[((argp) >>> 2) >>> 0] = termios.c_iflag || 0;
          HEAP32[(((argp) + (4)) >>> 2) >>> 0] = termios.c_oflag || 0;
          HEAP32[(((argp) + (8)) >>> 2) >>> 0] = termios.c_cflag || 0;
          HEAP32[(((argp) + (12)) >>> 2) >>> 0] = termios.c_lflag || 0;
          for (var i = 0; i < 32; i++) {
            HEAP8[(argp + i) + (17) >>> 0] = termios.c_cc[i] || 0;
          }
          return 0;
        }
        return 0;
      }

     case 21510:
     case 21511:
     case 21512:
      {
        if (!stream.tty) return -59;
        return 0;
      }

     case 21506:
     case 21507:
     case 21508:
      {
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tcsets) {
          var argp = syscallGetVarargP();
          var c_iflag = HEAP32[((argp) >>> 2) >>> 0];
          var c_oflag = HEAP32[(((argp) + (4)) >>> 2) >>> 0];
          var c_cflag = HEAP32[(((argp) + (8)) >>> 2) >>> 0];
          var c_lflag = HEAP32[(((argp) + (12)) >>> 2) >>> 0];
          var c_cc = [];
          for (var i = 0; i < 32; i++) {
            c_cc.push(HEAP8[(argp + i) + (17) >>> 0]);
          }
          return stream.tty.ops.ioctl_tcsets(stream.tty, op, {
            c_iflag,
            c_oflag,
            c_cflag,
            c_lflag,
            c_cc
          });
        }
        return 0;
      }

     case 21519:
      {
        if (!stream.tty) return -59;
        var argp = syscallGetVarargP();
        HEAP32[((argp) >>> 2) >>> 0] = 0;
        return 0;
      }

     case 21520:
      {
        if (!stream.tty) return -59;
        return -28;
      }

     case 21531:
      {
        var argp = syscallGetVarargP();
        return FS.ioctl(stream, op, argp);
      }

     case 21523:
      {
        // TODO: in theory we should write to the winsize struct that gets
        // passed in, but for now musl doesn't read anything on it
        if (!stream.tty) return -59;
        if (stream.tty.ops.ioctl_tiocgwinsz) {
          var winsize = stream.tty.ops.ioctl_tiocgwinsz(stream.tty);
          var argp = syscallGetVarargP();
          HEAP16[((argp) >>> 1) >>> 0] = winsize[0];
          HEAP16[(((argp) + (2)) >>> 1) >>> 0] = winsize[1];
        }
        return 0;
      }

     case 21524:
      {
        // TODO: technically, this ioctl call should change the window size.
        // but, since emscripten doesn't have any concept of a terminal window
        // yet, we'll just silently throw it away as we do TIOCGWINSZ
        if (!stream.tty) return -59;
        return 0;
      }

     case 21515:
      {
        if (!stream.tty) return -59;
        return 0;
      }

     default:
      return -28;
    }
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return -e.errno;
  }
}

function ___syscall_openat(dirfd, path, flags, varargs) {
  path >>>= 0;
  varargs >>>= 0;
  SYSCALLS.varargs = varargs;
  try {
    path = SYSCALLS.getStr(path);
    path = SYSCALLS.calculateAt(dirfd, path);
    var mode = varargs ? syscallGetVarargI() : 0;
    return FS.open(path, flags, mode).fd;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return -e.errno;
  }
}

var __abort_js = () => abort("native code called abort()");

function __emscripten_fs_load_embedded_files(ptr) {
  ptr >>>= 0;
  do {
    var name_addr = HEAPU32[((ptr) >>> 2) >>> 0];
    ptr += 4;
    var len = HEAPU32[((ptr) >>> 2) >>> 0];
    ptr += 4;
    var content = HEAPU32[((ptr) >>> 2) >>> 0];
    ptr += 4;
    var name = UTF8ToString(name_addr);
    FS.createPath("/", PATH.dirname(name), true, true);
    // canOwn this data in the filesystem, it is a slice of wasm memory that will never change
    FS.createDataFile(name, null, HEAP8.subarray(content >>> 0, content + len >>> 0), true, true, true);
  } while (HEAPU32[((ptr) >>> 2) >>> 0]);
}

var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
  assert(typeof maxBytesToWrite == "number", "stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!");
  return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
};

var __tzset_js = function(timezone, daylight, std_name, dst_name) {
  timezone >>>= 0;
  daylight >>>= 0;
  std_name >>>= 0;
  dst_name >>>= 0;
  // TODO: Use (malleable) environment variables instead of system settings.
  var currentYear = (new Date).getFullYear();
  var winter = new Date(currentYear, 0, 1);
  var summer = new Date(currentYear, 6, 1);
  var winterOffset = winter.getTimezoneOffset();
  var summerOffset = summer.getTimezoneOffset();
  // Local standard timezone offset. Local standard time is not adjusted for
  // daylight savings.  This code uses the fact that getTimezoneOffset returns
  // a greater value during Standard Time versus Daylight Saving Time (DST).
  // Thus it determines the expected output during Standard Time, and it
  // compares whether the output of the given date the same (Standard) or less
  // (DST).
  var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
  // timezone is specified as seconds west of UTC ("The external variable
  // `timezone` shall be set to the difference, in seconds, between
  // Coordinated Universal Time (UTC) and local standard time."), the same
  // as returned by stdTimezoneOffset.
  // See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
  HEAPU32[((timezone) >>> 2) >>> 0] = stdTimezoneOffset * 60;
  HEAP32[((daylight) >>> 2) >>> 0] = Number(winterOffset != summerOffset);
  var extractZone = timezoneOffset => {
    // Why inverse sign?
    // Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
    var sign = timezoneOffset >= 0 ? "-" : "+";
    var absOffset = Math.abs(timezoneOffset);
    var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
    var minutes = String(absOffset % 60).padStart(2, "0");
    return `UTC${sign}${hours}${minutes}`;
  };
  var winterName = extractZone(winterOffset);
  var summerName = extractZone(summerOffset);
  assert(winterName);
  assert(summerName);
  assert(lengthBytesUTF8(winterName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${winterName})`);
  assert(lengthBytesUTF8(summerName) <= 16, `timezone name truncated to fit in TZNAME_MAX (${summerName})`);
  if (summerOffset < winterOffset) {
    // Northern hemisphere
    stringToUTF8(winterName, std_name, 17);
    stringToUTF8(summerName, dst_name, 17);
  } else {
    stringToUTF8(winterName, dst_name, 17);
    stringToUTF8(summerName, std_name, 17);
  }
};

var _emscripten_get_now = () => performance.now();

var _emscripten_date_now = () => Date.now();

var nowIsMonotonic = 1;

var checkWasiClock = clock_id => clock_id >= 0 && clock_id <= 3;

function _clock_time_get(clk_id, ignored_precision, ptime) {
  ignored_precision = bigintToI53Checked(ignored_precision);
  ptime >>>= 0;
  if (!checkWasiClock(clk_id)) {
    return 28;
  }
  var now;
  // all wasi clocks but realtime are monotonic
  if (clk_id === 0) {
    now = _emscripten_date_now();
  } else if (nowIsMonotonic) {
    now = _emscripten_get_now();
  } else {
    return 52;
  }
  // "now" is in ms, and wasi times are in ns.
  var nsec = Math.round(now * 1e3 * 1e3);
  HEAP64[((ptime) >>> 3) >>> 0] = BigInt(nsec);
  return 0;
}

var readEmAsmArgsArray = [];

var readEmAsmArgs = (sigPtr, buf) => {
  // Nobody should have mutated _readEmAsmArgsArray underneath us to be something else than an array.
  assert(Array.isArray(readEmAsmArgsArray));
  // The input buffer is allocated on the stack, so it must be stack-aligned.
  assert(buf % 16 == 0);
  readEmAsmArgsArray.length = 0;
  var ch;
  // Most arguments are i32s, so shift the buffer pointer so it is a plain
  // index into HEAP32.
  while (ch = HEAPU8[sigPtr++ >>> 0]) {
    var chr = String.fromCharCode(ch);
    var validChars = [ "d", "f", "i", "p" ];
    // In WASM_BIGINT mode we support passing i64 values as bigint.
    validChars.push("j");
    assert(validChars.includes(chr), `Invalid character ${ch}("${chr}") in readEmAsmArgs! Use only [${validChars}], and do not specify "v" for void return argument.`);
    // Floats are always passed as doubles, so all types except for 'i'
    // are 8 bytes and require alignment.
    var wide = (ch != 105);
    wide &= (ch != 112);
    buf += wide && (buf % 8) ? 4 : 0;
    readEmAsmArgsArray.push(// Special case for pointers under wasm64 or CAN_ADDRESS_2GB mode.
    ch == 112 ? HEAPU32[((buf) >>> 2) >>> 0] : ch == 106 ? HEAP64[((buf) >>> 3) >>> 0] : ch == 105 ? HEAP32[((buf) >>> 2) >>> 0] : HEAPF64[((buf) >>> 3) >>> 0]);
    buf += wide ? 8 : 4;
  }
  return readEmAsmArgsArray;
};

var runEmAsmFunction = (code, sigPtr, argbuf) => {
  var args = readEmAsmArgs(sigPtr, argbuf);
  assert(ASM_CONSTS.hasOwnProperty(code), `No EM_ASM constant found at address ${code}.  The loaded WebAssembly file is likely out of sync with the generated JavaScript.`);
  return ASM_CONSTS[code](...args);
};

function _emscripten_asm_const_double(code, sigPtr, argbuf) {
  code >>>= 0;
  sigPtr >>>= 0;
  argbuf >>>= 0;
  return runEmAsmFunction(code, sigPtr, argbuf);
}

function _emscripten_asm_const_int(code, sigPtr, argbuf) {
  code >>>= 0;
  sigPtr >>>= 0;
  argbuf >>>= 0;
  return runEmAsmFunction(code, sigPtr, argbuf);
}

var onExits = [];

var addOnExit = cb => onExits.push(cb);

var JSEvents = {
  memcpy(target, src, size) {
    HEAP8.set(HEAP8.subarray(src >>> 0, src + size >>> 0), target >>> 0);
  },
  removeAllEventListeners() {
    while (JSEvents.eventHandlers.length) {
      JSEvents._removeHandler(JSEvents.eventHandlers.length - 1);
    }
    JSEvents.deferredCalls = [];
  },
  inEventHandler: 0,
  deferredCalls: [],
  deferCall(targetFunction, precedence, argsList) {
    function arraysHaveEqualContent(arrA, arrB) {
      if (arrA.length != arrB.length) return false;
      for (var i in arrA) {
        if (arrA[i] != arrB[i]) return false;
      }
      return true;
    }
    // Test if the given call was already queued, and if so, don't add it again.
    for (var call of JSEvents.deferredCalls) {
      if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
        return;
      }
    }
    JSEvents.deferredCalls.push({
      targetFunction,
      precedence,
      argsList
    });
    JSEvents.deferredCalls.sort((x, y) => x.precedence < y.precedence);
  },
  removeDeferredCalls(targetFunction) {
    JSEvents.deferredCalls = JSEvents.deferredCalls.filter(call => call.targetFunction != targetFunction);
  },
  canPerformEventHandlerRequests() {
    if (navigator.userActivation) {
      // Verify against transient activation status from UserActivation API
      // whether it is possible to perform a request here without needing to defer. See
      // https://developer.mozilla.org/en-US/docs/Web/Security/User_activation#transient_activation
      // and https://caniuse.com/mdn-api_useractivation
      // At the time of writing, Firefox does not support this API: https://bugzilla.mozilla.org/show_bug.cgi?id=1791079
      return navigator.userActivation.isActive;
    }
    return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
  },
  runDeferredCalls() {
    if (!JSEvents.canPerformEventHandlerRequests()) {
      return;
    }
    var deferredCalls = JSEvents.deferredCalls;
    JSEvents.deferredCalls = [];
    for (var call of deferredCalls) {
      call.targetFunction(...call.argsList);
    }
  },
  eventHandlers: [],
  removeAllHandlersOnTarget: (target, eventTypeString) => {
    for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
      if (JSEvents.eventHandlers[i].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
        JSEvents._removeHandler(i--);
      }
    }
  },
  _removeHandler(i) {
    var h = JSEvents.eventHandlers[i];
    h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
    JSEvents.eventHandlers.splice(i, 1);
  },
  registerOrRemoveHandler(eventHandler) {
    if (!eventHandler.target) {
      err("registerOrRemoveHandler: the target element for event handler registration does not exist, when processing the following event handler registration:");
      console.dir(eventHandler);
      return -4;
    }
    if (eventHandler.callbackfunc) {
      eventHandler.eventListenerFunc = function(event) {
        // Increment nesting count for the event handler.
        ++JSEvents.inEventHandler;
        JSEvents.currentEventHandler = eventHandler;
        // Process any old deferred calls the user has placed.
        JSEvents.runDeferredCalls();
        // Process the actual event, calls back to user C code handler.
        eventHandler.handlerFunc(event);
        // Process any new deferred calls that were placed right now from this event handler.
        JSEvents.runDeferredCalls();
        // Out of event handler - restore nesting count.
        --JSEvents.inEventHandler;
      };
      eventHandler.target.addEventListener(eventHandler.eventTypeString, eventHandler.eventListenerFunc, eventHandler.useCapture);
      JSEvents.eventHandlers.push(eventHandler);
    } else {
      for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
        if (JSEvents.eventHandlers[i].target == eventHandler.target && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
          JSEvents._removeHandler(i--);
        }
      }
    }
    return 0;
  },
  getNodeNameForTarget(target) {
    if (!target) return "";
    if (target == window) return "#window";
    if (target == screen) return "#screen";
    return target?.nodeName || "";
  },
  fullscreenEnabled() {
    return document.fullscreenEnabled || document.webkitFullscreenEnabled;
  }
};

var requestPointerLock = target => {
  if (target.requestPointerLock) {
    target.requestPointerLock();
  } else {
    // document.body is known to accept pointer lock, so use that to differentiate if the user passed a bad element,
    // or if the whole browser just doesn't support the feature.
    if (document.body.requestPointerLock) {
      return -3;
    }
    return -1;
  }
  return 0;
};

var _emscripten_exit_pointerlock = () => {
  // Make sure no queued up calls will fire after this.
  JSEvents.removeDeferredCalls(requestPointerLock);
  if (!document.exitPointerLock) return -1;
  document.exitPointerLock();
  return 0;
};

var runtimeKeepaliveCounter = 0;

var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;

var _proc_exit = code => {
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    Module["onExit"]?.(code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
};

/** @suppress {duplicate } */ /** @param {boolean|number=} implicit */ var exitJS = (status, implicit) => {
  EXITSTATUS = status;
  checkUnflushedContent();
  // if exit() was called explicitly, warn the user if the runtime isn't actually being shut down
  if (keepRuntimeAlive() && !implicit) {
    var msg = `program exited (with status: ${status}), but keepRuntimeAlive() is set (counter=${runtimeKeepaliveCounter}) due to an async operation, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)`;
    readyPromiseReject?.(msg);
    err(msg);
  }
  _proc_exit(status);
};

var _exit = exitJS;

var __emscripten_runtime_keepalive_clear = () => {
  noExitRuntime = false;
  runtimeKeepaliveCounter = 0;
};

var _emscripten_force_exit = status => {
  warnOnce("emscripten_force_exit cannot actually shut down the runtime, as the build does not have EXIT_RUNTIME set");
  __emscripten_runtime_keepalive_clear();
  _exit(status);
};

var _emscripten_get_device_pixel_ratio = () => (typeof devicePixelRatio == "number" && devicePixelRatio) || 1;

var maybeCStringToJsString = cString => cString > 2 ? UTF8ToString(cString) : cString;

/** @type {Object} */ var specialHTMLTargets = [ 0, typeof document != "undefined" ? document : 0, typeof window != "undefined" ? window : 0 ];

var findEventTarget = target => {
  target = maybeCStringToJsString(target);
  var domElement = specialHTMLTargets[target] || (typeof document != "undefined" ? document.querySelector(target) : null);
  return domElement;
};

var getBoundingClientRect = e => specialHTMLTargets.indexOf(e) < 0 ? e.getBoundingClientRect() : {
  "left": 0,
  "top": 0
};

function _emscripten_get_element_css_size(target, width, height) {
  target >>>= 0;
  width >>>= 0;
  height >>>= 0;
  target = findEventTarget(target);
  if (!target) return -4;
  var rect = getBoundingClientRect(target);
  HEAPF64[((width) >>> 3) >>> 0] = rect.width;
  HEAPF64[((height) >>> 3) >>> 0] = rect.height;
  return 0;
}

var _emscripten_has_asyncify = () => 0;

function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
  target >>>= 0;
  target = findEventTarget(target);
  if (!target) return -4;
  if (!target.requestPointerLock) {
    return -1;
  }
  // Queue this function call if we're not currently in an event handler and
  // the user saw it appropriate to do so.
  if (!JSEvents.canPerformEventHandlerRequests()) {
    if (deferUntilInEventHandler) {
      JSEvents.deferCall(requestPointerLock, 2, [ target ]);
      return 1;
    }
    return -2;
  }
  return requestPointerLock(target);
}

var getHeapMax = () => // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
// full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
// for any code that deals with heap sizes, which would require special
// casing all heap size related code to treat 0 specially.
4294901760;

var alignMemory = (size, alignment) => {
  assert(alignment, "alignment argument is required");
  return Math.ceil(size / alignment) * alignment;
};

var growMemory = size => {
  var b = wasmMemory.buffer;
  var pages = ((size - b.byteLength + 65535) / 65536) | 0;
  try {
    // round size grow request up to wasm page size (fixed 64KB per spec)
    wasmMemory.grow(pages);
    // .grow() takes a delta compared to the previous size
    updateMemoryViews();
    return 1;
  } catch (e) {
    err(`growMemory: Attempted to grow heap from ${b.byteLength} bytes to ${size} bytes, but got error: ${e}`);
  }
};

function _emscripten_resize_heap(requestedSize) {
  requestedSize >>>= 0;
  var oldSize = HEAPU8.length;
  // With multithreaded builds, races can happen (another thread might increase the size
  // in between), so return a failure, and let the caller retry.
  assert(requestedSize > oldSize);
  // Memory resize rules:
  // 1.  Always increase heap size to at least the requested size, rounded up
  //     to next page multiple.
  // 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
  //     geometrically: increase the heap size according to
  //     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
  //     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
  // 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
  //     linearly: increase the heap size by at least
  //     MEMORY_GROWTH_LINEAR_STEP bytes.
  // 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
  //     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
  // 4.  If we were unable to allocate as much memory, it may be due to
  //     over-eager decision to excessively reserve due to (3) above.
  //     Hence if an allocation fails, cut down on the amount of excess
  //     growth, in an attempt to succeed to perform a smaller allocation.
  // A limit is set for how much we can grow. We should not exceed that
  // (the wasm binary specifies it, so if we tried, we'd fail anyhow).
  var maxHeapSize = getHeapMax();
  if (requestedSize > maxHeapSize) {
    err(`Cannot enlarge memory, requested ${requestedSize} bytes, but the limit is ${maxHeapSize} bytes!`);
    return false;
  }
  // Loop through potential heap size increases. If we attempt a too eager
  // reservation that fails, cut down on the attempted size and reserve a
  // smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
    // ensure geometric growth
    // but limit overreserving (default to capping at +96MB overgrowth at most)
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
    var replacement = growMemory(newSize);
    if (replacement) {
      return true;
    }
  }
  err(`Failed to grow the heap from ${oldSize} bytes to ${newSize} bytes, not enough memory!`);
  return false;
}

var wasmTableMirror = [];

/** @type {WebAssembly.Table} */ var wasmTable;

var getWasmTableEntry = funcPtr => {
  var func = wasmTableMirror[funcPtr];
  if (!func) {
    /** @suppress {checkTypes} */ wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr);
  }
  /** @suppress {checkTypes} */ assert(wasmTable.get(funcPtr) == func, "JavaScript-side Wasm function table mirror is out of date!");
  return func;
};

var registerKeyEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  JSEvents.keyEvent ||= _malloc(160);
  var keyEventHandlerFunc = e => {
    assert(e);
    var keyEventData = JSEvents.keyEvent;
    HEAPF64[((keyEventData) >>> 3) >>> 0] = e.timeStamp;
    var idx = ((keyEventData) >>> 2);
    HEAP32[idx + 2 >>> 0] = e.location;
    HEAP8[keyEventData + 12 >>> 0] = e.ctrlKey;
    HEAP8[keyEventData + 13 >>> 0] = e.shiftKey;
    HEAP8[keyEventData + 14 >>> 0] = e.altKey;
    HEAP8[keyEventData + 15 >>> 0] = e.metaKey;
    HEAP8[keyEventData + 16 >>> 0] = e.repeat;
    HEAP32[idx + 5 >>> 0] = e.charCode;
    HEAP32[idx + 6 >>> 0] = e.keyCode;
    HEAP32[idx + 7 >>> 0] = e.which;
    stringToUTF8(e.key || "", keyEventData + 32, 32);
    stringToUTF8(e.code || "", keyEventData + 64, 32);
    stringToUTF8(e.char || "", keyEventData + 96, 32);
    stringToUTF8(e.locale || "", keyEventData + 128, 32);
    if (getWasmTableEntry(callbackfunc)(eventTypeId, keyEventData, userData)) e.preventDefault();
  };
  var eventHandler = {
    target: findEventTarget(target),
    eventTypeString,
    callbackfunc,
    handlerFunc: keyEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

function _emscripten_set_keydown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  return registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown", targetThread);
}

function _emscripten_set_keyup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  return registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup", targetThread);
}

var fillMouseEventData = (eventStruct, e, target) => {
  assert(eventStruct % 4 == 0);
  HEAPF64[((eventStruct) >>> 3) >>> 0] = e.timeStamp;
  var idx = ((eventStruct) >>> 2);
  HEAP32[idx + 2 >>> 0] = e.screenX;
  HEAP32[idx + 3 >>> 0] = e.screenY;
  HEAP32[idx + 4 >>> 0] = e.clientX;
  HEAP32[idx + 5 >>> 0] = e.clientY;
  HEAP8[eventStruct + 24 >>> 0] = e.ctrlKey;
  HEAP8[eventStruct + 25 >>> 0] = e.shiftKey;
  HEAP8[eventStruct + 26 >>> 0] = e.altKey;
  HEAP8[eventStruct + 27 >>> 0] = e.metaKey;
  HEAP16[idx * 2 + 14 >>> 0] = e.button;
  HEAP16[idx * 2 + 15 >>> 0] = e.buttons;
  HEAP32[idx + 8 >>> 0] = e["movementX"];
  HEAP32[idx + 9 >>> 0] = e["movementY"];
  // Note: rect contains doubles (truncated to placate SAFE_HEAP, which is the same behaviour when writing to HEAP32 anyway)
  var rect = getBoundingClientRect(target);
  HEAP32[idx + 10 >>> 0] = e.clientX - (rect.left | 0);
  HEAP32[idx + 11 >>> 0] = e.clientY - (rect.top | 0);
};

var registerMouseEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  JSEvents.mouseEvent ||= _malloc(64);
  target = findEventTarget(target);
  var mouseEventHandlerFunc = (e = event) => {
    // TODO: Make this access thread safe, or this could update live while app is reading it.
    fillMouseEventData(JSEvents.mouseEvent, e, target);
    if (getWasmTableEntry(callbackfunc)(eventTypeId, JSEvents.mouseEvent, userData)) e.preventDefault();
  };
  var eventHandler = {
    target,
    allowsDeferredCalls: eventTypeString != "mousemove" && eventTypeString != "mouseenter" && eventTypeString != "mouseleave",
    // Mouse move events do not allow fullscreen/pointer lock requests to be handled in them!
    eventTypeString,
    callbackfunc,
    handlerFunc: mouseEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

function _emscripten_set_mousedown_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  return registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown", targetThread);
}

function _emscripten_set_mousemove_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  return registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove", targetThread);
}

function _emscripten_set_mouseup_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  return registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup", targetThread);
}

var fillPointerlockChangeEventData = eventStruct => {
  var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
  var isPointerlocked = !!pointerLockElement;
  // Assigning a boolean to HEAP32 with expected type coercion.
  /** @suppress{checkTypes} */ HEAP8[eventStruct >>> 0] = isPointerlocked;
  var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
  var id = pointerLockElement?.id || "";
  stringToUTF8(nodeName, eventStruct + 1, 128);
  stringToUTF8(id, eventStruct + 129, 128);
};

var registerPointerlockChangeEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  JSEvents.pointerlockChangeEvent ||= _malloc(257);
  var pointerlockChangeEventHandlerFunc = (e = event) => {
    var pointerlockChangeEvent = JSEvents.pointerlockChangeEvent;
    fillPointerlockChangeEventData(pointerlockChangeEvent);
    if (getWasmTableEntry(callbackfunc)(eventTypeId, pointerlockChangeEvent, userData)) e.preventDefault();
  };
  var eventHandler = {
    target,
    eventTypeString,
    callbackfunc,
    handlerFunc: pointerlockChangeEventHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

/** @suppress {missingProperties} */ function _emscripten_set_pointerlockchange_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  // TODO: Currently not supported in pthreads or in --proxy-to-worker mode. (In pthreads mode, document object is not defined)
  if (!document || !document.body || (!document.body.requestPointerLock && !document.body.mozRequestPointerLock && !document.body.webkitRequestPointerLock && !document.body.msRequestPointerLock)) {
    return -1;
  }
  target = findEventTarget(target);
  if (!target) return -4;
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mozpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "webkitpointerlockchange", targetThread);
  registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "mspointerlockchange", targetThread);
  return registerPointerlockChangeEventCallback(target, userData, useCapture, callbackfunc, 20, "pointerlockchange", targetThread);
}

var registerWheelEventCallback = (target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString, targetThread) => {
  JSEvents.wheelEvent ||= _malloc(96);
  // The DOM Level 3 events spec event 'wheel'
  var wheelHandlerFunc = (e = event) => {
    var wheelEvent = JSEvents.wheelEvent;
    fillMouseEventData(wheelEvent, e, target);
    HEAPF64[(((wheelEvent) + (64)) >>> 3) >>> 0] = e["deltaX"];
    HEAPF64[(((wheelEvent) + (72)) >>> 3) >>> 0] = e["deltaY"];
    HEAPF64[(((wheelEvent) + (80)) >>> 3) >>> 0] = e["deltaZ"];
    HEAP32[(((wheelEvent) + (88)) >>> 2) >>> 0] = e["deltaMode"];
    if (getWasmTableEntry(callbackfunc)(eventTypeId, wheelEvent, userData)) e.preventDefault();
  };
  var eventHandler = {
    target,
    allowsDeferredCalls: true,
    eventTypeString,
    callbackfunc,
    handlerFunc: wheelHandlerFunc,
    useCapture
  };
  return JSEvents.registerOrRemoveHandler(eventHandler);
};

function _emscripten_set_wheel_callback_on_thread(target, userData, useCapture, callbackfunc, targetThread) {
  target >>>= 0;
  userData >>>= 0;
  callbackfunc >>>= 0;
  targetThread >>>= 0;
  target = findEventTarget(target);
  if (!target) return -4;
  if (typeof target.onwheel != "undefined") {
    return registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel", targetThread);
  } else {
    return -1;
  }
}

var stackAlloc = sz => __emscripten_stack_alloc(sz);

var stringToUTF8OnStack = str => {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8(str, ret, size);
  return ret;
};

var stringToNewUTF8 = str => {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8(str, ret, size);
  return ret;
};

var WebGPU = {
  Internals: {
    jsObjects: [],
    jsObjectInsert: (ptr, jsObject) => {
      WebGPU.Internals.jsObjects[ptr] = jsObject;
    },
    bufferOnUnmaps: [],
    futures: [],
    futureInsert: (futureId, promise) => {}
  },
  getJsObject: ptr => {
    if (!ptr) return undefined;
    assert(ptr in WebGPU.Internals.jsObjects);
    return WebGPU.Internals.jsObjects[ptr];
  },
  importJsAdapter: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateAdapter(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsBindGroup: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateBindGroup(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsBindGroupLayout: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateBindGroupLayout(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsBuffer: (buffer, parentPtr = 0) => {
    // At the moment, we do not allow importing pending buffers.
    assert(buffer.mapState != "pending");
    var mapState = buffer.mapState == "mapped" ? 3 : 1;
    var bufferPtr = _emwgpuCreateBuffer(parentPtr, mapState);
    WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);
    if (buffer.mapState == "mapped") {
      WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];
    }
    return bufferPtr;
  },
  importJsCommandBuffer: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateCommandBuffer(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsCommandEncoder: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateCommandEncoder(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsComputePassEncoder: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateComputePassEncoder(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsComputePipeline: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateComputePipeline(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsDevice: (device, parentPtr = 0) => {
    var queuePtr = _emwgpuCreateQueue(parentPtr);
    var devicePtr = _emwgpuCreateDevice(parentPtr, queuePtr);
    WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);
    WebGPU.Internals.jsObjectInsert(devicePtr, device);
    return devicePtr;
  },
  importJsPipelineLayout: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreatePipelineLayout(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsQuerySet: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateQuerySet(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsQueue: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateQueue(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsRenderBundle: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateRenderBundle(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsRenderBundleEncoder: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateRenderBundleEncoder(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsRenderPassEncoder: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateRenderPassEncoder(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsRenderPipeline: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateRenderPipeline(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsSampler: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateSampler(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsShaderModule: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateShaderModule(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsSurface: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateSurface(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsTexture: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateTexture(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  importJsTextureView: (obj, parentPtr = 0) => {
    var ptr = _emwgpuCreateTextureView(parentPtr);
    WebGPU.Internals.jsObjects[ptr] = obj;
    return ptr;
  },
  errorCallback: (callback, type, message, userdata) => {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack(message);
    getWasmTableEntry(callback)(type, messagePtr, userdata);
    stackRestore(sp);
  },
  setStringView: (ptr, data, length) => {
    HEAPU32[((ptr) >>> 2) >>> 0] = data;
    HEAPU32[(((ptr) + (4)) >>> 2) >>> 0] = length;
  },
  makeStringFromStringView: stringViewPtr => {
    var ptr = HEAPU32[((stringViewPtr) >>> 2) >>> 0];
    var length = HEAPU32[(((stringViewPtr) + (4)) >>> 2) >>> 0];
    // UTF8ToString stops at the first null terminator character in the
    // string regardless of the length.
    return UTF8ToString(ptr, length);
  },
  makeStringFromOptionalStringView: stringViewPtr => {
    var ptr = HEAPU32[((stringViewPtr) >>> 2) >>> 0];
    var length = HEAPU32[(((stringViewPtr) + (4)) >>> 2) >>> 0];
    // If we don't have a valid string pointer, just return undefined when
    // optional.
    if (!ptr) {
      if (length === 0) {
        return "";
      }
      return undefined;
    }
    // UTF8ToString stops at the first null terminator character in the
    // string regardless of the length.
    return UTF8ToString(ptr, length);
  },
  makeColor: ptr => ({
    "r": HEAPF64[((ptr) >>> 3) >>> 0],
    "g": HEAPF64[(((ptr) + (8)) >>> 3) >>> 0],
    "b": HEAPF64[(((ptr) + (16)) >>> 3) >>> 0],
    "a": HEAPF64[(((ptr) + (24)) >>> 3) >>> 0]
  }),
  makeExtent3D: ptr => ({
    "width": HEAPU32[((ptr) >>> 2) >>> 0],
    "height": HEAPU32[(((ptr) + (4)) >>> 2) >>> 0],
    "depthOrArrayLayers": HEAPU32[(((ptr) + (8)) >>> 2) >>> 0]
  }),
  makeOrigin3D: ptr => ({
    "x": HEAPU32[((ptr) >>> 2) >>> 0],
    "y": HEAPU32[(((ptr) + (4)) >>> 2) >>> 0],
    "z": HEAPU32[(((ptr) + (8)) >>> 2) >>> 0]
  }),
  makeTexelCopyTextureInfo: ptr => {
    assert(ptr);
    return {
      "texture": WebGPU.getJsObject(HEAPU32[((ptr) >>> 2) >>> 0]),
      "mipLevel": HEAPU32[(((ptr) + (4)) >>> 2) >>> 0],
      "origin": WebGPU.makeOrigin3D(ptr + 8),
      "aspect": WebGPU.TextureAspect[HEAPU32[(((ptr) + (20)) >>> 2) >>> 0]]
    };
  },
  makeTexelCopyBufferLayout: ptr => {
    var bytesPerRow = HEAPU32[(((ptr) + (8)) >>> 2) >>> 0];
    var rowsPerImage = HEAPU32[(((ptr) + (12)) >>> 2) >>> 0];
    return {
      "offset": (HEAPU32[(((ptr + 4)) >>> 2) >>> 0] * 4294967296 + HEAPU32[((ptr) >>> 2) >>> 0]),
      "bytesPerRow": bytesPerRow === 4294967295 ? undefined : bytesPerRow,
      "rowsPerImage": rowsPerImage === 4294967295 ? undefined : rowsPerImage
    };
  },
  makeTexelCopyBufferInfo: ptr => {
    assert(ptr);
    var layoutPtr = ptr + 0;
    var bufferCopyView = WebGPU.makeTexelCopyBufferLayout(layoutPtr);
    bufferCopyView["buffer"] = WebGPU.getJsObject(HEAPU32[(((ptr) + (16)) >>> 2) >>> 0]);
    return bufferCopyView;
  },
  makePassTimestampWrites: ptr => {
    if (ptr === 0) return undefined;
    return {
      "querySet": WebGPU.getJsObject(HEAPU32[(((ptr) + (4)) >>> 2) >>> 0]),
      "beginningOfPassWriteIndex": HEAPU32[(((ptr) + (8)) >>> 2) >>> 0],
      "endOfPassWriteIndex": HEAPU32[(((ptr) + (12)) >>> 2) >>> 0]
    };
  },
  makePipelineConstants: (constantCount, constantsPtr) => {
    if (!constantCount) return;
    var constants = {};
    for (var i = 0; i < constantCount; ++i) {
      var entryPtr = constantsPtr + 24 * i;
      var key = WebGPU.makeStringFromStringView(entryPtr + 4);
      constants[key] = HEAPF64[(((entryPtr) + (16)) >>> 3) >>> 0];
    }
    return constants;
  },
  makePipelineLayout: layoutPtr => {
    if (!layoutPtr) return "auto";
    return WebGPU.getJsObject(layoutPtr);
  },
  makeComputeState: ptr => {
    if (!ptr) return undefined;
    assert(ptr);
    assert(HEAPU32[((ptr) >>> 2) >>> 0] === 0);
    var desc = {
      "module": WebGPU.getJsObject(HEAPU32[(((ptr) + (4)) >>> 2) >>> 0]),
      "constants": WebGPU.makePipelineConstants(HEAPU32[(((ptr) + (16)) >>> 2) >>> 0], HEAPU32[(((ptr) + (20)) >>> 2) >>> 0]),
      "entryPoint": WebGPU.makeStringFromOptionalStringView(ptr + 8)
    };
    return desc;
  },
  makeComputePipelineDesc: descriptor => {
    assert(descriptor);
    assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
    var desc = {
      "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
      "layout": WebGPU.makePipelineLayout(HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0]),
      "compute": WebGPU.makeComputeState(descriptor + 16)
    };
    return desc;
  },
  makeRenderPipelineDesc: descriptor => {
    assert(descriptor);
    assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
    function makePrimitiveState(psPtr) {
      if (!psPtr) return undefined;
      assert(psPtr);
      assert(HEAPU32[((psPtr) >>> 2) >>> 0] === 0);
      return {
        "topology": WebGPU.PrimitiveTopology[HEAPU32[(((psPtr) + (4)) >>> 2) >>> 0]],
        "stripIndexFormat": WebGPU.IndexFormat[HEAPU32[(((psPtr) + (8)) >>> 2) >>> 0]],
        "frontFace": WebGPU.FrontFace[HEAPU32[(((psPtr) + (12)) >>> 2) >>> 0]],
        "cullMode": WebGPU.CullMode[HEAPU32[(((psPtr) + (16)) >>> 2) >>> 0]],
        "unclippedDepth": !!(HEAPU32[(((psPtr) + (20)) >>> 2) >>> 0])
      };
    }
    function makeBlendComponent(bdPtr) {
      if (!bdPtr) return undefined;
      return {
        "operation": WebGPU.BlendOperation[HEAPU32[((bdPtr) >>> 2) >>> 0]],
        "srcFactor": WebGPU.BlendFactor[HEAPU32[(((bdPtr) + (4)) >>> 2) >>> 0]],
        "dstFactor": WebGPU.BlendFactor[HEAPU32[(((bdPtr) + (8)) >>> 2) >>> 0]]
      };
    }
    function makeBlendState(bsPtr) {
      if (!bsPtr) return undefined;
      return {
        "alpha": makeBlendComponent(bsPtr + 12),
        "color": makeBlendComponent(bsPtr + 0)
      };
    }
    function makeColorState(csPtr) {
      assert(csPtr);
      assert(HEAPU32[((csPtr) >>> 2) >>> 0] === 0);
      var formatInt = HEAPU32[(((csPtr) + (4)) >>> 2) >>> 0];
      return formatInt === 0 ? undefined : {
        "format": WebGPU.TextureFormat[formatInt],
        "blend": makeBlendState(HEAPU32[(((csPtr) + (8)) >>> 2) >>> 0]),
        "writeMask": HEAPU32[(((csPtr) + (16)) >>> 2) >>> 0]
      };
    }
    function makeColorStates(count, csArrayPtr) {
      var states = [];
      for (var i = 0; i < count; ++i) {
        states.push(makeColorState(csArrayPtr + 24 * i));
      }
      return states;
    }
    function makeStencilStateFace(ssfPtr) {
      assert(ssfPtr);
      return {
        "compare": WebGPU.CompareFunction[HEAPU32[((ssfPtr) >>> 2) >>> 0]],
        "failOp": WebGPU.StencilOperation[HEAPU32[(((ssfPtr) + (4)) >>> 2) >>> 0]],
        "depthFailOp": WebGPU.StencilOperation[HEAPU32[(((ssfPtr) + (8)) >>> 2) >>> 0]],
        "passOp": WebGPU.StencilOperation[HEAPU32[(((ssfPtr) + (12)) >>> 2) >>> 0]]
      };
    }
    function makeDepthStencilState(dssPtr) {
      if (!dssPtr) return undefined;
      assert(dssPtr);
      return {
        "format": WebGPU.TextureFormat[HEAPU32[(((dssPtr) + (4)) >>> 2) >>> 0]],
        "depthWriteEnabled": !!(HEAPU32[(((dssPtr) + (8)) >>> 2) >>> 0]),
        "depthCompare": WebGPU.CompareFunction[HEAPU32[(((dssPtr) + (12)) >>> 2) >>> 0]],
        "stencilFront": makeStencilStateFace(dssPtr + 16),
        "stencilBack": makeStencilStateFace(dssPtr + 32),
        "stencilReadMask": HEAPU32[(((dssPtr) + (48)) >>> 2) >>> 0],
        "stencilWriteMask": HEAPU32[(((dssPtr) + (52)) >>> 2) >>> 0],
        "depthBias": HEAP32[(((dssPtr) + (56)) >>> 2) >>> 0],
        "depthBiasSlopeScale": HEAPF32[(((dssPtr) + (60)) >>> 2) >>> 0],
        "depthBiasClamp": HEAPF32[(((dssPtr) + (64)) >>> 2) >>> 0]
      };
    }
    function makeVertexAttribute(vaPtr) {
      assert(vaPtr);
      return {
        "format": WebGPU.VertexFormat[HEAPU32[(((vaPtr) + (4)) >>> 2) >>> 0]],
        "offset": (HEAPU32[((((vaPtr + 4)) + (8)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((vaPtr) + (8)) >>> 2) >>> 0]),
        "shaderLocation": HEAPU32[(((vaPtr) + (16)) >>> 2) >>> 0]
      };
    }
    function makeVertexAttributes(count, vaArrayPtr) {
      var vas = [];
      for (var i = 0; i < count; ++i) {
        vas.push(makeVertexAttribute(vaArrayPtr + i * 24));
      }
      return vas;
    }
    function makeVertexBuffer(vbPtr) {
      if (!vbPtr) return undefined;
      var stepModeInt = HEAPU32[(((vbPtr) + (4)) >>> 2) >>> 0];
      var attributeCountInt = HEAPU32[(((vbPtr) + (16)) >>> 2) >>> 0];
      if (stepModeInt === 0 && attributeCountInt === 0) {
        return null;
      }
      return {
        "arrayStride": (HEAPU32[((((vbPtr + 4)) + (8)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((vbPtr) + (8)) >>> 2) >>> 0]),
        "stepMode": WebGPU.VertexStepMode[stepModeInt],
        "attributes": makeVertexAttributes(attributeCountInt, HEAPU32[(((vbPtr) + (20)) >>> 2) >>> 0])
      };
    }
    function makeVertexBuffers(count, vbArrayPtr) {
      if (!count) return undefined;
      var vbs = [];
      for (var i = 0; i < count; ++i) {
        vbs.push(makeVertexBuffer(vbArrayPtr + i * 24));
      }
      return vbs;
    }
    function makeVertexState(viPtr) {
      if (!viPtr) return undefined;
      assert(viPtr);
      assert(HEAPU32[((viPtr) >>> 2) >>> 0] === 0);
      var desc = {
        "module": WebGPU.getJsObject(HEAPU32[(((viPtr) + (4)) >>> 2) >>> 0]),
        "constants": WebGPU.makePipelineConstants(HEAPU32[(((viPtr) + (16)) >>> 2) >>> 0], HEAPU32[(((viPtr) + (20)) >>> 2) >>> 0]),
        "buffers": makeVertexBuffers(HEAPU32[(((viPtr) + (24)) >>> 2) >>> 0], HEAPU32[(((viPtr) + (28)) >>> 2) >>> 0]),
        "entryPoint": WebGPU.makeStringFromOptionalStringView(viPtr + 8)
      };
      return desc;
    }
    function makeMultisampleState(msPtr) {
      if (!msPtr) return undefined;
      assert(msPtr);
      assert(HEAPU32[((msPtr) >>> 2) >>> 0] === 0);
      return {
        "count": HEAPU32[(((msPtr) + (4)) >>> 2) >>> 0],
        "mask": HEAPU32[(((msPtr) + (8)) >>> 2) >>> 0],
        "alphaToCoverageEnabled": !!(HEAPU32[(((msPtr) + (12)) >>> 2) >>> 0])
      };
    }
    function makeFragmentState(fsPtr) {
      if (!fsPtr) return undefined;
      assert(fsPtr);
      assert(HEAPU32[((fsPtr) >>> 2) >>> 0] === 0);
      var desc = {
        "module": WebGPU.getJsObject(HEAPU32[(((fsPtr) + (4)) >>> 2) >>> 0]),
        "constants": WebGPU.makePipelineConstants(HEAPU32[(((fsPtr) + (16)) >>> 2) >>> 0], HEAPU32[(((fsPtr) + (20)) >>> 2) >>> 0]),
        "targets": makeColorStates(HEAPU32[(((fsPtr) + (24)) >>> 2) >>> 0], HEAPU32[(((fsPtr) + (28)) >>> 2) >>> 0]),
        "entryPoint": WebGPU.makeStringFromOptionalStringView(fsPtr + 8)
      };
      return desc;
    }
    var desc = {
      "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
      "layout": WebGPU.makePipelineLayout(HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0]),
      "vertex": makeVertexState(descriptor + 16),
      "primitive": makePrimitiveState(descriptor + 48),
      "depthStencil": makeDepthStencilState(HEAPU32[(((descriptor) + (72)) >>> 2) >>> 0]),
      "multisample": makeMultisampleState(descriptor + 76),
      "fragment": makeFragmentState(HEAPU32[(((descriptor) + (92)) >>> 2) >>> 0])
    };
    return desc;
  },
  fillLimitStruct: (limits, limitsOutPtr) => {
    assert(limitsOutPtr);
    assert(HEAPU32[((limitsOutPtr) >>> 2) >>> 0] === 0);
    function setLimitValueU32(name, limitOffset) {
      var limitValue = limits[name];
      HEAP32[(((limitsOutPtr) + (limitOffset)) >>> 2) >>> 0] = limitValue;
    }
    function setLimitValueU64(name, limitOffset) {
      var limitValue = limits[name];
      HEAP64[(((limitsOutPtr) + (limitOffset)) >>> 3) >>> 0] = BigInt(limitValue);
    }
    setLimitValueU32("maxTextureDimension1D", 4);
    setLimitValueU32("maxTextureDimension2D", 8);
    setLimitValueU32("maxTextureDimension3D", 12);
    setLimitValueU32("maxTextureArrayLayers", 16);
    setLimitValueU32("maxBindGroups", 20);
    setLimitValueU32("maxBindGroupsPlusVertexBuffers", 24);
    setLimitValueU32("maxBindingsPerBindGroup", 28);
    setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout", 32);
    setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout", 36);
    setLimitValueU32("maxSampledTexturesPerShaderStage", 40);
    setLimitValueU32("maxSamplersPerShaderStage", 44);
    setLimitValueU32("maxStorageBuffersPerShaderStage", 48);
    setLimitValueU32("maxStorageTexturesPerShaderStage", 52);
    setLimitValueU32("maxUniformBuffersPerShaderStage", 56);
    setLimitValueU32("minUniformBufferOffsetAlignment", 80);
    setLimitValueU32("minStorageBufferOffsetAlignment", 84);
    setLimitValueU64("maxUniformBufferBindingSize", 64);
    setLimitValueU64("maxStorageBufferBindingSize", 72);
    setLimitValueU32("maxVertexBuffers", 88);
    setLimitValueU64("maxBufferSize", 96);
    setLimitValueU32("maxVertexAttributes", 104);
    setLimitValueU32("maxVertexBufferArrayStride", 108);
    setLimitValueU32("maxInterStageShaderVariables", 112);
    setLimitValueU32("maxColorAttachments", 116);
    setLimitValueU32("maxColorAttachmentBytesPerSample", 120);
    setLimitValueU32("maxComputeWorkgroupStorageSize", 124);
    setLimitValueU32("maxComputeInvocationsPerWorkgroup", 128);
    setLimitValueU32("maxComputeWorkgroupSizeX", 132);
    setLimitValueU32("maxComputeWorkgroupSizeY", 136);
    setLimitValueU32("maxComputeWorkgroupSizeZ", 140);
    setLimitValueU32("maxComputeWorkgroupsPerDimension", 144);
    // Non-standard. If this is undefined, it will correctly just cast to 0.
    if (limits.maxImmediateSize !== undefined) {
      setLimitValueU32("maxImmediateSize", 148);
    }
  },
  fillAdapterInfoStruct: (info, infoStruct) => {
    assert(infoStruct);
    assert(HEAPU32[((infoStruct) >>> 2) >>> 0] === 0);
    // Populate subgroup limits.
    HEAP32[(((infoStruct) + (52)) >>> 2) >>> 0] = info.subgroupMinSize;
    HEAP32[(((infoStruct) + (56)) >>> 2) >>> 0] = info.subgroupMaxSize;
    // Append all the strings together to condense into a single malloc.
    var strs = info.vendor + info.architecture + info.device + info.description;
    var strPtr = stringToNewUTF8(strs);
    var vendorLen = lengthBytesUTF8(info.vendor);
    WebGPU.setStringView(infoStruct + 4, strPtr, vendorLen);
    strPtr += vendorLen;
    var architectureLen = lengthBytesUTF8(info.architecture);
    WebGPU.setStringView(infoStruct + 12, strPtr, architectureLen);
    strPtr += architectureLen;
    var deviceLen = lengthBytesUTF8(info.device);
    WebGPU.setStringView(infoStruct + 20, strPtr, deviceLen);
    strPtr += deviceLen;
    var descriptionLen = lengthBytesUTF8(info.description);
    WebGPU.setStringView(infoStruct + 28, strPtr, descriptionLen);
    strPtr += descriptionLen;
    HEAP32[(((infoStruct) + (36)) >>> 2) >>> 0] = 2;
    var adapterType = info.isFallbackAdapter ? 3 : 4;
    HEAP32[(((infoStruct) + (40)) >>> 2) >>> 0] = adapterType;
    HEAP32[(((infoStruct) + (44)) >>> 2) >>> 0] = 0;
    HEAP32[(((infoStruct) + (48)) >>> 2) >>> 0] = 0;
  },
  Int_BufferMapState: {
    unmapped: 1,
    pending: 2,
    mapped: 3
  },
  Int_CompilationMessageType: {
    error: 1,
    warning: 2,
    info: 3
  },
  Int_DeviceLostReason: {
    undefined: 1,
    unknown: 1,
    destroyed: 2
  },
  Int_PreferredFormat: {
    rgba8unorm: 18,
    bgra8unorm: 23
  },
  AddressMode: [ , "clamp-to-edge", "repeat", "mirror-repeat" ],
  BlendFactor: [ , "zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1alpha", "one-minus-src1alpha" ],
  BlendOperation: [ , "add", "subtract", "reverse-subtract", "min", "max" ],
  BufferBindingType: [ "binding-not-used", , "uniform", "storage", "read-only-storage" ],
  BufferMapState: {
    1: "unmapped",
    2: "pending",
    3: "mapped"
  },
  CompareFunction: [ , "never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always" ],
  CompilationInfoRequestStatus: {
    1: "success",
    2: "callback-cancelled"
  },
  CompositeAlphaMode: [ , "opaque", "premultiplied", "unpremultiplied", "inherit" ],
  CullMode: [ , "none", "front", "back" ],
  ErrorFilter: {
    1: "validation",
    2: "out-of-memory",
    3: "internal"
  },
  FeatureLevel: [ , "compatibility", "core" ],
  FeatureName: {
    1: "depth-clip-control",
    2: "depth32float-stencil8",
    3: "timestamp-query",
    4: "texture-compression-bc",
    5: "texture-compression-bc-sliced-3d",
    6: "texture-compression-etc2",
    7: "texture-compression-astc",
    8: "texture-compression-astc-sliced-3d",
    9: "indirect-first-instance",
    10: "shader-f16",
    11: "rg11b10ufloat-renderable",
    12: "bgra8unorm-storage",
    13: "float32-filterable",
    14: "float32-blendable",
    15: "clip-distances",
    16: "dual-source-blending",
    17: "subgroups",
    18: "core-features-and-limits",
    327692: "chromium-experimental-unorm16-texture-formats",
    327693: "chromium-experimental-snorm16-texture-formats",
    327732: "chromium-experimental-multi-draw-indirect"
  },
  FilterMode: [ , "nearest", "linear" ],
  FrontFace: [ , "ccw", "cw" ],
  IndexFormat: [ , "uint16", "uint32" ],
  LoadOp: [ , "load", "clear" ],
  MipmapFilterMode: [ , "nearest", "linear" ],
  OptionalBool: [ "false", "true" ],
  PowerPreference: [ , "low-power", "high-performance" ],
  PredefinedColorSpace: {
    1: "srgb",
    2: "display-p3"
  },
  PrimitiveTopology: [ , "point-list", "line-list", "line-strip", "triangle-list", "triangle-strip" ],
  QueryType: {
    1: "occlusion",
    2: "timestamp"
  },
  SamplerBindingType: [ "binding-not-used", , "filtering", "non-filtering", "comparison" ],
  Status: {
    1: "success",
    2: "error"
  },
  StencilOperation: [ , "keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap" ],
  StorageTextureAccess: [ "binding-not-used", , "write-only", "read-only", "read-write" ],
  StoreOp: [ , "store", "discard" ],
  SurfaceGetCurrentTextureStatus: {
    1: "success-optimal",
    2: "success-suboptimal",
    3: "timeout",
    4: "outdated",
    5: "lost",
    6: "error"
  },
  TextureAspect: [ , "all", "stencil-only", "depth-only" ],
  TextureDimension: [ , "1d", "2d", "3d" ],
  TextureFormat: [ , "r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32float", "r32uint", "r32sint", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rgb9e5ufloat", "rg32float", "rg32uint", "rg32sint", "rgba16uint", "rgba16sint", "rgba16float", "rgba32float", "rgba32uint", "rgba32sint", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb" ],
  TextureSampleType: [ "binding-not-used", , "float", "unfilterable-float", "depth", "sint", "uint" ],
  TextureViewDimension: [ , "1d", "2d", "2d-array", "cube", "cube-array", "3d" ],
  ToneMappingMode: {
    1: "standard",
    2: "extended"
  },
  VertexFormat: {
    1: "uint8",
    2: "uint8x2",
    3: "uint8x4",
    4: "sint8",
    5: "sint8x2",
    6: "sint8x4",
    7: "unorm8",
    8: "unorm8x2",
    9: "unorm8x4",
    10: "snorm8",
    11: "snorm8x2",
    12: "snorm8x4",
    13: "uint16",
    14: "uint16x2",
    15: "uint16x4",
    16: "sint16",
    17: "sint16x2",
    18: "sint16x4",
    19: "unorm16",
    20: "unorm16x2",
    21: "unorm16x4",
    22: "snorm16",
    23: "snorm16x2",
    24: "snorm16x4",
    25: "float16",
    26: "float16x2",
    27: "float16x4",
    28: "float32",
    29: "float32x2",
    30: "float32x3",
    31: "float32x4",
    32: "uint32",
    33: "uint32x2",
    34: "uint32x3",
    35: "uint32x4",
    36: "sint32",
    37: "sint32x2",
    38: "sint32x3",
    39: "sint32x4",
    40: "unorm10-10-10-2",
    41: "unorm8x4-bgra"
  },
  VertexStepMode: [ , "vertex", "instance" ],
  WGSLLanguageFeatureName: {
    1: "readonly_and_readwrite_storage_textures",
    2: "packed_4x8_integer_dot_product",
    3: "unrestricted_pointer_parameters",
    4: "pointer_composite_access",
    5: "sized_binding_array"
  },
  FeatureNameString2Enum: {
    "depth-clip-control": "1",
    "depth32float-stencil8": "2",
    "timestamp-query": "3",
    "texture-compression-bc": "4",
    "texture-compression-bc-sliced-3d": "5",
    "texture-compression-etc2": "6",
    "texture-compression-astc": "7",
    "texture-compression-astc-sliced-3d": "8",
    "indirect-first-instance": "9",
    "shader-f16": "10",
    "rg11b10ufloat-renderable": "11",
    "bgra8unorm-storage": "12",
    "float32-filterable": "13",
    "float32-blendable": "14",
    "clip-distances": "15",
    "dual-source-blending": "16",
    subgroups: "17",
    "core-features-and-limits": "18",
    "chromium-experimental-unorm16-texture-formats": "327692",
    "chromium-experimental-snorm16-texture-formats": "327693",
    "chromium-experimental-multi-draw-indirect": "327732"
  },
  WGSLLanguageFeatureNameString2Enum: {
    readonly_and_readwrite_storage_textures: "1",
    packed_4x8_integer_dot_product: "2",
    unrestricted_pointer_parameters: "3",
    pointer_composite_access: "4",
    sized_binding_array: "5"
  }
};

function _emwgpuAdapterRequestDevice(adapterPtr, futureId, deviceLostFutureId, devicePtr, queuePtr, descriptor) {
  adapterPtr >>>= 0;
  futureId = bigintToI53Checked(futureId);
  deviceLostFutureId = bigintToI53Checked(deviceLostFutureId);
  devicePtr >>>= 0;
  queuePtr >>>= 0;
  descriptor >>>= 0;
  var adapter = WebGPU.getJsObject(adapterPtr);
  var desc = {};
  if (descriptor) {
    assert(descriptor);
    assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
    var requiredFeatureCount = HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0];
    if (requiredFeatureCount) {
      var requiredFeaturesPtr = HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0];
      // requiredFeaturesPtr is a pointer to an array of FeatureName which is an enum of size uint32_t
      desc["requiredFeatures"] = Array.from(HEAPU32.subarray((((requiredFeaturesPtr) >>> 2)) >>> 0, ((requiredFeaturesPtr + requiredFeatureCount * 4) >>> 2) >>> 0), feature => WebGPU.FeatureName[feature]);
    }
    var limitsPtr = HEAPU32[(((descriptor) + (20)) >>> 2) >>> 0];
    if (limitsPtr) {
      assert(limitsPtr);
      assert(HEAPU32[((limitsPtr) >>> 2) >>> 0] === 0);
      var requiredLimits = {};
      function setLimitU32IfDefined(name, limitOffset, ignoreIfZero = false) {
        var ptr = limitsPtr + limitOffset;
        var value = HEAPU32[((ptr) >>> 2) >>> 0];
        if (value != 4294967295 && (!ignoreIfZero || value != 0)) {
          requiredLimits[name] = value;
        }
      }
      function setLimitU64IfDefined(name, limitOffset) {
        var ptr = limitsPtr + limitOffset;
        // Handle WGPU_LIMIT_U64_UNDEFINED.
        var limitPart1 = HEAPU32[((ptr) >>> 2) >>> 0];
        var limitPart2 = HEAPU32[(((ptr) + (4)) >>> 2) >>> 0];
        if (limitPart1 != 4294967295 || limitPart2 != 4294967295) {
          requiredLimits[name] = (HEAPU32[(((ptr + 4)) >>> 2) >>> 0] * 4294967296 + HEAPU32[((ptr) >>> 2) >>> 0]);
        }
      }
      setLimitU32IfDefined("maxTextureDimension1D", 4);
      setLimitU32IfDefined("maxTextureDimension2D", 8);
      setLimitU32IfDefined("maxTextureDimension3D", 12);
      setLimitU32IfDefined("maxTextureArrayLayers", 16);
      setLimitU32IfDefined("maxBindGroups", 20);
      setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers", 24);
      setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout", 32);
      setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout", 36);
      setLimitU32IfDefined("maxSampledTexturesPerShaderStage", 40);
      setLimitU32IfDefined("maxSamplersPerShaderStage", 44);
      setLimitU32IfDefined("maxStorageBuffersPerShaderStage", 48);
      setLimitU32IfDefined("maxStorageTexturesPerShaderStage", 52);
      setLimitU32IfDefined("maxUniformBuffersPerShaderStage", 56);
      setLimitU32IfDefined("minUniformBufferOffsetAlignment", 80);
      setLimitU32IfDefined("minStorageBufferOffsetAlignment", 84);
      setLimitU64IfDefined("maxUniformBufferBindingSize", 64);
      setLimitU64IfDefined("maxStorageBufferBindingSize", 72);
      setLimitU32IfDefined("maxVertexBuffers", 88);
      setLimitU64IfDefined("maxBufferSize", 96);
      setLimitU32IfDefined("maxVertexAttributes", 104);
      setLimitU32IfDefined("maxVertexBufferArrayStride", 108);
      setLimitU32IfDefined("maxInterStageShaderVariables", 112);
      setLimitU32IfDefined("maxColorAttachments", 116);
      setLimitU32IfDefined("maxColorAttachmentBytesPerSample", 120);
      setLimitU32IfDefined("maxComputeWorkgroupStorageSize", 124);
      setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup", 128);
      setLimitU32IfDefined("maxComputeWorkgroupSizeX", 132);
      setLimitU32IfDefined("maxComputeWorkgroupSizeY", 136);
      setLimitU32IfDefined("maxComputeWorkgroupSizeZ", 140);
      setLimitU32IfDefined("maxComputeWorkgroupsPerDimension", 144);
      // Non-standard. If this is 0, avoid passing it through so it won't cause an error.
      setLimitU32IfDefined("maxImmediateSize", 148, true);
      desc["requiredLimits"] = requiredLimits;
    }
    var defaultQueuePtr = HEAPU32[(((descriptor) + (24)) >>> 2) >>> 0];
    if (defaultQueuePtr) {
      var defaultQueueDesc = {
        "label": WebGPU.makeStringFromOptionalStringView(defaultQueuePtr + 4)
      };
      desc["defaultQueue"] = defaultQueueDesc;
    }
    desc["label"] = WebGPU.makeStringFromOptionalStringView(descriptor + 4);
  }
  WebGPU.Internals.futureInsert(futureId, adapter.requestDevice(desc).then(device => {
    WebGPU.Internals.jsObjectInsert(queuePtr, device.queue);
    WebGPU.Internals.jsObjectInsert(devicePtr, device);
    // Set up device lost promise resolution.
    if (deviceLostFutureId) {
      WebGPU.Internals.futureInsert(deviceLostFutureId, device.lost.then(info => {
        // Unset the uncaptured error handler.
        device.onuncapturederror = ev => {};
        var sp = stackSave();
        var messagePtr = stringToUTF8OnStack(info.message);
        _emwgpuOnDeviceLostCompleted(deviceLostFutureId, WebGPU.Int_DeviceLostReason[info.reason], messagePtr);
        stackRestore(sp);
      }));
    }
    // Set up uncaptured error handlers.
    assert(typeof GPUValidationError != "undefined");
    assert(typeof GPUOutOfMemoryError != "undefined");
    assert(typeof GPUInternalError != "undefined");
    device.onuncapturederror = ev => {
      var type = 5;
      if (ev.error instanceof GPUValidationError) type = 2; else if (ev.error instanceof GPUOutOfMemoryError) type = 3; else if (ev.error instanceof GPUInternalError) type = 4;
      var sp = stackSave();
      var messagePtr = stringToUTF8OnStack(ev.error.message);
      _emwgpuOnUncapturedError(devicePtr, type, messagePtr);
      stackRestore(sp);
    };
    _emwgpuOnRequestDeviceCompleted(futureId, 1, devicePtr, 0);
  }, ex => {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack(ex.message);
    _emwgpuOnRequestDeviceCompleted(futureId, 3, devicePtr, messagePtr);
    if (deviceLostFutureId) {
      _emwgpuOnDeviceLostCompleted(deviceLostFutureId, 4, messagePtr);
    }
    stackRestore(sp);
  }));
}

function _emwgpuBufferDestroy(bufferPtr) {
  bufferPtr >>>= 0;
  var buffer = WebGPU.getJsObject(bufferPtr);
  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];
  if (onUnmap) {
    for (var i = 0; i < onUnmap.length; ++i) {
      onUnmap[i]();
    }
    delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];
  }
  buffer.destroy();
}

function _emwgpuBufferGetConstMappedRange(bufferPtr, offset, size) {
  bufferPtr >>>= 0;
  offset >>>= 0;
  size >>>= 0;
  var buffer = WebGPU.getJsObject(bufferPtr);
  if (size === 0) warnOnce("getMappedRange size=0 no longer means WGPU_WHOLE_MAP_SIZE");
  if (size == 4294967295) size = undefined;
  var mapped;
  try {
    mapped = buffer.getMappedRange(offset, size);
  } catch (ex) {
    err(`buffer.getMappedRange(${offset}, ${size}) failed: ${ex}`);
    return 0;
  }
  var data = _memalign(16, mapped.byteLength);
  HEAPU8.set(new Uint8Array(mapped), data >>> 0);
  WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(() => _free(data));
  return data;
}

var _emwgpuBufferMapAsync = function(bufferPtr, futureId, mode, offset, size) {
  bufferPtr >>>= 0;
  futureId = bigintToI53Checked(futureId);
  mode = bigintToI53Checked(mode);
  offset >>>= 0;
  size >>>= 0;
  var buffer = WebGPU.getJsObject(bufferPtr);
  WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];
  if (size == 4294967295) size = undefined;
  WebGPU.Internals.futureInsert(futureId, buffer.mapAsync(mode, offset, size).then(() => {
    _emwgpuOnMapAsyncCompleted(futureId, 1, 0);
  }, ex => {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack(ex.message);
    var status = ex.name === "AbortError" ? 4 : ex.name === "OperationError" ? 3 : 0;
    assert(status);
    _emwgpuOnMapAsyncCompleted(futureId, status, messagePtr);
    delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];
  }));
};

function _emwgpuBufferUnmap(bufferPtr) {
  bufferPtr >>>= 0;
  var buffer = WebGPU.getJsObject(bufferPtr);
  var onUnmap = WebGPU.Internals.bufferOnUnmaps[bufferPtr];
  if (!onUnmap) {
    // Already unmapped
    return;
  }
  for (var i = 0; i < onUnmap.length; ++i) {
    onUnmap[i]();
  }
  delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];
  buffer.unmap();
}

function _emwgpuDelete(ptr) {
  ptr >>>= 0;
  delete WebGPU.Internals.jsObjects[ptr];
}

function _emwgpuDeviceCreateBuffer(devicePtr, descriptor, bufferPtr) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  bufferPtr >>>= 0;
  assert(descriptor);
  assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
  var mappedAtCreation = !!(HEAPU32[(((descriptor) + (32)) >>> 2) >>> 0]);
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "usage": HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0],
    "size": (HEAPU32[((((descriptor + 4)) + (24)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((descriptor) + (24)) >>> 2) >>> 0]),
    "mappedAtCreation": mappedAtCreation
  };
  var device = WebGPU.getJsObject(devicePtr);
  var buffer;
  try {
    buffer = device.createBuffer(desc);
  } catch (ex) {
    // The only exception should be RangeError if mapping at creation ran out of memory.
    assert(ex instanceof RangeError);
    assert(mappedAtCreation);
    err("createBuffer threw:", ex);
    return false;
  }
  WebGPU.Internals.jsObjectInsert(bufferPtr, buffer);
  if (mappedAtCreation) {
    WebGPU.Internals.bufferOnUnmaps[bufferPtr] = [];
  }
  return true;
}

function _emwgpuDeviceCreateShaderModule(devicePtr, descriptor, shaderModulePtr) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  shaderModulePtr >>>= 0;
  assert(descriptor);
  var nextInChainPtr = HEAPU32[((descriptor) >>> 2) >>> 0];
  assert(nextInChainPtr !== 0);
  var sType = HEAPU32[(((nextInChainPtr) + (4)) >>> 2) >>> 0];
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "code": ""
  };
  switch (sType) {
   case 2:
    {
      desc["code"] = WebGPU.makeStringFromStringView(nextInChainPtr + 8);
      break;
    }

   default:
    abort("unrecognized ShaderModule sType");
  }
  var device = WebGPU.getJsObject(devicePtr);
  WebGPU.Internals.jsObjectInsert(shaderModulePtr, device.createShaderModule(desc));
}

var _emwgpuDeviceDestroy = devicePtr => {
  WebGPU.getJsObject(devicePtr).destroy();
};

var _emwgpuDevicePopErrorScope = function(devicePtr, futureId) {
  devicePtr >>>= 0;
  futureId = bigintToI53Checked(futureId);
  var device = WebGPU.getJsObject(devicePtr);
  WebGPU.Internals.futureInsert(futureId, device.popErrorScope().then(gpuError => {
    var type = 5;
    if (!gpuError) type = 1; else if (gpuError instanceof GPUValidationError) type = 2; else if (gpuError instanceof GPUOutOfMemoryError) type = 3; else if (gpuError instanceof GPUInternalError) type = 4; else assert(false);
    var sp = stackSave();
    var messagePtr = gpuError ? stringToUTF8OnStack(gpuError.message) : 0;
    _emwgpuOnPopErrorScopeCompleted(futureId, 1, type, messagePtr);
    stackRestore(sp);
  }, ex => {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack(ex.message);
    _emwgpuOnPopErrorScopeCompleted(futureId, 1, 5, messagePtr);
    stackRestore(sp);
  }));
};

var _emwgpuGetPreferredFormat = () => {
  var format = navigator["gpu"]["getPreferredCanvasFormat"]();
  return WebGPU.Int_PreferredFormat[format];
};

function _emwgpuInstanceRequestAdapter(instancePtr, futureId, options, adapterPtr) {
  instancePtr >>>= 0;
  futureId = bigintToI53Checked(futureId);
  options >>>= 0;
  adapterPtr >>>= 0;
  var opts;
  if (options) {
    assert(options);
    var featureLevel = HEAPU32[(((options) + (4)) >>> 2) >>> 0];
    opts = {
      "featureLevel": WebGPU.FeatureLevel[featureLevel],
      "powerPreference": WebGPU.PowerPreference[HEAPU32[(((options) + (8)) >>> 2) >>> 0]],
      "forceFallbackAdapter": !!(HEAPU32[(((options) + (12)) >>> 2) >>> 0])
    };
    var nextInChainPtr = HEAPU32[((options) >>> 2) >>> 0];
    if (nextInChainPtr !== 0) {
      var sType = HEAPU32[(((nextInChainPtr) + (4)) >>> 2) >>> 0];
      assert(sType === 11);
      assert(0 === HEAPU32[((nextInChainPtr) >>> 2) >>> 0]);
      var webxrOptions = nextInChainPtr;
      assert(webxrOptions);
      assert(HEAPU32[((webxrOptions) >>> 2) >>> 0] === 0);
      opts.xrCompatible = !!(HEAPU32[(((webxrOptions) + (8)) >>> 2) >>> 0]);
    }
  }
  if (!("gpu" in navigator)) {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");
    _emwgpuOnRequestAdapterCompleted(futureId, 3, adapterPtr, messagePtr);
    stackRestore(sp);
    return;
  }
  WebGPU.Internals.futureInsert(futureId, navigator["gpu"]["requestAdapter"](opts).then(adapter => {
    if (adapter) {
      WebGPU.Internals.jsObjectInsert(adapterPtr, adapter);
      _emwgpuOnRequestAdapterCompleted(futureId, 1, adapterPtr, 0);
    } else {
      var sp = stackSave();
      var messagePtr = stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");
      _emwgpuOnRequestAdapterCompleted(futureId, 3, adapterPtr, messagePtr);
      stackRestore(sp);
    }
  }, ex => {
    var sp = stackSave();
    var messagePtr = stringToUTF8OnStack(ex.message);
    _emwgpuOnRequestAdapterCompleted(futureId, 4, adapterPtr, messagePtr);
    stackRestore(sp);
  }));
}

var ENV = {};

var getExecutableName = () => thisProgram || "./this.program";

var getEnvStrings = () => {
  if (!getEnvStrings.strings) {
    // Default values.
    // Browser language detection #8751
    var lang = ((typeof navigator == "object" && navigator.language) || "C").replace("-", "_") + ".UTF-8";
    var env = {
      "USER": "web_user",
      "LOGNAME": "web_user",
      "PATH": "/",
      "PWD": "/",
      "HOME": "/home/web_user",
      "LANG": lang,
      "_": getExecutableName()
    };
    // Apply the user-provided values, if any.
    for (var x in ENV) {
      // x is a key in ENV; if ENV[x] is undefined, that means it was
      // explicitly set to be so. We allow user code to do that to
      // force variables with default values to remain unset.
      if (ENV[x] === undefined) delete env[x]; else env[x] = ENV[x];
    }
    var strings = [];
    for (var x in env) {
      strings.push(`${x}=${env[x]}`);
    }
    getEnvStrings.strings = strings;
  }
  return getEnvStrings.strings;
};

function _environ_get(__environ, environ_buf) {
  __environ >>>= 0;
  environ_buf >>>= 0;
  var bufSize = 0;
  var envp = 0;
  for (var string of getEnvStrings()) {
    var ptr = environ_buf + bufSize;
    HEAPU32[(((__environ) + (envp)) >>> 2) >>> 0] = ptr;
    bufSize += stringToUTF8(string, ptr, Infinity) + 1;
    envp += 4;
  }
  return 0;
}

function _environ_sizes_get(penviron_count, penviron_buf_size) {
  penviron_count >>>= 0;
  penviron_buf_size >>>= 0;
  var strings = getEnvStrings();
  HEAPU32[((penviron_count) >>> 2) >>> 0] = strings.length;
  var bufSize = 0;
  for (var string of strings) {
    bufSize += lengthBytesUTF8(string) + 1;
  }
  HEAPU32[((penviron_buf_size) >>> 2) >>> 0] = bufSize;
  return 0;
}

function _fd_close(fd) {
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.close(stream);
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return e.errno;
  }
}

/** @param {number=} offset */ var doReadv = (stream, iov, iovcnt, offset) => {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAPU32[((iov) >>> 2) >>> 0];
    var len = HEAPU32[(((iov) + (4)) >>> 2) >>> 0];
    iov += 8;
    var curr = FS.read(stream, HEAP8, ptr, len, offset);
    if (curr < 0) return -1;
    ret += curr;
    if (curr < len) break;
    // nothing more to read
    if (typeof offset != "undefined") {
      offset += curr;
    }
  }
  return ret;
};

function _fd_read(fd, iov, iovcnt, pnum) {
  iov >>>= 0;
  iovcnt >>>= 0;
  pnum >>>= 0;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = doReadv(stream, iov, iovcnt);
    HEAPU32[((pnum) >>> 2) >>> 0] = num;
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return e.errno;
  }
}

function _fd_seek(fd, offset, whence, newOffset) {
  offset = bigintToI53Checked(offset);
  newOffset >>>= 0;
  try {
    if (isNaN(offset)) return 61;
    var stream = SYSCALLS.getStreamFromFD(fd);
    FS.llseek(stream, offset, whence);
    HEAP64[((newOffset) >>> 3) >>> 0] = BigInt(stream.position);
    if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
    // reset readdir state
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return e.errno;
  }
}

/** @param {number=} offset */ var doWritev = (stream, iov, iovcnt, offset) => {
  var ret = 0;
  for (var i = 0; i < iovcnt; i++) {
    var ptr = HEAPU32[((iov) >>> 2) >>> 0];
    var len = HEAPU32[(((iov) + (4)) >>> 2) >>> 0];
    iov += 8;
    var curr = FS.write(stream, HEAP8, ptr, len, offset);
    if (curr < 0) return -1;
    ret += curr;
    if (curr < len) {
      // No more space to write.
      break;
    }
    if (typeof offset != "undefined") {
      offset += curr;
    }
  }
  return ret;
};

function _fd_write(fd, iov, iovcnt, pnum) {
  iov >>>= 0;
  iovcnt >>>= 0;
  pnum >>>= 0;
  try {
    var stream = SYSCALLS.getStreamFromFD(fd);
    var num = doWritev(stream, iov, iovcnt);
    HEAPU32[((pnum) >>> 2) >>> 0] = num;
    return 0;
  } catch (e) {
    if (typeof FS == "undefined" || !(e.name === "ErrnoError")) throw e;
    return e.errno;
  }
}

function _wgpuCommandEncoderBeginRenderPass(encoderPtr, descriptor) {
  encoderPtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  function makeColorAttachment(caPtr) {
    var viewPtr = HEAPU32[(((caPtr) + (4)) >>> 2) >>> 0];
    if (viewPtr === 0) {
      // view could be undefined.
      return undefined;
    }
    var depthSlice = HEAP32[(((caPtr) + (8)) >>> 2) >>> 0];
    if (depthSlice == -1) depthSlice = undefined;
    var loadOpInt = HEAPU32[(((caPtr) + (16)) >>> 2) >>> 0];
    assert(loadOpInt !== 0);
    var storeOpInt = HEAPU32[(((caPtr) + (20)) >>> 2) >>> 0];
    assert(storeOpInt !== 0);
    var clearValue = WebGPU.makeColor(caPtr + 24);
    return {
      "view": WebGPU.getJsObject(viewPtr),
      "depthSlice": depthSlice,
      "resolveTarget": WebGPU.getJsObject(HEAPU32[(((caPtr) + (12)) >>> 2) >>> 0]),
      "clearValue": clearValue,
      "loadOp": WebGPU.LoadOp[loadOpInt],
      "storeOp": WebGPU.StoreOp[storeOpInt]
    };
  }
  function makeColorAttachments(count, caPtr) {
    var attachments = [];
    for (var i = 0; i < count; ++i) {
      attachments.push(makeColorAttachment(caPtr + 56 * i));
    }
    return attachments;
  }
  function makeDepthStencilAttachment(dsaPtr) {
    if (dsaPtr === 0) return undefined;
    return {
      "view": WebGPU.getJsObject(HEAPU32[(((dsaPtr) + (4)) >>> 2) >>> 0]),
      "depthClearValue": HEAPF32[(((dsaPtr) + (16)) >>> 2) >>> 0],
      "depthLoadOp": WebGPU.LoadOp[HEAPU32[(((dsaPtr) + (8)) >>> 2) >>> 0]],
      "depthStoreOp": WebGPU.StoreOp[HEAPU32[(((dsaPtr) + (12)) >>> 2) >>> 0]],
      "depthReadOnly": !!(HEAPU32[(((dsaPtr) + (20)) >>> 2) >>> 0]),
      "stencilClearValue": HEAPU32[(((dsaPtr) + (32)) >>> 2) >>> 0],
      "stencilLoadOp": WebGPU.LoadOp[HEAPU32[(((dsaPtr) + (24)) >>> 2) >>> 0]],
      "stencilStoreOp": WebGPU.StoreOp[HEAPU32[(((dsaPtr) + (28)) >>> 2) >>> 0]],
      "stencilReadOnly": !!(HEAPU32[(((dsaPtr) + (36)) >>> 2) >>> 0])
    };
  }
  function makeRenderPassDescriptor(descriptor) {
    assert(descriptor);
    var nextInChainPtr = HEAPU32[((descriptor) >>> 2) >>> 0];
    var maxDrawCount = undefined;
    if (nextInChainPtr !== 0) {
      var sType = HEAPU32[(((nextInChainPtr) + (4)) >>> 2) >>> 0];
      assert(sType === 3);
      assert(0 === HEAPU32[((nextInChainPtr) >>> 2) >>> 0]);
      var renderPassMaxDrawCount = nextInChainPtr;
      assert(renderPassMaxDrawCount);
      assert(HEAPU32[((renderPassMaxDrawCount) >>> 2) >>> 0] === 0);
      maxDrawCount = (HEAPU32[((((renderPassMaxDrawCount + 4)) + (8)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((renderPassMaxDrawCount) + (8)) >>> 2) >>> 0]);
    }
    var desc = {
      "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
      "colorAttachments": makeColorAttachments(HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0], HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0]),
      "depthStencilAttachment": makeDepthStencilAttachment(HEAPU32[(((descriptor) + (20)) >>> 2) >>> 0]),
      "occlusionQuerySet": WebGPU.getJsObject(HEAPU32[(((descriptor) + (24)) >>> 2) >>> 0]),
      "timestampWrites": WebGPU.makePassTimestampWrites(HEAPU32[(((descriptor) + (28)) >>> 2) >>> 0]),
      "maxDrawCount": maxDrawCount
    };
    return desc;
  }
  var desc = makeRenderPassDescriptor(descriptor);
  var commandEncoder = WebGPU.getJsObject(encoderPtr);
  var ptr = _emwgpuCreateRenderPassEncoder(0);
  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.beginRenderPass(desc));
  return ptr;
}

function _wgpuCommandEncoderClearBuffer(encoderPtr, bufferPtr, offset, size) {
  encoderPtr >>>= 0;
  bufferPtr >>>= 0;
  offset = bigintToI53Checked(offset);
  size = bigintToI53Checked(size);
  var commandEncoder = WebGPU.getJsObject(encoderPtr);
  if (size == -1) size = undefined;
  var buffer = WebGPU.getJsObject(bufferPtr);
  commandEncoder.clearBuffer(buffer, offset, size);
}

function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr, srcPtr, srcOffset, dstPtr, dstOffset, size) {
  encoderPtr >>>= 0;
  srcPtr >>>= 0;
  srcOffset = bigintToI53Checked(srcOffset);
  dstPtr >>>= 0;
  dstOffset = bigintToI53Checked(dstOffset);
  size = bigintToI53Checked(size);
  var commandEncoder = WebGPU.getJsObject(encoderPtr);
  var src = WebGPU.getJsObject(srcPtr);
  var dst = WebGPU.getJsObject(dstPtr);
  commandEncoder.copyBufferToBuffer(src, srcOffset, dst, dstOffset, size);
}

function _wgpuCommandEncoderCopyTextureToBuffer(encoderPtr, srcPtr, dstPtr, copySizePtr) {
  encoderPtr >>>= 0;
  srcPtr >>>= 0;
  dstPtr >>>= 0;
  copySizePtr >>>= 0;
  var commandEncoder = WebGPU.getJsObject(encoderPtr);
  var copySize = WebGPU.makeExtent3D(copySizePtr);
  commandEncoder.copyTextureToBuffer(WebGPU.makeTexelCopyTextureInfo(srcPtr), WebGPU.makeTexelCopyBufferInfo(dstPtr), copySize);
}

function _wgpuCommandEncoderFinish(encoderPtr, descriptor) {
  encoderPtr >>>= 0;
  descriptor >>>= 0;
  // TODO: Use the descriptor.
  var commandEncoder = WebGPU.getJsObject(encoderPtr);
  var ptr = _emwgpuCreateCommandBuffer(0);
  WebGPU.Internals.jsObjectInsert(ptr, commandEncoder.finish());
  return ptr;
}

var readI53FromI64 = ptr => HEAPU32[((ptr) >>> 2) >>> 0] + HEAP32[(((ptr) + (4)) >>> 2) >>> 0] * 4294967296;

function _wgpuDeviceCreateBindGroup(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
  function makeEntry(entryPtr) {
    assert(entryPtr);
    var bufferPtr = HEAPU32[(((entryPtr) + (8)) >>> 2) >>> 0];
    var samplerPtr = HEAPU32[(((entryPtr) + (32)) >>> 2) >>> 0];
    var textureViewPtr = HEAPU32[(((entryPtr) + (36)) >>> 2) >>> 0];
    assert((bufferPtr !== 0) + (samplerPtr !== 0) + (textureViewPtr !== 0) === 1);
    var binding = HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0];
    if (bufferPtr) {
      var size = readI53FromI64((entryPtr) + (24));
      if (size == -1) size = undefined;
      return {
        "binding": binding,
        "resource": {
          "buffer": WebGPU.getJsObject(bufferPtr),
          "offset": (HEAPU32[((((entryPtr + 4)) + (16)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((entryPtr) + (16)) >>> 2) >>> 0]),
          "size": size
        }
      };
    } else if (samplerPtr) {
      return {
        "binding": binding,
        "resource": WebGPU.getJsObject(samplerPtr)
      };
    } else {
      return {
        "binding": binding,
        "resource": WebGPU.getJsObject(textureViewPtr)
      };
    }
  }
  function makeEntries(count, entriesPtrs) {
    var entries = [];
    for (var i = 0; i < count; ++i) {
      entries.push(makeEntry(entriesPtrs + 40 * i));
    }
    return entries;
  }
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "layout": WebGPU.getJsObject(HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0]),
    "entries": makeEntries(HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0], HEAPU32[(((descriptor) + (20)) >>> 2) >>> 0])
  };
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreateBindGroup(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroup(desc));
  return ptr;
}

function _wgpuDeviceCreateBindGroupLayout(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
  function makeBufferEntry(entryPtr) {
    assert(entryPtr);
    var typeInt = HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0];
    if (!typeInt) return undefined;
    return {
      "type": WebGPU.BufferBindingType[typeInt],
      "hasDynamicOffset": !!(HEAPU32[(((entryPtr) + (8)) >>> 2) >>> 0]),
      "minBindingSize": (HEAPU32[((((entryPtr + 4)) + (16)) >>> 2) >>> 0] * 4294967296 + HEAPU32[(((entryPtr) + (16)) >>> 2) >>> 0])
    };
  }
  function makeSamplerEntry(entryPtr) {
    assert(entryPtr);
    var typeInt = HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0];
    if (!typeInt) return undefined;
    return {
      "type": WebGPU.SamplerBindingType[typeInt]
    };
  }
  function makeTextureEntry(entryPtr) {
    assert(entryPtr);
    var sampleTypeInt = HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0];
    if (!sampleTypeInt) return undefined;
    return {
      "sampleType": WebGPU.TextureSampleType[sampleTypeInt],
      "viewDimension": WebGPU.TextureViewDimension[HEAPU32[(((entryPtr) + (8)) >>> 2) >>> 0]],
      "multisampled": !!(HEAPU32[(((entryPtr) + (12)) >>> 2) >>> 0])
    };
  }
  function makeStorageTextureEntry(entryPtr) {
    assert(entryPtr);
    var accessInt = HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0];
    if (!accessInt) return undefined;
    return {
      "access": WebGPU.StorageTextureAccess[accessInt],
      "format": WebGPU.TextureFormat[HEAPU32[(((entryPtr) + (8)) >>> 2) >>> 0]],
      "viewDimension": WebGPU.TextureViewDimension[HEAPU32[(((entryPtr) + (12)) >>> 2) >>> 0]]
    };
  }
  function makeEntry(entryPtr) {
    assert(entryPtr);
    // bindingArraySize is not specced and thus not implemented yet. We don't pass it through
    // because if we did, then existing apps using this version of the bindings could break when
    // browsers start accepting bindingArraySize.
    var bindingArraySize = HEAPU32[(((entryPtr) + (16)) >>> 2) >>> 0];
    assert(bindingArraySize == 0 || bindingArraySize == 1);
    return {
      "binding": HEAPU32[(((entryPtr) + (4)) >>> 2) >>> 0],
      "visibility": HEAPU32[(((entryPtr) + (8)) >>> 2) >>> 0],
      "buffer": makeBufferEntry(entryPtr + 24),
      "sampler": makeSamplerEntry(entryPtr + 48),
      "texture": makeTextureEntry(entryPtr + 56),
      "storageTexture": makeStorageTextureEntry(entryPtr + 72)
    };
  }
  function makeEntries(count, entriesPtrs) {
    var entries = [];
    for (var i = 0; i < count; ++i) {
      entries.push(makeEntry(entriesPtrs + 88 * i));
    }
    return entries;
  }
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "entries": makeEntries(HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0], HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0])
  };
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreateBindGroupLayout(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createBindGroupLayout(desc));
  return ptr;
}

function _wgpuDeviceCreateCommandEncoder(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  var desc;
  if (descriptor) {
    assert(descriptor);
    assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
    desc = {
      "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4)
    };
  }
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreateCommandEncoder(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createCommandEncoder(desc));
  return ptr;
}

function _wgpuDeviceCreatePipelineLayout(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
  var bglCount = HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0];
  var bglPtr = HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0];
  var bgls = [];
  for (var i = 0; i < bglCount; ++i) {
    bgls.push(WebGPU.getJsObject(HEAPU32[(((bglPtr) + (4 * i)) >>> 2) >>> 0]));
  }
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "bindGroupLayouts": bgls
  };
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreatePipelineLayout(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createPipelineLayout(desc));
  return ptr;
}

function _wgpuDeviceCreateRenderPipeline(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  var desc = WebGPU.makeRenderPipelineDesc(descriptor);
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreateRenderPipeline(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createRenderPipeline(desc));
  return ptr;
}

function _wgpuDeviceCreateTexture(devicePtr, descriptor) {
  devicePtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
  var desc = {
    "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
    "size": WebGPU.makeExtent3D(descriptor + 28),
    "mipLevelCount": HEAPU32[(((descriptor) + (44)) >>> 2) >>> 0],
    "sampleCount": HEAPU32[(((descriptor) + (48)) >>> 2) >>> 0],
    "dimension": WebGPU.TextureDimension[HEAPU32[(((descriptor) + (24)) >>> 2) >>> 0]],
    "format": WebGPU.TextureFormat[HEAPU32[(((descriptor) + (40)) >>> 2) >>> 0]],
    "usage": HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0]
  };
  var viewFormatCount = HEAPU32[(((descriptor) + (52)) >>> 2) >>> 0];
  if (viewFormatCount) {
    var viewFormatsPtr = HEAPU32[(((descriptor) + (56)) >>> 2) >>> 0];
    // viewFormatsPtr pointer to an array of TextureFormat which is an enum of size uint32_t
    desc["viewFormats"] = Array.from(HEAP32.subarray((((viewFormatsPtr) >>> 2)) >>> 0, ((viewFormatsPtr + viewFormatCount * 4) >>> 2) >>> 0), format => WebGPU.TextureFormat[format]);
  }
  var device = WebGPU.getJsObject(devicePtr);
  var ptr = _emwgpuCreateTexture(0);
  WebGPU.Internals.jsObjectInsert(ptr, device.createTexture(desc));
  return ptr;
}

function _wgpuDeviceGetLimits(devicePtr, limitsOutPtr) {
  devicePtr >>>= 0;
  limitsOutPtr >>>= 0;
  var device = WebGPU.getJsObject(devicePtr);
  WebGPU.fillLimitStruct(device.limits, limitsOutPtr);
  return 1;
}

function _wgpuDevicePushErrorScope(devicePtr, filter) {
  devicePtr >>>= 0;
  var device = WebGPU.getJsObject(devicePtr);
  device.pushErrorScope(WebGPU.ErrorFilter[filter]);
}

var findCanvasEventTarget = findEventTarget;

function _wgpuInstanceCreateSurface(instancePtr, descriptor) {
  instancePtr >>>= 0;
  descriptor >>>= 0;
  assert(descriptor);
  var nextInChainPtr = HEAPU32[((descriptor) >>> 2) >>> 0];
  assert(nextInChainPtr !== 0);
  assert(262144 === HEAPU32[(((nextInChainPtr) + (4)) >>> 2) >>> 0]);
  var sourceCanvasHTMLSelector = nextInChainPtr;
  assert(sourceCanvasHTMLSelector);
  assert(HEAPU32[((sourceCanvasHTMLSelector) >>> 2) >>> 0] === 0);
  var selectorPtr = HEAPU32[(((sourceCanvasHTMLSelector) + (8)) >>> 2) >>> 0];
  assert(selectorPtr);
  var canvas = findCanvasEventTarget(selectorPtr);
  var context = canvas.getContext("webgpu");
  assert(context);
  if (!context) return 0;
  context.surfaceLabelWebGPU = WebGPU.makeStringFromOptionalStringView(descriptor + 4);
  var ptr = _emwgpuCreateSurface(0);
  WebGPU.Internals.jsObjectInsert(ptr, context);
  return ptr;
}

var _wgpuQueueSubmit = function(queuePtr, commandCount, commands) {
  queuePtr >>>= 0;
  commandCount >>>= 0;
  commands >>>= 0;
  assert(commands % 4 === 0);
  var queue = WebGPU.getJsObject(queuePtr);
  var cmds = Array.from(HEAP32.subarray((((commands) >>> 2)) >>> 0, ((commands + commandCount * 4) >>> 2) >>> 0), id => WebGPU.getJsObject(id));
  queue.submit(cmds);
};

function _wgpuQueueWriteBuffer(queuePtr, bufferPtr, bufferOffset, data, size) {
  queuePtr >>>= 0;
  bufferPtr >>>= 0;
  bufferOffset = bigintToI53Checked(bufferOffset);
  data >>>= 0;
  size >>>= 0;
  var queue = WebGPU.getJsObject(queuePtr);
  var buffer = WebGPU.getJsObject(bufferPtr);
  // There is a size limitation for ArrayBufferView. Work around by passing in a subarray
  // instead of the whole heap. crbug.com/1201109
  var subarray = HEAPU8.subarray(data >>> 0, data + size >>> 0);
  queue.writeBuffer(buffer, bufferOffset, subarray, 0, size);
}

function _wgpuRenderPassEncoderDraw(passPtr, vertexCount, instanceCount, firstVertex, firstInstance) {
  passPtr >>>= 0;
  var pass = WebGPU.getJsObject(passPtr);
  pass.draw(vertexCount, instanceCount, firstVertex, firstInstance);
}

function _wgpuRenderPassEncoderEnd(encoderPtr) {
  encoderPtr >>>= 0;
  var encoder = WebGPU.getJsObject(encoderPtr);
  encoder.end();
}

function _wgpuRenderPassEncoderSetBindGroup(passPtr, groupIndex, groupPtr, dynamicOffsetCount, dynamicOffsetsPtr) {
  passPtr >>>= 0;
  groupPtr >>>= 0;
  dynamicOffsetCount >>>= 0;
  dynamicOffsetsPtr >>>= 0;
  var pass = WebGPU.getJsObject(passPtr);
  var group = WebGPU.getJsObject(groupPtr);
  if (dynamicOffsetCount == 0) {
    pass.setBindGroup(groupIndex, group);
  } else {
    pass.setBindGroup(groupIndex, group, HEAPU32, ((dynamicOffsetsPtr) >>> 2), dynamicOffsetCount);
  }
}

function _wgpuRenderPassEncoderSetPipeline(passPtr, pipelinePtr) {
  passPtr >>>= 0;
  pipelinePtr >>>= 0;
  var pass = WebGPU.getJsObject(passPtr);
  var pipeline = WebGPU.getJsObject(pipelinePtr);
  pass.setPipeline(pipeline);
}

function _wgpuRenderPassEncoderSetScissorRect(passPtr, x, y, w, h) {
  passPtr >>>= 0;
  var pass = WebGPU.getJsObject(passPtr);
  pass.setScissorRect(x, y, w, h);
}

function _wgpuRenderPassEncoderSetVertexBuffer(passPtr, slot, bufferPtr, offset, size) {
  passPtr >>>= 0;
  bufferPtr >>>= 0;
  offset = bigintToI53Checked(offset);
  size = bigintToI53Checked(size);
  var pass = WebGPU.getJsObject(passPtr);
  var buffer = WebGPU.getJsObject(bufferPtr);
  if (size == -1) size = undefined;
  pass.setVertexBuffer(slot, buffer, offset, size);
}

function _wgpuRenderPassEncoderSetViewport(passPtr, x, y, w, h, minDepth, maxDepth) {
  passPtr >>>= 0;
  var pass = WebGPU.getJsObject(passPtr);
  pass.setViewport(x, y, w, h, minDepth, maxDepth);
}

function _wgpuSurfaceConfigure(surfacePtr, config) {
  surfacePtr >>>= 0;
  config >>>= 0;
  assert(config);
  var devicePtr = HEAPU32[(((config) + (4)) >>> 2) >>> 0];
  var context = WebGPU.getJsObject(surfacePtr);
  var presentMode = HEAPU32[(((config) + (44)) >>> 2) >>> 0];
  assert(presentMode === 1 || presentMode === 0);
  var canvasSize = [ HEAPU32[(((config) + (24)) >>> 2) >>> 0], HEAPU32[(((config) + (28)) >>> 2) >>> 0] ];
  if (canvasSize[0] !== 0) {
    context["canvas"]["width"] = canvasSize[0];
  }
  if (canvasSize[1] !== 0) {
    context["canvas"]["height"] = canvasSize[1];
  }
  var configuration = {
    "device": WebGPU.getJsObject(devicePtr),
    "format": WebGPU.TextureFormat[HEAPU32[(((config) + (8)) >>> 2) >>> 0]],
    "usage": HEAPU32[(((config) + (16)) >>> 2) >>> 0],
    "alphaMode": WebGPU.CompositeAlphaMode[HEAPU32[(((config) + (40)) >>> 2) >>> 0]]
  };
  var viewFormatCount = HEAPU32[(((config) + (32)) >>> 2) >>> 0];
  if (viewFormatCount) {
    var viewFormatsPtr = HEAPU32[(((config) + (36)) >>> 2) >>> 0];
    // viewFormatsPtr pointer to an array of TextureFormat which is an enum of size uint32_t
    configuration["viewFormats"] = Array.from(HEAP32.subarray((((viewFormatsPtr) >>> 2)) >>> 0, ((viewFormatsPtr + viewFormatCount * 4) >>> 2) >>> 0), format => WebGPU.TextureFormat[format]);
  }
  {
    var nextInChainPtr = HEAPU32[((config) >>> 2) >>> 0];
    if (nextInChainPtr !== 0) {
      var sType = HEAPU32[(((nextInChainPtr) + (4)) >>> 2) >>> 0];
      assert(sType === 10);
      assert(0 === HEAPU32[((nextInChainPtr) >>> 2) >>> 0]);
      var surfaceColorManagement = nextInChainPtr;
      assert(surfaceColorManagement);
      assert(HEAPU32[((surfaceColorManagement) >>> 2) >>> 0] === 0);
      configuration.colorSpace = WebGPU.PredefinedColorSpace[HEAPU32[(((surfaceColorManagement) + (8)) >>> 2) >>> 0]];
      configuration.toneMapping = {
        mode: WebGPU.ToneMappingMode[HEAPU32[(((surfaceColorManagement) + (12)) >>> 2) >>> 0]]
      };
    }
  }
  context.configure(configuration);
}

function _wgpuSurfaceGetCurrentTexture(surfacePtr, surfaceTexturePtr) {
  surfacePtr >>>= 0;
  surfaceTexturePtr >>>= 0;
  assert(surfaceTexturePtr);
  var context = WebGPU.getJsObject(surfacePtr);
  try {
    var texturePtr = _emwgpuCreateTexture(0);
    WebGPU.Internals.jsObjectInsert(texturePtr, context.getCurrentTexture());
    HEAPU32[(((surfaceTexturePtr) + (4)) >>> 2) >>> 0] = texturePtr;
    HEAP32[(((surfaceTexturePtr) + (8)) >>> 2) >>> 0] = 1;
  } catch (ex) {
    err(`wgpuSurfaceGetCurrentTexture() failed: ${ex}`);
    HEAPU32[(((surfaceTexturePtr) + (4)) >>> 2) >>> 0] = 0;
    HEAP32[(((surfaceTexturePtr) + (8)) >>> 2) >>> 0] = 6;
  }
}

function _wgpuTextureCreateView(texturePtr, descriptor) {
  texturePtr >>>= 0;
  descriptor >>>= 0;
  var desc;
  if (descriptor) {
    assert(descriptor);
    assert(HEAPU32[((descriptor) >>> 2) >>> 0] === 0);
    var mipLevelCount = HEAPU32[(((descriptor) + (24)) >>> 2) >>> 0];
    var arrayLayerCount = HEAPU32[(((descriptor) + (32)) >>> 2) >>> 0];
    desc = {
      "label": WebGPU.makeStringFromOptionalStringView(descriptor + 4),
      "format": WebGPU.TextureFormat[HEAPU32[(((descriptor) + (12)) >>> 2) >>> 0]],
      "dimension": WebGPU.TextureViewDimension[HEAPU32[(((descriptor) + (16)) >>> 2) >>> 0]],
      "baseMipLevel": HEAPU32[(((descriptor) + (20)) >>> 2) >>> 0],
      "mipLevelCount": mipLevelCount === 4294967295 ? undefined : mipLevelCount,
      "baseArrayLayer": HEAPU32[(((descriptor) + (28)) >>> 2) >>> 0],
      "arrayLayerCount": arrayLayerCount === 4294967295 ? undefined : arrayLayerCount,
      "aspect": WebGPU.TextureAspect[HEAPU32[(((descriptor) + (36)) >>> 2) >>> 0]]
    };
  }
  var texture = WebGPU.getJsObject(texturePtr);
  var ptr = _emwgpuCreateTextureView(0);
  WebGPU.Internals.jsObjectInsert(ptr, texture.createView(desc));
  return ptr;
}

var handleException = e => {
  // Certain exception types we do not treat as errors since they are used for
  // internal control flow.
  // 1. ExitStatus, which is thrown by exit()
  // 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
  //    that wish to return to JS event loop.
  if (e instanceof ExitStatus || e == "unwind") {
    return EXITSTATUS;
  }
  checkStackCookie();
  if (e instanceof WebAssembly.RuntimeError) {
    if (_emscripten_stack_get_current() <= 0) {
      err("Stack overflow detected.  You can try increasing -sSTACK_SIZE (currently set to 65536)");
    }
  }
  quit_(1, e);
};

var getCFunc = ident => {
  var func = Module["_" + ident];
  // closure exported function
  assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
  return func;
};

var writeArrayToMemory = (array, buffer) => {
  assert(array.length >= 0, "writeArrayToMemory array must have a length (should be an array or typed array)");
  HEAP8.set(array, buffer >>> 0);
};

/**
     * @param {string|null=} returnType
     * @param {Array=} argTypes
     * @param {Arguments|Array=} args
     * @param {Object=} opts
     */ var ccall = (ident, returnType, argTypes, args, opts) => {
  // For fast lookup of conversion functions
  var toC = {
    "string": str => {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) {
        // null string
        ret = stringToUTF8OnStack(str);
      }
      return ret;
    },
    "array": arr => {
      var ret = stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    }
  };
  function convertReturnValue(ret) {
    if (returnType === "string") {
      return UTF8ToString(ret);
    }
    if (returnType === "boolean") return Boolean(ret);
    return ret;
  }
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== "array", 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func(...cArgs);
  function onDone(ret) {
    if (stack !== 0) stackRestore(stack);
    return convertReturnValue(ret);
  }
  ret = onDone(ret);
  return ret;
};

var FS_createPath = (...args) => FS.createPath(...args);

var FS_unlink = (...args) => FS.unlink(...args);

var FS_createLazyFile = (...args) => FS.createLazyFile(...args);

var FS_createDevice = (...args) => FS.createDevice(...args);

FS.createPreloadedFile = FS_createPreloadedFile;

FS.staticInit();

// End JS library code
// include: postlibrary.js
// This file is included after the automatically-generated JS library code
// but before the wasm module is created.
{
  // Begin ATMODULES hooks
  if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
  if (Module["preloadPlugins"]) preloadPlugins = Module["preloadPlugins"];
  if (Module["print"]) out = Module["print"];
  if (Module["printErr"]) err = Module["printErr"];
  if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
  // End ATMODULES hooks
  checkIncomingModuleAPI();
  if (Module["arguments"]) arguments_ = Module["arguments"];
  if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
  // Assertions on removed incoming Module JS APIs.
  assert(typeof Module["memoryInitializerPrefixURL"] == "undefined", "Module.memoryInitializerPrefixURL option was removed, use Module.locateFile instead");
  assert(typeof Module["pthreadMainPrefixURL"] == "undefined", "Module.pthreadMainPrefixURL option was removed, use Module.locateFile instead");
  assert(typeof Module["cdInitializerPrefixURL"] == "undefined", "Module.cdInitializerPrefixURL option was removed, use Module.locateFile instead");
  assert(typeof Module["filePackagePrefixURL"] == "undefined", "Module.filePackagePrefixURL option was removed, use Module.locateFile instead");
  assert(typeof Module["read"] == "undefined", "Module.read option was removed");
  assert(typeof Module["readAsync"] == "undefined", "Module.readAsync option was removed (modify readAsync in JS)");
  assert(typeof Module["readBinary"] == "undefined", "Module.readBinary option was removed (modify readBinary in JS)");
  assert(typeof Module["setWindowTitle"] == "undefined", "Module.setWindowTitle option was removed (modify emscripten_set_window_title in JS)");
  assert(typeof Module["TOTAL_MEMORY"] == "undefined", "Module.TOTAL_MEMORY has been renamed Module.INITIAL_MEMORY");
  assert(typeof Module["ENVIRONMENT"] == "undefined", "Module.ENVIRONMENT has been deprecated. To force the environment, use the ENVIRONMENT compile-time option (for example, -sENVIRONMENT=web or -sENVIRONMENT=node)");
  assert(typeof Module["STACK_SIZE"] == "undefined", "STACK_SIZE can no longer be set at runtime.  Use -sSTACK_SIZE at link time");
  // If memory is defined in wasm, the user can't provide it, or set INITIAL_MEMORY
  assert(typeof Module["wasmMemory"] == "undefined", "Use of `wasmMemory` detected.  Use -sIMPORTED_MEMORY to define wasmMemory externally");
  assert(typeof Module["INITIAL_MEMORY"] == "undefined", "Detected runtime INITIAL_MEMORY setting.  Use -sIMPORTED_MEMORY to define wasmMemory dynamically");
}

// Begin runtime exports
Module["addRunDependency"] = addRunDependency;

Module["removeRunDependency"] = removeRunDependency;

Module["ccall"] = ccall;

Module["UTF8ToString"] = UTF8ToString;

Module["FS_createPreloadedFile"] = FS_createPreloadedFile;

Module["FS_unlink"] = FS_unlink;

Module["FS_createPath"] = FS_createPath;

Module["FS_createDevice"] = FS_createDevice;

Module["FS_createDataFile"] = FS_createDataFile;

Module["FS_createLazyFile"] = FS_createLazyFile;

var missingLibrarySymbols = [ "writeI53ToI64", "writeI53ToI64Clamped", "writeI53ToI64Signaling", "writeI53ToU64Clamped", "writeI53ToU64Signaling", "readI53FromU64", "convertI32PairToI53", "convertI32PairToI53Checked", "convertU32PairToI53", "getTempRet0", "setTempRet0", "zeroMemory", "withStackSave", "inetPton4", "inetNtop4", "inetPton6", "inetNtop6", "readSockaddr", "writeSockaddr", "emscriptenLog", "runMainThreadEmAsm", "jstoi_q", "autoResumeAudioContext", "getDynCaller", "dynCall", "runtimeKeepalivePush", "runtimeKeepalivePop", "callUserCallback", "maybeExit", "asmjsMangle", "HandleAllocator", "getNativeTypeSize", "addOnInit", "addOnPostCtor", "addOnPreMain", "STACK_SIZE", "STACK_ALIGN", "POINTER_SIZE", "ASSERTIONS", "cwrap", "uleb128Encode", "sigToWasmTypes", "generateFuncType", "convertJsFunctionToWasm", "getEmptyTableSlot", "updateTableMap", "getFunctionAddress", "addFunction", "removeFunction", "reallyNegative", "unSign", "strLen", "reSign", "formatString", "intArrayToString", "AsciiToString", "stringToAscii", "UTF16ToString", "stringToUTF16", "lengthBytesUTF16", "UTF32ToString", "stringToUTF32", "lengthBytesUTF32", "registerUiEventCallback", "registerFocusEventCallback", "fillDeviceOrientationEventData", "registerDeviceOrientationEventCallback", "fillDeviceMotionEventData", "registerDeviceMotionEventCallback", "screenOrientation", "fillOrientationChangeEventData", "registerOrientationChangeEventCallback", "fillFullscreenChangeEventData", "registerFullscreenChangeEventCallback", "JSEvents_requestFullscreen", "JSEvents_resizeCanvasForFullscreen", "registerRestoreOldStyle", "hideEverythingExceptGivenElement", "restoreHiddenElements", "setLetterbox", "softFullscreenResizeWebGLRenderTarget", "doRequestFullscreen", "registerPointerlockErrorEventCallback", "fillVisibilityChangeEventData", "registerVisibilityChangeEventCallback", "registerTouchEventCallback", "fillGamepadEventData", "registerGamepadEventCallback", "registerBeforeUnloadEventCallback", "fillBatteryEventData", "battery", "registerBatteryEventCallback", "setCanvasElementSize", "getCanvasElementSize", "jsStackTrace", "getCallstack", "convertPCtoSourceLocation", "wasiRightsToMuslOFlags", "wasiOFlagsToMuslOFlags", "safeSetTimeout", "setImmediateWrapped", "safeRequestAnimationFrame", "clearImmediateWrapped", "registerPostMainLoop", "registerPreMainLoop", "getPromise", "makePromise", "idsToPromises", "makePromiseCallback", "findMatchingCatch", "Browser_asyncPrepareDataCounter", "isLeapYear", "ydayFromDate", "arraySum", "addDays", "getSocketFromFD", "getSocketAddress", "FS_mkdirTree", "_setNetworkCallback", "heapObjectForWebGLType", "toTypedArrayIndex", "webgl_enable_ANGLE_instanced_arrays", "webgl_enable_OES_vertex_array_object", "webgl_enable_WEBGL_draw_buffers", "webgl_enable_WEBGL_multi_draw", "webgl_enable_EXT_polygon_offset_clamp", "webgl_enable_EXT_clip_control", "webgl_enable_WEBGL_polygon_mode", "emscriptenWebGLGet", "computeUnpackAlignedImageSize", "colorChannelsInGlTextureFormat", "emscriptenWebGLGetTexPixelData", "emscriptenWebGLGetUniform", "webglGetUniformLocation", "webglPrepareUniformLocationsBeforeFirstUse", "webglGetLeftBracePos", "emscriptenWebGLGetVertexAttrib", "__glGetActiveAttribOrUniform", "writeGLArray", "registerWebGlEventCallback", "runAndAbortIfError", "ALLOC_NORMAL", "ALLOC_STACK", "allocate", "writeStringToMemory", "writeAsciiToMemory", "demangle", "stackTrace", "fetchDeleteCachedData", "fetchLoadCachedData", "fetchCacheData", "fetchXHR" ];

missingLibrarySymbols.forEach(missingLibrarySymbol);

var unexportedSymbols = [ "run", "out", "err", "callMain", "abort", "wasmMemory", "wasmExports", "HEAP8", "HEAP16", "HEAPU16", "HEAP32", "HEAP64", "HEAPU64", "writeStackCookie", "checkStackCookie", "readI53FromI64", "INT53_MAX", "INT53_MIN", "bigintToI53Checked", "stackSave", "stackRestore", "stackAlloc", "ptrToString", "exitJS", "getHeapMax", "growMemory", "ENV", "ERRNO_CODES", "strError", "DNS", "Protocols", "Sockets", "timers", "warnOnce", "readEmAsmArgsArray", "readEmAsmArgs", "runEmAsmFunction", "getExecutableName", "handleException", "keepRuntimeAlive", "asyncLoad", "alignMemory", "mmapAlloc", "wasmTable", "getUniqueRunDependency", "noExitRuntime", "addOnPreRun", "addOnExit", "addOnPostRun", "freeTableIndexes", "functionsInTableMap", "setValue", "getValue", "PATH", "PATH_FS", "UTF8Decoder", "UTF8ArrayToString", "stringToUTF8Array", "stringToUTF8", "lengthBytesUTF8", "intArrayFromString", "UTF16Decoder", "stringToNewUTF8", "stringToUTF8OnStack", "writeArrayToMemory", "JSEvents", "registerKeyEventCallback", "specialHTMLTargets", "maybeCStringToJsString", "findEventTarget", "findCanvasEventTarget", "getBoundingClientRect", "fillMouseEventData", "registerMouseEventCallback", "registerWheelEventCallback", "currentFullscreenStrategy", "restoreOldWindowedStyle", "fillPointerlockChangeEventData", "registerPointerlockChangeEventCallback", "requestPointerLock", "UNWIND_CACHE", "ExitStatus", "getEnvStrings", "checkWasiClock", "doReadv", "doWritev", "initRandomFill", "randomFill", "emSetImmediate", "emClearImmediate_deps", "emClearImmediate", "promiseMap", "uncaughtExceptionCount", "exceptionLast", "exceptionCaught", "ExceptionInfo", "Browser", "requestFullscreen", "requestFullScreen", "setCanvasSize", "getUserMedia", "createContext", "getPreloadedImageData__data", "wget", "MONTH_DAYS_REGULAR", "MONTH_DAYS_LEAP", "MONTH_DAYS_REGULAR_CUMULATIVE", "MONTH_DAYS_LEAP_CUMULATIVE", "SYSCALLS", "preloadPlugins", "FS_modeStringToFlags", "FS_getMode", "FS_stdin_getChar_buffer", "FS_stdin_getChar", "FS_readFile", "FS", "FS_root", "FS_mounts", "FS_devices", "FS_streams", "FS_nextInode", "FS_nameTable", "FS_currentPath", "FS_initialized", "FS_ignorePermissions", "FS_filesystems", "FS_syncFSRequests", "FS_readFiles", "FS_lookupPath", "FS_getPath", "FS_hashName", "FS_hashAddNode", "FS_hashRemoveNode", "FS_lookupNode", "FS_createNode", "FS_destroyNode", "FS_isRoot", "FS_isMountpoint", "FS_isFile", "FS_isDir", "FS_isLink", "FS_isChrdev", "FS_isBlkdev", "FS_isFIFO", "FS_isSocket", "FS_flagsToPermissionString", "FS_nodePermissions", "FS_mayLookup", "FS_mayCreate", "FS_mayDelete", "FS_mayOpen", "FS_checkOpExists", "FS_nextfd", "FS_getStreamChecked", "FS_getStream", "FS_createStream", "FS_closeStream", "FS_dupStream", "FS_doSetAttr", "FS_chrdev_stream_ops", "FS_major", "FS_minor", "FS_makedev", "FS_registerDevice", "FS_getDevice", "FS_getMounts", "FS_syncfs", "FS_mount", "FS_unmount", "FS_lookup", "FS_mknod", "FS_statfs", "FS_statfsStream", "FS_statfsNode", "FS_create", "FS_mkdir", "FS_mkdev", "FS_symlink", "FS_rename", "FS_rmdir", "FS_readdir", "FS_readlink", "FS_stat", "FS_fstat", "FS_lstat", "FS_doChmod", "FS_chmod", "FS_lchmod", "FS_fchmod", "FS_doChown", "FS_chown", "FS_lchown", "FS_fchown", "FS_doTruncate", "FS_truncate", "FS_ftruncate", "FS_utime", "FS_open", "FS_close", "FS_isClosed", "FS_llseek", "FS_read", "FS_write", "FS_mmap", "FS_msync", "FS_ioctl", "FS_writeFile", "FS_cwd", "FS_chdir", "FS_createDefaultDirectories", "FS_createDefaultDevices", "FS_createSpecialDirectories", "FS_createStandardStreams", "FS_staticInit", "FS_init", "FS_quit", "FS_findObject", "FS_analyzePath", "FS_createFile", "FS_forceLoadFile", "FS_absolutePath", "FS_createFolder", "FS_createLink", "FS_joinPath", "FS_mmapAlloc", "FS_standardizePath", "MEMFS", "TTY", "PIPEFS", "SOCKFS", "tempFixedLengthArray", "miniTempWebGLFloatBuffers", "miniTempWebGLIntBuffers", "GL", "AL", "GLUT", "EGL", "GLEW", "IDBStore", "SDL", "SDL_gfx", "allocateUTF8", "allocateUTF8OnStack", "print", "printErr", "jstoi_s", "Fetch", "WebGPU" ];

unexportedSymbols.forEach(unexportedRuntimeSymbol);

// End runtime exports
// Begin JS library exports
// End JS library exports
// end include: postlibrary.js
function checkIncomingModuleAPI() {
  ignoredModuleProp("fetchSettings");
}

var ASM_CONSTS = {
  142064: $0 => {
    if (Module.__ifcvOnObjectsDone) Module.__ifcvOnObjectsDone($0);
  },
  142132: () => {
    if (Module.__ifcvOnSelectionChange) Module.__ifcvOnSelectionChange();
  },
  142206: ($0, $1) => {
    if (Module.__ifcvOnModelLoaded) Module.__ifcvOnModelLoaded($0, $1);
  },
  142278: ($0, $1) => {
    if (Module.__ifcvOnObjectsBatch) Module.__ifcvOnObjectsBatch($0, UTF8ToString($1));
  },
  142366: $0 => {
    if (Module.__ifcvOnObjectsDone) Module.__ifcvOnObjectsDone($0);
  },
  142434: $0 => {
    Module._app_ptr = $0;
  },
  142460: $0 => {
    var c = document.querySelector(UTF8ToString($0));
    if (c) c.addEventListener("contextmenu", function(ev) {
      ev.preventDefault();
    });
  },
  142595: () => {
    var c = document.getElementById("viewer-canvas");
    return c ? c.getBoundingClientRect().left : 0;
  },
  142696: () => {
    var c = document.getElementById("viewer-canvas");
    return c ? c.getBoundingClientRect().top : 0;
  },
  142796: ($0, $1, $2, $3) => {
    var m = document.getElementById("marquee");
    if (m) {
      m.style.display = "block";
      m.style.left = $0 + "px";
      m.style.top = $1 + "px";
      m.style.width = $2 + "px";
      m.style.height = $3 + "px";
    }
  },
  142988: () => {
    var m = document.getElementById("marquee");
    if (m) m.style.display = "none";
  },
  143069: () => {
    if (Module.__ifcvOnSelect) Module.__ifcvOnSelect(0, "", -1, -1);
  },
  143138: ($0, $1, $2, $3) => {
    if (Module.__ifcvOnSelect) Module.__ifcvOnSelect($0, UTF8ToString($1), $2, $3);
  }
};

function ifcvSourceSize(sid) {
  var s = Module["__ifcvSources"] && Module["__ifcvSources"][sid];
  return s ? (s.size || 0) : 0;
}

function ifcvReadRangeInto(sid, reqId, offset, size, dst) {
  var deliver = function(ok, buf) {
    if (ok && buf) {
      HEAPU8.set(new Uint8Array(buf), dst >>> 0);
      Module["__ifcvBytesLoaded"] = (Module["__ifcvBytesLoaded"] || 0) + buf.byteLength;
    }
    Module["_ifcv_on_range_done"](reqId, ok ? 1 : 0);
  };
  var s = Module["__ifcvSources"] && Module["__ifcvSources"][sid];
  if (s && s.file) {
    s.file.slice(offset, offset + size).arrayBuffer().then(function(buf) {
      deliver(1, buf);
    }).catch(function(e) {
      deliver(0, null);
    });
    return;
  }
  if (s && s.url) {
    var end = offset + size - 1;
    fetch(s.url, {
      headers: {
        "Range": "bytes=" + offset + "-" + end
      }
    }).then(function(resp) {
      if (resp.status !== 206 && resp.status !== 200) {
        deliver(0, null);
        return;
      }
      var full = resp.status === 200;
      return resp.arrayBuffer().then(function(buf) {
        if (full && buf.byteLength > size) buf = buf.slice(offset, offset + size);
        deliver(1, buf);
      });
    }).catch(function(e) {
      deliver(0, null);
    });
    return;
  }
  Module["_ifcv_on_range_done"](reqId, 0);
}

function ifcv_set_bind_group_dynamic_js(pass, group_index, group, offsets_ptr, count) {
  var start = offsets_ptr >>> 2;
  var small = HEAPU32.slice(start, start + count);
  WebGPU.getJsObject(pass).setBindGroup(group_index, WebGPU.getJsObject(group), small, 0, count);
}

// Imports from the Wasm binary.
var _raf_tick_c = Module["_raf_tick_c"] = makeInvalidEarlyAccess("_raf_tick_c");

var _load_ifcview_from_source_c = Module["_load_ifcview_from_source_c"] = makeInvalidEarlyAccess("_load_ifcview_from_source_c");

var _clear_scene_c = Module["_clear_scene_c"] = makeInvalidEarlyAccess("_clear_scene_c");

var _view_all_c = Module["_view_all_c"] = makeInvalidEarlyAccess("_view_all_c");

var _frame_selection_c = Module["_frame_selection_c"] = makeInvalidEarlyAccess("_frame_selection_c");

var _toggle_projection_c = Module["_toggle_projection_c"] = makeInvalidEarlyAccess("_toggle_projection_c");

var _projection_is_ortho_c = Module["_projection_is_ortho_c"] = makeInvalidEarlyAccess("_projection_is_ortho_c");

var _toggle_fly_c = Module["_toggle_fly_c"] = makeInvalidEarlyAccess("_toggle_fly_c");

var _fly_is_active_c = Module["_fly_is_active_c"] = makeInvalidEarlyAccess("_fly_is_active_c");

var _hide_selected_c = Module["_hide_selected_c"] = makeInvalidEarlyAccess("_hide_selected_c");

var _isolate_selected_c = Module["_isolate_selected_c"] = makeInvalidEarlyAccess("_isolate_selected_c");

var _show_all_c = Module["_show_all_c"] = makeInvalidEarlyAccess("_show_all_c");

var _hide_all_c = Module["_hide_all_c"] = makeInvalidEarlyAccess("_hide_all_c");

var _toggle_xray_c = Module["_toggle_xray_c"] = makeInvalidEarlyAccess("_toggle_xray_c");

var _xray_is_active_c = Module["_xray_is_active_c"] = makeInvalidEarlyAccess("_xray_is_active_c");

var _ifcv_set_selection_outline_c = Module["_ifcv_set_selection_outline_c"] = makeInvalidEarlyAccess("_ifcv_set_selection_outline_c");

var _ifcv_selection_outline_is_on_c = Module["_ifcv_selection_outline_is_on_c"] = makeInvalidEarlyAccess("_ifcv_selection_outline_is_on_c");

var _ifcv_get_camera_c = Module["_ifcv_get_camera_c"] = makeInvalidEarlyAccess("_ifcv_get_camera_c");

var _ifcv_set_camera_c = Module["_ifcv_set_camera_c"] = makeInvalidEarlyAccess("_ifcv_set_camera_c");

var _ifcv_set_ortho_c = Module["_ifcv_set_ortho_c"] = makeInvalidEarlyAccess("_ifcv_set_ortho_c");

var _ifcv_set_background_c = Module["_ifcv_set_background_c"] = makeInvalidEarlyAccess("_ifcv_set_background_c");

var _ifcv_set_nav_preset_c = Module["_ifcv_set_nav_preset_c"] = makeInvalidEarlyAccess("_ifcv_set_nav_preset_c");

var _ifcv_get_selection_c = Module["_ifcv_get_selection_c"] = makeInvalidEarlyAccess("_ifcv_get_selection_c");

var _ifcv_get_active_object_c = Module["_ifcv_get_active_object_c"] = makeInvalidEarlyAccess("_ifcv_get_active_object_c");

var _ifcv_apply_selection_c = Module["_ifcv_apply_selection_c"] = makeInvalidEarlyAccess("_ifcv_apply_selection_c");

var _ifcv_set_visible_c = Module["_ifcv_set_visible_c"] = makeInvalidEarlyAccess("_ifcv_set_visible_c");

var _ifcv_get_hidden_c = Module["_ifcv_get_hidden_c"] = makeInvalidEarlyAccess("_ifcv_get_hidden_c");

var _ifcv_set_color_c = Module["_ifcv_set_color_c"] = makeInvalidEarlyAccess("_ifcv_set_color_c");

var _ifcv_clear_colors_c = Module["_ifcv_clear_colors_c"] = makeInvalidEarlyAccess("_ifcv_clear_colors_c");

var _ifcv_set_federation_unit_c = Module["_ifcv_set_federation_unit_c"] = makeInvalidEarlyAccess("_ifcv_set_federation_unit_c");

var _ifcv_set_false_origin_c = Module["_ifcv_set_false_origin_c"] = makeInvalidEarlyAccess("_ifcv_set_false_origin_c");

var _ifcv_get_false_origin_c = Module["_ifcv_get_false_origin_c"] = makeInvalidEarlyAccess("_ifcv_get_false_origin_c");

var _ifcv_set_model_transform_c = Module["_ifcv_set_model_transform_c"] = makeInvalidEarlyAccess("_ifcv_set_model_transform_c");

var _ifcv_clear_model_transform_c = Module["_ifcv_clear_model_transform_c"] = makeInvalidEarlyAccess("_ifcv_clear_model_transform_c");

var _ifcv_set_model_name_c = Module["_ifcv_set_model_name_c"] = makeInvalidEarlyAccess("_ifcv_set_model_name_c");

var _ifcv_get_model_georef_c = Module["_ifcv_get_model_georef_c"] = makeInvalidEarlyAccess("_ifcv_get_model_georef_c");

var _ifcv_request_objects_c = Module["_ifcv_request_objects_c"] = makeInvalidEarlyAccess("_ifcv_request_objects_c");

var _toggle_section_c = Module["_toggle_section_c"] = makeInvalidEarlyAccess("_toggle_section_c");

var _fflush = makeInvalidEarlyAccess("_fflush");

var _clear_section_c = Module["_clear_section_c"] = makeInvalidEarlyAccess("_clear_section_c");

var _section_is_active_c = Module["_section_is_active_c"] = makeInvalidEarlyAccess("_section_is_active_c");

var _standard_view_c = Module["_standard_view_c"] = makeInvalidEarlyAccess("_standard_view_c");

var _ifcv_chunks_resident_c = Module["_ifcv_chunks_resident_c"] = makeInvalidEarlyAccess("_ifcv_chunks_resident_c");

var _ifcv_chunks_total_c = Module["_ifcv_chunks_total_c"] = makeInvalidEarlyAccess("_ifcv_chunks_total_c");

var _ifcv_model_count_c = Module["_ifcv_model_count_c"] = makeInvalidEarlyAccess("_ifcv_model_count_c");

var _ifcv_model_resident_c = Module["_ifcv_model_resident_c"] = makeInvalidEarlyAccess("_ifcv_model_resident_c");

var _ifcv_model_total_c = Module["_ifcv_model_total_c"] = makeInvalidEarlyAccess("_ifcv_model_total_c");

var _ifcv_bytes_total_c = Module["_ifcv_bytes_total_c"] = makeInvalidEarlyAccess("_ifcv_bytes_total_c");

var _ifcv_bytes_needed_c = Module["_ifcv_bytes_needed_c"] = makeInvalidEarlyAccess("_ifcv_bytes_needed_c");

var _ifcv_bytes_loaded_c = Module["_ifcv_bytes_loaded_c"] = makeInvalidEarlyAccess("_ifcv_bytes_loaded_c");

var _ifcv_get_frame_stats_c = Module["_ifcv_get_frame_stats_c"] = makeInvalidEarlyAccess("_ifcv_get_frame_stats_c");

var _ifcv_unload_model_c = Module["_ifcv_unload_model_c"] = makeInvalidEarlyAccess("_ifcv_unload_model_c");

var _ifcv_load_model_c = Module["_ifcv_load_model_c"] = makeInvalidEarlyAccess("_ifcv_load_model_c");

var _ifcv_model_unloaded_c = Module["_ifcv_model_unloaded_c"] = makeInvalidEarlyAccess("_ifcv_model_unloaded_c");

var _ifcv_model_vram_bytes_c = Module["_ifcv_model_vram_bytes_c"] = makeInvalidEarlyAccess("_ifcv_model_vram_bytes_c");

var _main = Module["_main"] = makeInvalidEarlyAccess("_main");

var _ifcv_on_range_done = Module["_ifcv_on_range_done"] = makeInvalidEarlyAccess("_ifcv_on_range_done");

var _free = Module["_free"] = makeInvalidEarlyAccess("_free");

var _malloc = Module["_malloc"] = makeInvalidEarlyAccess("_malloc");

var _emwgpuCreateBindGroup = makeInvalidEarlyAccess("_emwgpuCreateBindGroup");

var _emwgpuCreateBindGroupLayout = makeInvalidEarlyAccess("_emwgpuCreateBindGroupLayout");

var _emwgpuCreateCommandBuffer = makeInvalidEarlyAccess("_emwgpuCreateCommandBuffer");

var _emwgpuCreateCommandEncoder = makeInvalidEarlyAccess("_emwgpuCreateCommandEncoder");

var _emwgpuCreateComputePassEncoder = makeInvalidEarlyAccess("_emwgpuCreateComputePassEncoder");

var _emwgpuCreateComputePipeline = makeInvalidEarlyAccess("_emwgpuCreateComputePipeline");

var _emwgpuCreatePipelineLayout = makeInvalidEarlyAccess("_emwgpuCreatePipelineLayout");

var _emwgpuCreateQuerySet = makeInvalidEarlyAccess("_emwgpuCreateQuerySet");

var _emwgpuCreateRenderBundle = makeInvalidEarlyAccess("_emwgpuCreateRenderBundle");

var _emwgpuCreateRenderBundleEncoder = makeInvalidEarlyAccess("_emwgpuCreateRenderBundleEncoder");

var _emwgpuCreateRenderPassEncoder = makeInvalidEarlyAccess("_emwgpuCreateRenderPassEncoder");

var _emwgpuCreateRenderPipeline = makeInvalidEarlyAccess("_emwgpuCreateRenderPipeline");

var _emwgpuCreateSampler = makeInvalidEarlyAccess("_emwgpuCreateSampler");

var _emwgpuCreateSurface = makeInvalidEarlyAccess("_emwgpuCreateSurface");

var _emwgpuCreateTexture = makeInvalidEarlyAccess("_emwgpuCreateTexture");

var _emwgpuCreateTextureView = makeInvalidEarlyAccess("_emwgpuCreateTextureView");

var _emwgpuCreateAdapter = makeInvalidEarlyAccess("_emwgpuCreateAdapter");

var _emwgpuCreateBuffer = makeInvalidEarlyAccess("_emwgpuCreateBuffer");

var _emwgpuCreateDevice = makeInvalidEarlyAccess("_emwgpuCreateDevice");

var _emwgpuCreateQueue = makeInvalidEarlyAccess("_emwgpuCreateQueue");

var _emwgpuCreateShaderModule = makeInvalidEarlyAccess("_emwgpuCreateShaderModule");

var _emwgpuOnCompilationInfoCompleted = makeInvalidEarlyAccess("_emwgpuOnCompilationInfoCompleted");

var _emwgpuOnCreateComputePipelineCompleted = makeInvalidEarlyAccess("_emwgpuOnCreateComputePipelineCompleted");

var _emwgpuOnCreateRenderPipelineCompleted = makeInvalidEarlyAccess("_emwgpuOnCreateRenderPipelineCompleted");

var _emwgpuOnDeviceLostCompleted = makeInvalidEarlyAccess("_emwgpuOnDeviceLostCompleted");

var _emwgpuOnMapAsyncCompleted = makeInvalidEarlyAccess("_emwgpuOnMapAsyncCompleted");

var _emwgpuOnPopErrorScopeCompleted = makeInvalidEarlyAccess("_emwgpuOnPopErrorScopeCompleted");

var _emwgpuOnRequestAdapterCompleted = makeInvalidEarlyAccess("_emwgpuOnRequestAdapterCompleted");

var _emwgpuOnRequestDeviceCompleted = makeInvalidEarlyAccess("_emwgpuOnRequestDeviceCompleted");

var _emwgpuOnWorkDoneCompleted = makeInvalidEarlyAccess("_emwgpuOnWorkDoneCompleted");

var _emwgpuOnUncapturedError = makeInvalidEarlyAccess("_emwgpuOnUncapturedError");

var _emscripten_stack_get_end = makeInvalidEarlyAccess("_emscripten_stack_get_end");

var _emscripten_stack_get_base = makeInvalidEarlyAccess("_emscripten_stack_get_base");

var _strerror = makeInvalidEarlyAccess("_strerror");

var _memalign = makeInvalidEarlyAccess("_memalign");

var _emscripten_stack_init = makeInvalidEarlyAccess("_emscripten_stack_init");

var _emscripten_stack_get_free = makeInvalidEarlyAccess("_emscripten_stack_get_free");

var __emscripten_stack_restore = makeInvalidEarlyAccess("__emscripten_stack_restore");

var __emscripten_stack_alloc = makeInvalidEarlyAccess("__emscripten_stack_alloc");

var _emscripten_stack_get_current = makeInvalidEarlyAccess("_emscripten_stack_get_current");

function assignWasmExports(wasmExports) {
  Module["_raf_tick_c"] = _raf_tick_c = createExportWrapper("raf_tick_c", 1);
  Module["_load_ifcview_from_source_c"] = _load_ifcview_from_source_c = createExportWrapper("load_ifcview_from_source_c", 1);
  Module["_clear_scene_c"] = _clear_scene_c = createExportWrapper("clear_scene_c", 0);
  Module["_view_all_c"] = _view_all_c = createExportWrapper("view_all_c", 0);
  Module["_frame_selection_c"] = _frame_selection_c = createExportWrapper("frame_selection_c", 0);
  Module["_toggle_projection_c"] = _toggle_projection_c = createExportWrapper("toggle_projection_c", 0);
  Module["_projection_is_ortho_c"] = _projection_is_ortho_c = createExportWrapper("projection_is_ortho_c", 0);
  Module["_toggle_fly_c"] = _toggle_fly_c = createExportWrapper("toggle_fly_c", 0);
  Module["_fly_is_active_c"] = _fly_is_active_c = createExportWrapper("fly_is_active_c", 0);
  Module["_hide_selected_c"] = _hide_selected_c = createExportWrapper("hide_selected_c", 0);
  Module["_isolate_selected_c"] = _isolate_selected_c = createExportWrapper("isolate_selected_c", 0);
  Module["_show_all_c"] = _show_all_c = createExportWrapper("show_all_c", 0);
  Module["_hide_all_c"] = _hide_all_c = createExportWrapper("hide_all_c", 0);
  Module["_toggle_xray_c"] = _toggle_xray_c = createExportWrapper("toggle_xray_c", 0);
  Module["_xray_is_active_c"] = _xray_is_active_c = createExportWrapper("xray_is_active_c", 0);
  Module["_ifcv_set_selection_outline_c"] = _ifcv_set_selection_outline_c = createExportWrapper("ifcv_set_selection_outline_c", 1);
  Module["_ifcv_selection_outline_is_on_c"] = _ifcv_selection_outline_is_on_c = createExportWrapper("ifcv_selection_outline_is_on_c", 0);
  Module["_ifcv_get_camera_c"] = _ifcv_get_camera_c = createExportWrapper("ifcv_get_camera_c", 1);
  Module["_ifcv_set_camera_c"] = _ifcv_set_camera_c = createExportWrapper("ifcv_set_camera_c", 6);
  Module["_ifcv_set_ortho_c"] = _ifcv_set_ortho_c = createExportWrapper("ifcv_set_ortho_c", 1);
  Module["_ifcv_set_background_c"] = _ifcv_set_background_c = createExportWrapper("ifcv_set_background_c", 4);
  Module["_ifcv_set_nav_preset_c"] = _ifcv_set_nav_preset_c = createExportWrapper("ifcv_set_nav_preset_c", 1);
  Module["_ifcv_get_selection_c"] = _ifcv_get_selection_c = createExportWrapper("ifcv_get_selection_c", 2);
  Module["_ifcv_get_active_object_c"] = _ifcv_get_active_object_c = createExportWrapper("ifcv_get_active_object_c", 0);
  Module["_ifcv_apply_selection_c"] = _ifcv_apply_selection_c = createExportWrapper("ifcv_apply_selection_c", 3);
  Module["_ifcv_set_visible_c"] = _ifcv_set_visible_c = createExportWrapper("ifcv_set_visible_c", 3);
  Module["_ifcv_get_hidden_c"] = _ifcv_get_hidden_c = createExportWrapper("ifcv_get_hidden_c", 2);
  Module["_ifcv_set_color_c"] = _ifcv_set_color_c = createExportWrapper("ifcv_set_color_c", 3);
  Module["_ifcv_clear_colors_c"] = _ifcv_clear_colors_c = createExportWrapper("ifcv_clear_colors_c", 0);
  Module["_ifcv_set_federation_unit_c"] = _ifcv_set_federation_unit_c = createExportWrapper("ifcv_set_federation_unit_c", 2);
  Module["_ifcv_set_false_origin_c"] = _ifcv_set_false_origin_c = createExportWrapper("ifcv_set_false_origin_c", 4);
  Module["_ifcv_get_false_origin_c"] = _ifcv_get_false_origin_c = createExportWrapper("ifcv_get_false_origin_c", 1);
  Module["_ifcv_set_model_transform_c"] = _ifcv_set_model_transform_c = createExportWrapper("ifcv_set_model_transform_c", 14);
  Module["_ifcv_clear_model_transform_c"] = _ifcv_clear_model_transform_c = createExportWrapper("ifcv_clear_model_transform_c", 1);
  Module["_ifcv_set_model_name_c"] = _ifcv_set_model_name_c = createExportWrapper("ifcv_set_model_name_c", 2);
  Module["_ifcv_get_model_georef_c"] = _ifcv_get_model_georef_c = createExportWrapper("ifcv_get_model_georef_c", 2);
  Module["_ifcv_request_objects_c"] = _ifcv_request_objects_c = createExportWrapper("ifcv_request_objects_c", 1);
  Module["_toggle_section_c"] = _toggle_section_c = createExportWrapper("toggle_section_c", 0);
  _fflush = createExportWrapper("fflush", 1);
  Module["_clear_section_c"] = _clear_section_c = createExportWrapper("clear_section_c", 0);
  Module["_section_is_active_c"] = _section_is_active_c = createExportWrapper("section_is_active_c", 0);
  Module["_standard_view_c"] = _standard_view_c = createExportWrapper("standard_view_c", 1);
  Module["_ifcv_chunks_resident_c"] = _ifcv_chunks_resident_c = createExportWrapper("ifcv_chunks_resident_c", 0);
  Module["_ifcv_chunks_total_c"] = _ifcv_chunks_total_c = createExportWrapper("ifcv_chunks_total_c", 0);
  Module["_ifcv_model_count_c"] = _ifcv_model_count_c = createExportWrapper("ifcv_model_count_c", 0);
  Module["_ifcv_model_resident_c"] = _ifcv_model_resident_c = createExportWrapper("ifcv_model_resident_c", 1);
  Module["_ifcv_model_total_c"] = _ifcv_model_total_c = createExportWrapper("ifcv_model_total_c", 1);
  Module["_ifcv_bytes_total_c"] = _ifcv_bytes_total_c = createExportWrapper("ifcv_bytes_total_c", 0);
  Module["_ifcv_bytes_needed_c"] = _ifcv_bytes_needed_c = createExportWrapper("ifcv_bytes_needed_c", 0);
  Module["_ifcv_bytes_loaded_c"] = _ifcv_bytes_loaded_c = createExportWrapper("ifcv_bytes_loaded_c", 0);
  Module["_ifcv_get_frame_stats_c"] = _ifcv_get_frame_stats_c = createExportWrapper("ifcv_get_frame_stats_c", 2);
  Module["_ifcv_unload_model_c"] = _ifcv_unload_model_c = createExportWrapper("ifcv_unload_model_c", 1);
  Module["_ifcv_load_model_c"] = _ifcv_load_model_c = createExportWrapper("ifcv_load_model_c", 1);
  Module["_ifcv_model_unloaded_c"] = _ifcv_model_unloaded_c = createExportWrapper("ifcv_model_unloaded_c", 1);
  Module["_ifcv_model_vram_bytes_c"] = _ifcv_model_vram_bytes_c = createExportWrapper("ifcv_model_vram_bytes_c", 1);
  Module["_main"] = _main = createExportWrapper("__main_argc_argv", 2);
  Module["_ifcv_on_range_done"] = _ifcv_on_range_done = createExportWrapper("ifcv_on_range_done", 2);
  Module["_free"] = _free = createExportWrapper("free", 1);
  Module["_malloc"] = _malloc = createExportWrapper("malloc", 1);
  _emwgpuCreateBindGroup = createExportWrapper("emwgpuCreateBindGroup", 1);
  _emwgpuCreateBindGroupLayout = createExportWrapper("emwgpuCreateBindGroupLayout", 1);
  _emwgpuCreateCommandBuffer = createExportWrapper("emwgpuCreateCommandBuffer", 1);
  _emwgpuCreateCommandEncoder = createExportWrapper("emwgpuCreateCommandEncoder", 1);
  _emwgpuCreateComputePassEncoder = createExportWrapper("emwgpuCreateComputePassEncoder", 1);
  _emwgpuCreateComputePipeline = createExportWrapper("emwgpuCreateComputePipeline", 1);
  _emwgpuCreatePipelineLayout = createExportWrapper("emwgpuCreatePipelineLayout", 1);
  _emwgpuCreateQuerySet = createExportWrapper("emwgpuCreateQuerySet", 1);
  _emwgpuCreateRenderBundle = createExportWrapper("emwgpuCreateRenderBundle", 1);
  _emwgpuCreateRenderBundleEncoder = createExportWrapper("emwgpuCreateRenderBundleEncoder", 1);
  _emwgpuCreateRenderPassEncoder = createExportWrapper("emwgpuCreateRenderPassEncoder", 1);
  _emwgpuCreateRenderPipeline = createExportWrapper("emwgpuCreateRenderPipeline", 1);
  _emwgpuCreateSampler = createExportWrapper("emwgpuCreateSampler", 1);
  _emwgpuCreateSurface = createExportWrapper("emwgpuCreateSurface", 1);
  _emwgpuCreateTexture = createExportWrapper("emwgpuCreateTexture", 1);
  _emwgpuCreateTextureView = createExportWrapper("emwgpuCreateTextureView", 1);
  _emwgpuCreateAdapter = createExportWrapper("emwgpuCreateAdapter", 1);
  _emwgpuCreateBuffer = createExportWrapper("emwgpuCreateBuffer", 2);
  _emwgpuCreateDevice = createExportWrapper("emwgpuCreateDevice", 2);
  _emwgpuCreateQueue = createExportWrapper("emwgpuCreateQueue", 1);
  _emwgpuCreateShaderModule = createExportWrapper("emwgpuCreateShaderModule", 1);
  _emwgpuOnCompilationInfoCompleted = createExportWrapper("emwgpuOnCompilationInfoCompleted", 3);
  _emwgpuOnCreateComputePipelineCompleted = createExportWrapper("emwgpuOnCreateComputePipelineCompleted", 4);
  _emwgpuOnCreateRenderPipelineCompleted = createExportWrapper("emwgpuOnCreateRenderPipelineCompleted", 4);
  _emwgpuOnDeviceLostCompleted = createExportWrapper("emwgpuOnDeviceLostCompleted", 3);
  _emwgpuOnMapAsyncCompleted = createExportWrapper("emwgpuOnMapAsyncCompleted", 3);
  _emwgpuOnPopErrorScopeCompleted = createExportWrapper("emwgpuOnPopErrorScopeCompleted", 4);
  _emwgpuOnRequestAdapterCompleted = createExportWrapper("emwgpuOnRequestAdapterCompleted", 4);
  _emwgpuOnRequestDeviceCompleted = createExportWrapper("emwgpuOnRequestDeviceCompleted", 4);
  _emwgpuOnWorkDoneCompleted = createExportWrapper("emwgpuOnWorkDoneCompleted", 2);
  _emwgpuOnUncapturedError = createExportWrapper("emwgpuOnUncapturedError", 3);
  _emscripten_stack_get_end = wasmExports["emscripten_stack_get_end"];
  _emscripten_stack_get_base = wasmExports["emscripten_stack_get_base"];
  _strerror = createExportWrapper("strerror", 1);
  _memalign = createExportWrapper("memalign", 2);
  _emscripten_stack_init = wasmExports["emscripten_stack_init"];
  _emscripten_stack_get_free = wasmExports["emscripten_stack_get_free"];
  __emscripten_stack_restore = wasmExports["_emscripten_stack_restore"];
  __emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"];
  _emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"];
}

var wasmImports = {
  /** @export */ __assert_fail: ___assert_fail,
  /** @export */ __cxa_throw: ___cxa_throw,
  /** @export */ __syscall_fcntl64: ___syscall_fcntl64,
  /** @export */ __syscall_ioctl: ___syscall_ioctl,
  /** @export */ __syscall_openat: ___syscall_openat,
  /** @export */ _abort_js: __abort_js,
  /** @export */ _emscripten_fs_load_embedded_files: __emscripten_fs_load_embedded_files,
  /** @export */ _tzset_js: __tzset_js,
  /** @export */ clock_time_get: _clock_time_get,
  /** @export */ emscripten_asm_const_double: _emscripten_asm_const_double,
  /** @export */ emscripten_asm_const_int: _emscripten_asm_const_int,
  /** @export */ emscripten_exit_pointerlock: _emscripten_exit_pointerlock,
  /** @export */ emscripten_force_exit: _emscripten_force_exit,
  /** @export */ emscripten_get_device_pixel_ratio: _emscripten_get_device_pixel_ratio,
  /** @export */ emscripten_get_element_css_size: _emscripten_get_element_css_size,
  /** @export */ emscripten_get_now: _emscripten_get_now,
  /** @export */ emscripten_has_asyncify: _emscripten_has_asyncify,
  /** @export */ emscripten_request_pointerlock: _emscripten_request_pointerlock,
  /** @export */ emscripten_resize_heap: _emscripten_resize_heap,
  /** @export */ emscripten_set_keydown_callback_on_thread: _emscripten_set_keydown_callback_on_thread,
  /** @export */ emscripten_set_keyup_callback_on_thread: _emscripten_set_keyup_callback_on_thread,
  /** @export */ emscripten_set_mousedown_callback_on_thread: _emscripten_set_mousedown_callback_on_thread,
  /** @export */ emscripten_set_mousemove_callback_on_thread: _emscripten_set_mousemove_callback_on_thread,
  /** @export */ emscripten_set_mouseup_callback_on_thread: _emscripten_set_mouseup_callback_on_thread,
  /** @export */ emscripten_set_pointerlockchange_callback_on_thread: _emscripten_set_pointerlockchange_callback_on_thread,
  /** @export */ emscripten_set_wheel_callback_on_thread: _emscripten_set_wheel_callback_on_thread,
  /** @export */ emwgpuAdapterRequestDevice: _emwgpuAdapterRequestDevice,
  /** @export */ emwgpuBufferDestroy: _emwgpuBufferDestroy,
  /** @export */ emwgpuBufferGetConstMappedRange: _emwgpuBufferGetConstMappedRange,
  /** @export */ emwgpuBufferMapAsync: _emwgpuBufferMapAsync,
  /** @export */ emwgpuBufferUnmap: _emwgpuBufferUnmap,
  /** @export */ emwgpuDelete: _emwgpuDelete,
  /** @export */ emwgpuDeviceCreateBuffer: _emwgpuDeviceCreateBuffer,
  /** @export */ emwgpuDeviceCreateShaderModule: _emwgpuDeviceCreateShaderModule,
  /** @export */ emwgpuDeviceDestroy: _emwgpuDeviceDestroy,
  /** @export */ emwgpuDevicePopErrorScope: _emwgpuDevicePopErrorScope,
  /** @export */ emwgpuGetPreferredFormat: _emwgpuGetPreferredFormat,
  /** @export */ emwgpuInstanceRequestAdapter: _emwgpuInstanceRequestAdapter,
  /** @export */ environ_get: _environ_get,
  /** @export */ environ_sizes_get: _environ_sizes_get,
  /** @export */ fd_close: _fd_close,
  /** @export */ fd_read: _fd_read,
  /** @export */ fd_seek: _fd_seek,
  /** @export */ fd_write: _fd_write,
  /** @export */ ifcvReadRangeInto,
  /** @export */ ifcvSourceSize,
  /** @export */ ifcv_set_bind_group_dynamic_js,
  /** @export */ wgpuCommandEncoderBeginRenderPass: _wgpuCommandEncoderBeginRenderPass,
  /** @export */ wgpuCommandEncoderClearBuffer: _wgpuCommandEncoderClearBuffer,
  /** @export */ wgpuCommandEncoderCopyBufferToBuffer: _wgpuCommandEncoderCopyBufferToBuffer,
  /** @export */ wgpuCommandEncoderCopyTextureToBuffer: _wgpuCommandEncoderCopyTextureToBuffer,
  /** @export */ wgpuCommandEncoderFinish: _wgpuCommandEncoderFinish,
  /** @export */ wgpuDeviceCreateBindGroup: _wgpuDeviceCreateBindGroup,
  /** @export */ wgpuDeviceCreateBindGroupLayout: _wgpuDeviceCreateBindGroupLayout,
  /** @export */ wgpuDeviceCreateCommandEncoder: _wgpuDeviceCreateCommandEncoder,
  /** @export */ wgpuDeviceCreatePipelineLayout: _wgpuDeviceCreatePipelineLayout,
  /** @export */ wgpuDeviceCreateRenderPipeline: _wgpuDeviceCreateRenderPipeline,
  /** @export */ wgpuDeviceCreateTexture: _wgpuDeviceCreateTexture,
  /** @export */ wgpuDeviceGetLimits: _wgpuDeviceGetLimits,
  /** @export */ wgpuDevicePushErrorScope: _wgpuDevicePushErrorScope,
  /** @export */ wgpuInstanceCreateSurface: _wgpuInstanceCreateSurface,
  /** @export */ wgpuQueueSubmit: _wgpuQueueSubmit,
  /** @export */ wgpuQueueWriteBuffer: _wgpuQueueWriteBuffer,
  /** @export */ wgpuRenderPassEncoderDraw: _wgpuRenderPassEncoderDraw,
  /** @export */ wgpuRenderPassEncoderEnd: _wgpuRenderPassEncoderEnd,
  /** @export */ wgpuRenderPassEncoderSetBindGroup: _wgpuRenderPassEncoderSetBindGroup,
  /** @export */ wgpuRenderPassEncoderSetPipeline: _wgpuRenderPassEncoderSetPipeline,
  /** @export */ wgpuRenderPassEncoderSetScissorRect: _wgpuRenderPassEncoderSetScissorRect,
  /** @export */ wgpuRenderPassEncoderSetVertexBuffer: _wgpuRenderPassEncoderSetVertexBuffer,
  /** @export */ wgpuRenderPassEncoderSetViewport: _wgpuRenderPassEncoderSetViewport,
  /** @export */ wgpuSurfaceConfigure: _wgpuSurfaceConfigure,
  /** @export */ wgpuSurfaceGetCurrentTexture: _wgpuSurfaceGetCurrentTexture,
  /** @export */ wgpuTextureCreateView: _wgpuTextureCreateView
};

var wasmExports = await createWasm();

// Argument name here must shadow the `wasmExports` global so
// that it is recognised by metadce and minify-import-export-names
// passes.
function applySignatureConversions(wasmExports) {
  // First, make a copy of the incoming exports object
  wasmExports = Object.assign({}, wasmExports);
  var makeWrapper_pp = f => a0 => f(a0) >>> 0;
  var makeWrapper_p = f => () => f() >>> 0;
  var makeWrapper_p_ = f => a0 => f(a0) >>> 0;
  var makeWrapper_ppp = f => (a0, a1) => f(a0, a1) >>> 0;
  wasmExports["malloc"] = makeWrapper_pp(wasmExports["malloc"]);
  wasmExports["emscripten_stack_get_end"] = makeWrapper_p(wasmExports["emscripten_stack_get_end"]);
  wasmExports["emscripten_stack_get_base"] = makeWrapper_p(wasmExports["emscripten_stack_get_base"]);
  wasmExports["strerror"] = makeWrapper_p_(wasmExports["strerror"]);
  wasmExports["memalign"] = makeWrapper_ppp(wasmExports["memalign"]);
  wasmExports["_emscripten_stack_alloc"] = makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);
  wasmExports["emscripten_stack_get_current"] = makeWrapper_p(wasmExports["emscripten_stack_get_current"]);
  return wasmExports;
}

// include: postamble.js
// === Auto-generated postamble setup entry stuff ===
var calledRun;

function callMain(args = []) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on Module["onRuntimeInitialized"])');
  assert(typeof onPreRuns === "undefined" || onPreRuns.length == 0, "cannot call main when preRun functions remain to be called");
  var entryFunction = _main;
  args.unshift(thisProgram);
  var argc = args.length;
  var argv = stackAlloc((argc + 1) * 4);
  var argv_ptr = argv;
  args.forEach(arg => {
    HEAPU32[((argv_ptr) >>> 2) >>> 0] = stringToUTF8OnStack(arg);
    argv_ptr += 4;
  });
  HEAPU32[((argv_ptr) >>> 2) >>> 0] = 0;
  try {
    var ret = entryFunction(argc, argv);
    // if we're not running an evented main loop, it's time to exit
    exitJS(ret, /* implicit = */ true);
    return ret;
  } catch (e) {
    return handleException(e);
  }
}

function stackCheckInit() {
  // This is normally called automatically during __wasm_call_ctors but need to
  // get these values before even running any of the ctors so we call it redundantly
  // here.
  _emscripten_stack_init();
  // TODO(sbc): Move writeStackCookie to native to to avoid this.
  writeStackCookie();
}

function run(args = arguments_) {
  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }
  stackCheckInit();
  preRun();
  // a preRun added a dependency, run will be called later
  if (runDependencies > 0) {
    dependenciesFulfilled = run;
    return;
  }
  function doRun() {
    // run may have just been called through dependencies being fulfilled just in this very frame,
    // or while the async setStatus time below was happening
    assert(!calledRun);
    calledRun = true;
    Module["calledRun"] = true;
    if (ABORT) return;
    initRuntime();
    preMain();
    readyPromiseResolve?.(Module);
    Module["onRuntimeInitialized"]?.();
    consumedModuleProp("onRuntimeInitialized");
    var noInitialRun = Module["noInitialRun"] || false;
    if (!noInitialRun) callMain(args);
    postRun();
  }
  if (Module["setStatus"]) {
    Module["setStatus"]("Running...");
    setTimeout(() => {
      setTimeout(() => Module["setStatus"](""), 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in SYSCALLS_REQUIRE_FILESYSTEM=0
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var oldOut = out;
  var oldErr = err;
  var has = false;
  out = err = x => {
    has = true;
  };
  try {
    // it doesn't matter if it fails
    _fflush(0);
    // also flush in the JS FS layer
    [ "stdout", "stderr" ].forEach(name => {
      var info = FS.analyzePath("/dev/" + name);
      if (!info) return;
      var stream = info.object;
      var rdev = stream.rdev;
      var tty = TTY.ttys[rdev];
      if (tty?.output?.length) {
        has = true;
      }
    });
  } catch (e) {}
  out = oldOut;
  err = oldErr;
  if (has) {
    warnOnce("stdio streams had content in them that was not flushed. you should set EXIT_RUNTIME to 1 (see the Emscripten FAQ), or make sure to emit a newline when you printf etc.");
  }
}

function preInit() {
  if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function") Module["preInit"] = [ Module["preInit"] ];
    while (Module["preInit"].length > 0) {
      Module["preInit"].shift()();
    }
  }
  consumedModuleProp("preInit");
}

preInit();

run();

// end include: postamble.js
// include: postamble_modularize.js
// In MODULARIZE mode we wrap the generated code in a factory function
// and return either the Module itself, or a promise of the module.
// We assign to the `moduleRtn` global here and configure closure to see
// this as and extern so it won't get minified.
if (runtimeInitialized) {
  moduleRtn = Module;
} else {
  // Set up the promise that indicates the Module is initialized
  moduleRtn = new Promise((resolve, reject) => {
    readyPromiseResolve = resolve;
    readyPromiseReject = reject;
  });
}

// Assertion for attempting to access module properties on the incoming
// moduleArg.  In the past we used this object as the prototype of the module
// and assigned properties to it, but now we return a distinct object.  This
// keeps the instance private until it is ready (i.e the promise has been
// resolved).
for (const prop of Object.keys(Module)) {
  if (!(prop in moduleArg)) {
    Object.defineProperty(moduleArg, prop, {
      configurable: true,
      get() {
        abort(`Access to module property ('${prop}') is no longer possible via the module constructor argument; Instead, use the result of the module constructor.`);
      }
    });
  }
}


  return moduleRtn;
}
);
})();
if (typeof exports === 'object' && typeof module === 'object') {
  module.exports = createIfcViewer;
  // This default export looks redundant, but it allows TS to import this
  // commonjs style module.
  module.exports.default = createIfcViewer;
} else if (typeof define === 'function' && define['amd'])
  define([], () => createIfcViewer);
