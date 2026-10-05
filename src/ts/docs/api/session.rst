Session
=======

Runtime bootstrap and session helpers exported from ``ifcopenshell``.

.. js:function:: init(options)

   Initialize the WASM runtime once per process and remember it for
   :js:func:`open` / :js:func:`file`.

   :param options: :js:class:`InitOptions` — ``wasmBase``, ``wasmAssets``,
      and optional ``pluginLoader``.
   :returns: Promise resolving to an :js:class:`IfcOpenShell` runtime facade.

.. js:function:: open(bytes[, filename[, options]])

   Open IFC bytes using the runtime from :js:func:`init`. Sniffs
   ``FILE_SCHEMA`` and loads the matching schema plugin.

   :param bytes: ``Uint8Array`` or ``ArrayBuffer``.
   :param filename: Optional display / STEP filename.
   :param options: :js:class:`OpenOptions` plus optional ``shell`` override.
   :returns: Promise resolving to an :js:class:`IfcFile`.

.. js:function:: file([options])

   Create an empty in-memory file, matching Python
   ``ifcopenshell.file(schema=...)``.

   :param options: Object with optional ``schema`` (default ``'IFC4'``) and
      ``shell``.
   :returns: Promise resolving to an :js:class:`IfcFile`.

.. js:class:: IfcOpenShell

   Initialized runtime facade returned by :js:func:`init`.

   .. js:attribute:: fs

      Emscripten MEMFS when available, otherwise ``null``.

   .. js:method:: loadPlugin(kind, id)

      Load a schema, kernel, mapping, tree, document, or geometry_serializer
      plugin by id.

   .. js:method:: loadedPlugins()

      Return the list of already-loaded ``kind:id`` plugin keys.

Errors
------

.. js:class:: IfcOpenShellError

   Public error type for this package. ``instanceof`` works across errors
   thrown by the low-level API and the wrappers.

   .. js:attribute:: kind

      One of :js:data:`IfcOpenShellErrorKind` values.

   .. js:attribute:: code

      One of :js:data:`IfcOpenShellErrorCode` values.

.. js:data:: IfcOpenShellErrorKind

   Frozen map: ``NONE``, ``RUNTIME``, ``VALUE``, ``TYPE``, ``CANCELLED``.

.. js:data:: IfcOpenShellErrorCode

   Frozen map: ``NONE``, ``UNSPECIFIED``, ``INVALID_ARGUMENT``,
   ``DOMAIN_ERROR``, ``OPERATION_CANCELLED``.

.. js:function:: abortError(message[, reason])

   Build a cancelled :js:class:`IfcOpenShellError` (name ``AbortError``).

.. js:function:: isIfcOpenShellAbortError(value)

   Return whether ``value`` is a cancelled IfcOpenShell error.
