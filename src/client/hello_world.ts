/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/ban-ts-comment */

import {Account, BPF_LOADER_PROGRAM_ID, BpfLoader, Connection, LAMPORTS_PER_SOL, PublicKey,} from '@solana/web3.js';

import fs from 'mz/fs';
// @ts-ignore
import BufferLayout from 'buffer-layout';

import {url, urlTls} from './util/url';
import {Store} from './util/store';
import {newAccountWithLamports} from './util/new-account-with-lamports';
import {newSystemAccountWithAirdrop} from "./util/new-system-account-with-airdrop";
import * as Message from './message';
import * as User from './user';
import {publicKeyToName} from "./util/publickey-to-name";
import * as readline from "readline";
import {MessageData} from "./message";

/**
 * Connection to the network
 */
let connection: Connection;

/**
 * Connection to the network
 */
let payerAccount: Account;

/**
 * Hello world's program id
 */
let programId: PublicKey;

const pathToProgram = 'dist/program/helloworld.so';

/**
 * Layout of the greeted account data
 */
const greetedAccountDataLayout = BufferLayout.struct([
    BufferLayout.u32('numGreets'),
]);

/**
 * Establish a connection to the cluster
 */
export async function establishConnection(): Promise<void> {
    connection = new Connection(url, 'singleGossip');
    const version = await connection.getVersion();
    console.log('Connection to cluster established:', url, version);
}

/**
 * Establish an account to pay for everything
 */
export async function establishPayer(): Promise<void> {
    if (!payerAccount) {
        let fees = 0;
        const {feeCalculator} = await connection.getRecentBlockhash();

        // Calculate the cost to load the program
        const data = await fs.readFile(pathToProgram);
        const NUM_RETRIES = 500; // allow some number of retries
        fees +=
            feeCalculator.lamportsPerSignature *
            (BpfLoader.getMinNumSignatures(data.length) + NUM_RETRIES) +
            (await connection.getMinimumBalanceForRentExemption(data.length));

        // Calculate the cost to fund the greeter account
        fees += await connection.getMinimumBalanceForRentExemption(
            greetedAccountDataLayout.span,
        );

        // Calculate the cost of sending the transactions
        fees += feeCalculator.lamportsPerSignature * 100; // wag

        // Fund a new payer via airdrop
        payerAccount = await newAccountWithLamports(connection, fees);
    }
}

/**
 * Load the hello world BPF program if not already loaded
 */
export async function loadProgram(): Promise<void> {
    const store = new Store();

    // Check if the program has already been loaded
    try {
        const config = await store.load('config.json');
        programId = new PublicKey(config.programId);
        await connection.getAccountInfo(programId);
        return;
    } catch (err) {
        // try to load the program
    }

    // Load the program
    const data = await fs.readFile(pathToProgram);
    const programAccount = new Account();
    await BpfLoader.load(
        connection,
        payerAccount,
        programAccount,
        data,
        BPF_LOADER_PROGRAM_ID,
    );
    programId = programAccount.publicKey;

    await store.save('config.json', {
        url: urlTls,
        programId: programId.toBase58(),
    });
}

/**
 * Create user
 */
export async function createUser(): Promise<void> {
    const store = new Store();
    let feedAccount = await store.loadFirstMessageAccount();
    try {
        const userAccount = await store.loadUserAccount();
        if (userAccount.publicKey) {
        }
        return;
    } catch (e) {
        // create a new user
    }

    const user = await User.createUser(
        connection,
        programId,
        payerAccount,
        feedAccount,
    );

    await store.saveUserAccount(user);
}


/**
 * Create first post
 */

export async function createFirstPost(): Promise<void> {
    const store = new Store();

    // Check if first post is created
    try {
        const feedAccount = await store.loadFirstMessageAccount();
        if (feedAccount.publicKey) {
            return;
        }
    } catch (err) {
        // console.log("fail to read app data", JSON.stringify(err));
        // try to load the program
    }
    let messageFeed = await Message.createMessageFeed(connection,
        programId);

    await store.saveFirstMessageAccount(messageFeed.firstMessageAccount);
}

/**
 * Say hello
 */
export async function sayHello(message: string): Promise<void> {
    if (!message) {
        console.log("empty message");
        return
    }
    const store = new Store();
    const userAccount = await store.loadUserAccount();
    const firstMessageAccount = await store.loadFirstMessageAccount();

    const messages: Array<Message.Message> = [];

    await Message.refreshMessageFeed(connection, messages, null, firstMessageAccount.publicKey);

    const {feeCalculator} = await connection.getRecentBlockhash();
    const postMessageFee = feeCalculator.lamportsPerSignature * 3; // 1 payer and 2 signer keys
    const minAccountBalance = await connection.getMinimumBalanceForRentExemption(
        User.messageAccountSize(message),
    );
    const payerAccount = await newSystemAccountWithAirdrop(
        connection,
        postMessageFee + minAccountBalance,
    );
    await Message.postMessage(
        connection,
        payerAccount,
        userAccount,
        message,
        messages[messages.length - 1].publicKey,
    );

}

/**
 * Report the number of times the greeted account has been said hello to
 */
export async function reportHellos(): Promise<void> {
    const store = new Store();
    const messages: Array<Message.Message> = [];
    const firstMessageAccount = await store.loadFirstMessageAccount();
    await Message.refreshMessageFeed(connection, messages, null, firstMessageAccount.publicKey);
    for (let message of messages) {
        console.log(message.name, ":", message.text);
    }

}

export async function monitorMessage(message: PublicKey): Promise<Message.Message> {
    return new Promise(resolve => {
        connection.onAccountChange(message, function (accountInfo, context) {
            const changedData = Message.messageAccountDataLayout.decode(accountInfo.data);
            const nextMessage = new PublicKey(changedData.nextMessage);
            Message.readMessage(connection, nextMessage).then(messageData => {
                resolve({
                    publicKey: messageData.messagePubkey,
                    from: messageData.from,
                    name: publicKeyToName(messageData.from),
                    text: messageData.text,
                })
            });
        });
    });
}

export async function monitorFeeds(): Promise<void> {
    const store = new Store();
    const messages: Array<Message.Message> = [];
    const firstMessageAccount = await store.loadFirstMessageAccount();
    await Message.refreshMessageFeed(connection, messages, null, firstMessageAccount.publicKey);
    for (let message of messages) {
        console.log(message.name, ":", message.text, "(", message.publicKey.toBase58(), ")");
    }
    let lastMessageKey = messages[messages.length - 1].publicKey;
    for (; ;) {
        let message = await monitorMessage(lastMessageKey);
        lastMessageKey = message.publicKey;
        console.log(message.name, ":", message.text, "(", message.publicKey.toBase58(), ")");
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question("", function (ans: string) {
        rl.close();
        resolve();
    }));
}
