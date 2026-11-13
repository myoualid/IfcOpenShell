// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Transpiled from Python, or its loosely typed runtime; see tsconfig.python.json.
  { ignores: ['dist/', 'src/util/', 'src/api/', 'src/helpers/datetime.ts', 'src/helpers/dateutil.ts', 'src/helpers/geom.ts', 'src/helpers/isodate.ts', 'src/helpers/itertools.ts', 'src/helpers/lang.ts', 'src/helpers/numpy.ts', 'src/helpers/os.ts'] },
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.stylistic],
  },
);
