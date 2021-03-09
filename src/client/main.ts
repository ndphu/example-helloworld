/**
 * Hello world
 */

import {
    establishConnection,
    establishPayer,
    loadProgram,
    sayHello,
    reportHellos,
    createUser,
    createFirstPost,
} from './hello_world';

const readline = require('readline');

async function main() {
    await initialize();

    // await reportHellos();
    for (;;) {
        const message = await askQuestion("Enter message:");
        console.log("Sending message", message);
        await sayHello(message);
        console.log('Success');
    }
}

async function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => rl.question(query, function (ans: string) {
        rl.close();
        resolve(ans);
    }))
}

async function initialize(): Promise<void> {
    // Establish connection to the cluster
    await establishConnection();

    // Determine who pays for the fees
    await establishPayer();

    // Load the program if not already loaded
    await loadProgram();

    // create first post
    await createFirstPost();

    // create user
    await createUser();
}

main().then(
    () => process.exit(),
    err => {
        console.error(err);
        process.exit(-1);
    },
);
