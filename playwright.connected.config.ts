import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'connected.spec.ts',workers:1,retries:0,reporter:'list',use:{baseURL:'http://127.0.0.1:5173',channel:'chrome',trace:'off',screenshot:'off',...devices['Desktop Chrome'],viewport:{width:1450,height:1000}}});
