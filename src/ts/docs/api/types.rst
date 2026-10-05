Types and WASM assets
=====================

Configuration types used by :js:func:`init` and advanced hosting.

.. js:class:: InitOptions

   .. js:attribute:: wasmAssets

      Explicit :js:class:`WasmAssets`. Takes precedence over ``wasmBase``.

   .. js:attribute:: wasmBase

      Base URL of a served ``wasm/`` directory (browser / CDN). Resolved via
      ``@ifcopenshell-js/wasm`` ``resolveUrls`` when ``wasmAssets`` is omitted.

   .. js:attribute:: pluginLoader

      Optional custom plugin loader override.

.. js:class:: WasmAssets

   .. js:attribute:: initModule

      Emscripten module factory (default export of ``ifcopenshell_wasm.mjs``).

   .. js:attribute:: wasmUrl

      URL or path to ``ifcopenshell_wasm.wasm``.

   .. js:attribute:: pluginBaseUrl

      Base URL for resolving plugin ``.wasm`` paths from the manifest.

   .. js:attribute:: manifest

      Parsed ``ifcopenshell_plugins.json`` (:js:class:`PluginManifest`).

   .. js:attribute:: pluginLoader

      Environment-appropriate loader for plugin WASM files.

   .. js:attribute:: apiModuleUrl

      Module specifier for ``ifcopenshell_api.mjs`` when the factory is not
      inlined.

   .. js:attribute:: createIfcOpenshellModule

      Generated API factory (bundler-friendly alternative to runtime string
      imports).

.. js:class:: PluginManifest

   Maps of plugin entries by kind: ``schema``, ``kernel``, ``mapping``,
   ``document``, ``geometry_serializer``, ``tree``.

.. js:class:: PluginEntry

   .. js:attribute:: wasm

      Relative path to the ``.wasm`` side module.

   .. js:attribute:: depends

      Optional dependency keys (for example ``["kernel:occt"]``).

.. js:data:: PluginKind

   ``'schema' | 'kernel' | 'mapping' | 'tree' | 'document' | 'geometry_serializer'``.

.. js:data:: PluginLoader

   ``(url, plugin) => Uint8Array | ArrayBuffer | …`` — override how plugin
   bytes are fetched.

.. js:class:: EmscriptenFS

   Subset of MEMFS used by serializers: ``writeFile``, ``readFile``,
   ``unlink``, ``analyzePath``.

.. js:data:: Ptr

   Raw pointer address in WASM linear memory (``number``).
