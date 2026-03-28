import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/unit/**/*.test.js'],
        setupFiles: ['tests/helpers/global-setup.js'],
        testTimeout: 10000,
    },
});
