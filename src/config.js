import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Load local .env first, then global fallback
dotenv.config();
const globalEnv = join(homedir(), '.tix', '.env');
if (existsSync(globalEnv)) dotenv.config({ path: globalEnv });

export const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
export const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID || '';
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const GITHUB_REPO = process.env.GITHUB_REPO || '';
