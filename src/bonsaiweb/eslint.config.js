import js from '@eslint/js';
import globals from 'globals';
import mdcs from 'eslint-config-mdcs';

export default [
	// files to ignore
	{
		name: 'files to ignore',
		ignores: [
			'**/node_modules/**',
			'**/build/**',
			'**/vendor/**',
		]
	},

	// recommended
	js.configs.recommended,

	// base rules — same layout source as three.js (eslint-config-mdcs)
	{
		name: 'base rules',
		files: [ '**/*.js' ],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2017,
			},
		},
		rules: {
			...mdcs.rules,
			'no-throw-literal': 'error',
			'quotes': [ 'error', 'single' ],
			'prefer-const': [ 'error', {
				destructuring: 'any',
				ignoreReadBeforeAssign: false
			} ],
			'no-irregular-whitespace': 'error',
			'no-duplicate-imports': 'error',
			'prefer-spread': 'error',
			// 'eqeqeq': 'error',

			'no-useless-escape': 'off',
			'no-case-declarations': 'off',
			'no-cond-assign': 'off',
			'getter-return': 'off',
			'no-async-promise-executor': 'off',
			'no-empty': 'off',
			'no-fallthrough': 'off',
			'no-prototype-builtins': 'off',
			'no-loss-of-precision': 'off',
			'no-unused-vars': [ 'error', {
				caughtErrors: 'none',
			} ],
		}
	},
];
