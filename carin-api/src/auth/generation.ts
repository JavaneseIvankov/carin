import { betterAuth } from 'better-auth';
import { authOptions } from './options.js';

// Generation-only entrypoint; never mounted or used as production configuration.
export const auth = betterAuth({ ...authOptions, baseURL: 'http://127.0.0.1:3000' });
