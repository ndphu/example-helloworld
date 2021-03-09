/**
 * Simple file-based datastore
 */

import path from 'path';
import fs from 'mz/fs';
import mkdirp from 'mkdirp';
import {Account} from "@solana/web3.js";

type Config = { [key: string]: string };

export class Store {
    static getDir(): string {
        return path.join(__dirname, 'store');
    }

    async load(uri: string): Promise<Config> {
        const filename = path.join(Store.getDir(), uri);
        const data = await fs.readFile(filename, 'utf8');
        return JSON.parse(data) as Config;
    }

    async save(uri: string, config: Config): Promise<void> {
        await mkdirp(Store.getDir());
        const filename = path.join(Store.getDir(), uri);
        await fs.writeFile(filename, JSON.stringify(config), 'utf8');
    }

    // async loadAppData(): Promise<AppData> {
    //     const filename = path.join(Store.getDir(), "appData.json");
    //     const data = await fs.readFile(filename, 'utf8');
    //     return JSON.parse(data) as AppData;
    // }
    //
    // async saveAppData(appData: AppData): Promise<void> {
    //     await mkdirp(Store.getDir());
    //     const filename = path.join(Store.getDir(), "appData.json");
    //     await fs.writeFile(filename, JSON.stringify(appData), 'utf8');
    // }

    async saveUserAccount(userAccount: Account): Promise<void> {
        await mkdirp(Store.getDir());
        const filename = path.join(Store.getDir(), "user.json");
        const payload = {
            publicKey: userAccount.publicKey.toBase58(),
            secretKey: Buffer.from(userAccount.secretKey).toString('base64'),
        };

        await fs.writeFile(filename, JSON.stringify(payload), 'utf-8');
    }

    async loadUserAccount(): Promise<Account> {
        //return new Account(Uint8Array.from(Buffer.from(json.userAccount, 'hex')));
        const filename = path.join(Store.getDir(), "user.json");
        const data = await fs.readFile(filename, 'utf8');
        const payload = JSON.parse(data);
        return new Account(Buffer.from(payload.secretKey, 'base64'));
    }

    async saveFirstMessageAccount(fma: Account): Promise<void> {
        await mkdirp(Store.getDir());
        const filename = path.join(Store.getDir(), "fma.json");
        const payload = {
            publicKey: fma.publicKey.toBase58(),
            secretKey: Buffer.from(fma.secretKey).toString('base64'),
        };

        await fs.writeFile(filename, JSON.stringify(payload), 'utf-8');
    }

    async loadFirstMessageAccount(): Promise<Account> {
        const filename = path.join(Store.getDir(), "fma.json");
        const data = await fs.readFile(filename, 'utf8');
        const payload = JSON.parse(data);
        return new Account(Buffer.from(payload.secretKey, 'base64'));
    }
}
