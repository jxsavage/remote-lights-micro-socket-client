module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  settings: {
  "import/resolver": {
    // use <root>/tsconfig.json
    "typescript": {
      "directory": "./tsconfig.json",
      "alwaysTryTypes": true // always try to resolve types under `<roo/>@types` directory even it doesn't contain any source code, like `@types/unist`
    },
  },
},
  parserOptions: {
    project: 'tsconfig.json',
  },
  plugins: [
    '@typescript-eslint',
    'import'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
  }
  
};