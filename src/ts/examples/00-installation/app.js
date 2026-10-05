const status = document.getElementById('status');
const checksEl = document.getElementById('checks');
const commandsEl = document.getElementById('commands');

async function main() {
  const DIST_FILES = [
    '../../ifcopenshell-js/dist/index.js',
    '../../ifcopenshell-js/dist/geom/index.js',
    '../../ifcopenshell-js/dist/util/index.js',
  ];

  const WASM_FILES = [
    'ifcopenshell_wasm.wasm',
    'ifcopenshell_api.mjs',
    'ifcopenshell_plugins.json',
  ];

  async function checkUrl(label, url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return { label, ok: response.ok, detail: response.ok ? 'found' : `HTTP ${response.status}` };
    } catch (err) {
      return { label, ok: false, detail: String(err) };
    }
  }

  function renderCheck(result) {
    const li = document.createElement('li');
    li.className = result.ok ? 'ok' : 'fail';
    li.textContent = `${result.ok ? 'OK' : 'FAIL'} ${result.label} — ${result.detail}`;
    checksEl.appendChild(li);
    return result.ok;
  }

  const wasmBase = new URL('../../ifcopenshell-wasm/wasm/', import.meta.url).href;
  let allOk = true;

  for (const path of DIST_FILES) {
    allOk = renderCheck(await checkUrl(`JS dist: ${path.split('/').pop()}`, new URL(path, import.meta.url))) && allOk;
  }

  for (const file of WASM_FILES) {
    const url = new URL(file, wasmBase);
    allOk = renderCheck(await checkUrl(`WASM: ${file}`, url)) && allOk;
  }

  if (allOk) {
    status.textContent = 'All checks passed — try Chapter 1 (parse).';
    try {
      const ifcopenshell = (await import('ifcopenshell')).default;
      const shell = await ifcopenshell.init({ wasmBase });
      renderCheck({ label: 'Runtime init({ wasmBase })', ok: true, detail: 'OK' });
      // session remembers shell; nothing to dispose on the frozen facade
      void shell;
    } catch (err) {
      renderCheck({ label: 'Runtime init()', ok: false, detail: String(err) });
      allOk = false;
      status.textContent = 'Runtime init failed — see checks below.';
    }
  } else {
    status.textContent = 'Some checks failed — run the commands below, then reload.';
  }

  commandsEl.textContent = [
    '# From IfcOpenShell repo root (this worktree)',
    'python nix/wasm_native.py build',
    'python nix/wasm_native.py package',
    '',
    '# Stage WASM',
    'cd src/ts/ifcopenshell-wasm',
    'npm run stage',
    '',
    '# Build JavaScript dist/',
    'cd ../ifcopenshell-js',
    'npm run build',
    '',
    '# Serve examples',
    'cd ../examples',
    'node serve.mjs',
    '# open http://127.0.0.1:4173/examples/00-installation/',
  ].join('\n');
}

main().catch((err) => {
  status.textContent = String(err);
  console.error(err);
});
