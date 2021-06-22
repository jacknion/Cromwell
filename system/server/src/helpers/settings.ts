import { setStoreItem, TCmsConfig } from '@cromwell/core';
import {
    cmsPackageName,
    getCmsEntity,
    getCmsSettings,
    getLogger,
    getModulePackage,
    getServerDir,
    getServerTempDir,
    readCMSConfigSync,
} from '@cromwell/core-backend';
import { getCentralServerClient } from '@cromwell/core-frontend';
import cacache from 'cacache';
import cryptoRandomString from 'crypto-random-string';
import fs from 'fs-extra';
import { resolve } from 'path';
import yargs from 'yargs-parser';

import { TServerCommands } from './constants';

let sEnv: TEnv | undefined = undefined;
const logger = getLogger();

type TEnv = {
    envMode: 'dev' | 'prod';
    scriptName: TServerCommands;
    cmsConfig: TCmsConfig;
}

export const loadEnv = (): TEnv => {
    if (sEnv) return sEnv;

    const args = yargs(process.argv.slice(2));
    const scriptName = process.argv[2] as TServerCommands;
    const cmsConfig = readCMSConfigSync();

    if (args.proxyPort) {
        process.env.API_PORT = args.proxyPort + '';
    }

    if (!scriptName || (scriptName as any) === '') {
        const msg = 'Provide as first argument to this script one of these commands: build, dev, prod, serverDev, serverProd';
        getLogger(false).error(msg);
    }

    const envMode = cmsConfig?.env ?? (scriptName === 'dev') ? 'dev' : 'prod';
    const logLevel = args.logLevel ?? envMode === 'dev' ? 'detailed' : 'errors-only';

    setStoreItem('environment', {
        mode: envMode,
        logLevel
    });

    sEnv = {
        envMode,
        scriptName,
        cmsConfig,
    }
    return sEnv;
}


export const checkConfigs = async () => {
    const serverCachePath = resolve(getServerTempDir(), 'cache');

    // If secret keys weren't set in config, they will be randomly generated
    // Save them into file cache to not generate on every launch, otherwise it'll
    // cause log-out for all users
    const { cmsConfig } = loadEnv();
    const isRandomSecret = !cmsConfig.accessTokenSecret;

    if (isRandomSecret) {
        const getSettings = async () => {
            try {
                const cachedData = await cacache.get(serverCachePath, 'auth_settings');
                const cachedSettings: typeof authSettings = JSON.parse(cachedData.data.toString());
                if (cachedSettings?.accessSecret) return cachedSettings;
            } catch (error) { }
        }

        const cached = await getSettings();
        if (!cached || !cached.accessSecret || !cached.refreshSecret || !cached.cookieSecret) {
            await cacache.put(serverCachePath, 'auth_settings', JSON.stringify(authSettings));
        } else {
            authSettings.accessSecret = cached.accessSecret;
            authSettings.refreshSecret = cached.refreshSecret;
            authSettings.cookieSecret = cached.cookieSecret;
        }
    }


    const mailsDir = resolve(getServerTempDir(), 'emails');
    const serverDir = getServerDir();
    if (! await fs.pathExists(mailsDir) && serverDir) {
        const templatesSrc = resolve(serverDir, 'static/emails');
        await fs.copy(templatesSrc, mailsDir);
    }
}


export const checkCmsVersion = async () => {
    // Check CMS version
    const settings = await getCmsSettings();
    const cmsPckg = await getModulePackage(cmsPackageName);
    const cmsEntity = await getCmsEntity();

    if (cmsPckg?.version && cmsPckg.version !== settings?.version) {
        try {
            const remoteInfo = await getCentralServerClient().getVersionByPackage(cmsPckg.version);
            if (remoteInfo) {
                cmsEntity.version = remoteInfo.version;
                await cmsEntity.save();
            }
        } catch (error) {
            logger.error(error);
        }

        if (!cmsEntity.version) {
            cmsEntity.version = cmsPckg.version;
            await cmsEntity.save();
        }
    }
}

const { cmsConfig } = loadEnv();

export const authSettings = {
    accessSecret: cmsConfig.accessTokenSecret ?? cryptoRandomString({ length: 8, type: 'ascii-printable' }),
    refreshSecret: cmsConfig.refreshTokenSecret ?? cryptoRandomString({ length: 8, type: 'ascii-printable' }),
    cookieSecret: cmsConfig.cookieSecret ?? cryptoRandomString({ length: 8, type: 'url-safe' }),

    /** 10 min by default */
    expirationAccessTime: cmsConfig.accessTokenExpirationTime ?? 600,
    /** 15 days by default */
    expirationRefreshTime: cmsConfig.refreshTokenExpirationTime ?? 1296000,

    accessTokenCookieName: 'crw_access_token',
    refreshTokenCookieName: 'crw_refresh_token',
    maxTokensPerUser: parseInt(process.env.JWT_MAX_TOKENS_PER_USER ?? '20'),

    // approximate, for one server instance
    resetPasswordAttempts: 5,
    // 3 hours
    resetPasswordCodeExpirationAccessTime: 1000 * 60 * 60 * 3,
}

export const bcryptSaltRounds = 10;