/**
 * Hello world
 */

import {
    establishConnection,
    establishPayer,
    loadProgram,
    monitorFeeds,
    reportHellos,
    createUser,
    createFirstPost,
} from './hello_world';

const readline = require('readline');

async function main() {
    await initialize();
    // await reportHellos();
    await monitorFeeds();
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
