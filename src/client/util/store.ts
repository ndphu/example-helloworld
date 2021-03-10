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

    async saveUserAccount(userAccount: Account): Promise<void> {
        await this.saveAccountToFile(userAccount, "user.json");
    }

    async loadUserAccount(): Promise<Account> {
        return await this.loadAccountFromFile("user.json");
    }

    async saveFirstMessageAccount(fma: Account): Promise<void> {
        await this.saveAccountToFile(fma, "fma.json");
    }

    async loadFirstMessageAccount(): Promise<Account> {
        return await this.loadAccountFromFile("fma.json");
    }

    async loadPayerAccount(): Promise<Account> {
        return await this.loadAccountFromFile("payer.json");
    }

    async savePayerAccount(payerAccount: Account) {
        await this.saveAccountToFile(payerAccount, "payer.json");
    }

    private async loadAccountFromFile(name: string) {
        const filename = path.join(Store.getDir(), name);
        const data = await fs.readFile(filename, 'utf8');
        const payload = JSON.parse(data);
        return new Account(Buffer.from(payload.secretKey, 'base64'));
    }

    private async saveAccountToFile(fma: Account, file: string) {
        await mkdirp(Store.getDir());
        const filename = path.join(Store.getDir(), file);
        const payload = {
            publicKey: fma.publicKey.toBase58(),
            secretKey: Buffer.from(fma.secretKey).toString('base64'),
        };

        await fs.writeFile(filename, JSON.stringify(payload), 'utf-8');
    }
}
