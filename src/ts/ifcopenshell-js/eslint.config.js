// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // src/util and src/api are generated from Python by src/transpiler/generate.py.
  { ignores: ['dist/', 'src/util/', 'src/api/', 'src/helpers/lang.ts'] },
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.stylistic],
  },
);
