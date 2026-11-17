import js from '@eslint/js'
import noUnsanitized from 'eslint-plugin-no-unsanitized'
import globals from 'globals'

const securityRules = {
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-proto': 'error',
    'no-caller': 'error',
}

const qualityRules = {
    eqeqeq: ['error', 'always'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-throw-literal': 'error',
    'no-promise-executor-return': 'error',
    'require-atomic-updates': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
}

export default [
    { ignores: ['dist/**', 'node_modules/**'] },

    js.configs.recommended,

    {
        files: ['src/**/*.js', 'popup/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.browser, ...globals.webextensions },
        },
        plugins: { 'no-unsanitized': noUnsanitized },
        rules: {
            ...securityRules,
            ...qualityRules,
            'no-unsanitized/method': 'error',
            'no-unsanitized/property': 'error',
        },
    },

    {
        files: ['src/**/*.js'],
        languageOptions: {
            globals: { ...globals.serviceworker, ...globals.webextensions },
        },
    },

    {
        files: ['src/background.js'],
        rules: { 'no-control-regex': 'off' },
    },

    {
        files: ['scripts/**/*.mjs', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: { ...securityRules, ...qualityRules, 'no-console': 'off' },
    },
]
