// import * as BufferLayout from 'buffer-layout';
const lo = require('buffer-layout');
import * as User from './user';

import {
    Account, AccountInfo,
    Connection,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
    TransactionSignature
} from "@solana/web3.js";
import {newSystemAccountWithAirdrop} from "./util/new-system-account-with-airdrop";
import {Store} from "./util/store";
import {publicKeyToName} from "./util/publickey-to-name";

export type MessageFeedMeta = {
    programId: PublicKey,
    firstMessageAccount: Account,
};

export type Message = {
    publicKey: PublicKey,
    from: PublicKey,
    name: string,
    text: string,
};

export type MessageData = {
    messagePubkey: PublicKey,
    nextMessage: PublicKey,
    from: PublicKey,
    programId: PublicKey,
    text: string,
};


const publicKeyLayout = (property: string = 'publicKey'): Object => {
    return lo.blob(32, property);
};

export const messageAccountDataLayout = lo.struct([
    publicKeyLayout('nextMessage'),
    publicKeyLayout('from'),
    publicKeyLayout('creator'),
    lo.cstr('text'),
]);


/**
 * Creates a new Message Feed.
 */
export async function createMessageFeed(connection: Connection, programId: PublicKey): Promise<MessageFeedMeta> {
    console.log('Message feed program:', programId.toString());
    console.log('Posting first message...');

    const firstMessage = 'First post! 💫';

    const {feeCalculator} = await connection.getRecentBlockhash();
    const postMessageFee =
        feeCalculator.lamportsPerSignature * 3;
    /* 1 payer + 2 signer keys */
    const minAccountBalances =
        (await connection.getMinimumBalanceForRentExemption(
            User.userAccountSize,
        )) +
        (await connection.getMinimumBalanceForRentExemption(
            User.messageAccountSize(firstMessage),
        ));
    const payerAccount = await newSystemAccountWithAirdrop(
        connection,
        postMessageFee + minAccountBalances,
    );

    const firstMessageAccount = new Account();
    await postMessageWithProgramId(
        connection,
        programId,
        payerAccount,
        null,
        firstMessageAccount,
        firstMessage,
    );
    console.log(
        'First message public key:',
        firstMessageAccount.publicKey.toString(),
    );
    return {
        programId,
        firstMessageAccount,
    };
}

/**
 * Read the contents of a message
 */
export async function readMessage(
    connection: Connection,
    message: PublicKey,
): Promise<MessageData> {
    const accountInfo = await connection.getAccountInfo(message);

    if (accountInfo) {
        const messageAccountData = messageAccountDataLayout.decode(accountInfo.data);

        return {
            messagePubkey: message,
            nextMessage: new PublicKey(messageAccountData.nextMessage),
            from: new PublicKey(messageAccountData.from),
            programId: accountInfo.owner,
            text: messageAccountData.text,
        };
    }
    return {
        messagePubkey: new PublicKey(0),
        nextMessage: new PublicKey(0),
        from: new PublicKey(0),
        programId: new PublicKey(0),
        text: "",
    }
}

/**
 * Parse message data
 */
//
// export async function parseMessage(accountInfo: AccountInfo): Promise<void> {
//     const messageAccountData = messageAccountDataLayout.decode(accountInfo.data);
//     return {
//         nextMessage: new PublicKey(messageAccountData.nextMessage),
//         from: new PublicKey(messageAccountData.from),
//         programId: accountInfo.owner,
//         text: messageAccountData.text,
//     };
// }

/**
 * Posts a new message
 */
export async function postMessage(
    connection: Connection,
    payerAccount: Account,
    userAccount: Account,
    text: string,
    previousMessage: PublicKey,
    userToBan: PublicKey | null = null,
): Promise<TransactionSignature> {
    const messageData = await readMessage(connection, previousMessage);
    const messageAccount = new Account();
    return postMessageWithProgramId(
        connection,
        messageData.programId,
        payerAccount,
        userAccount,
        messageAccount,
        text,
        previousMessage,
        userToBan,
    );
}

export async function postMessageWithProgramId(
    connection: Connection,
    programId: PublicKey,
    payerAccount: Account,
    userAccountArg: Account | null,
    messageAccount: Account,
    text: string,
    previousMessagePublicKey: PublicKey | null = null,
    userToBan: PublicKey | null = null,
): Promise<TransactionSignature> {
    const transaction = new Transaction();
    const dataSize = User.messageAccountSize(text);
    const textBuffer = Buffer.from(text);

    // Allocate the message account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: payerAccount.publicKey,
            newAccountPubkey: messageAccount.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(dataSize),
            space: dataSize,
            programId,
        }),
    );

    let userAccount = userAccountArg;
    if (userAccount === null) {
        console.log("Creating new user...")
        userAccount = await User.createUserAccount(
            connection,
            programId,
            payerAccount,
            messageAccount,
            transaction,
        );
    }

    // The second instruction in the transaction posts the message, optionally
    // links it to the previous message and optionally bans another user
    const keys = [
        {pubkey: userAccount.publicKey, isSigner: true, isWritable: false},
        {pubkey: messageAccount.publicKey, isSigner: true, isWritable: false},
    ];
    if (previousMessagePublicKey) {
        keys.push({
            pubkey: previousMessagePublicKey,
            isSigner: false,
            isWritable: true,
        });

        if (userToBan) {
            keys.push({pubkey: userToBan, isSigner: false, isWritable: true});
        }
    }
    transaction.add({
        keys,
        programId,
        data: textBuffer,
    });
    return await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerAccount,
            userAccount,
            messageAccount,]
    );
}

/**
 * Checks a message feed for new messages and loads them into the provided
 * messages array.
 */
export async function refreshMessageFeed(
    connection: Connection,
    messages: Array<Message>,
    onNewMessage: Function | null,
    message: PublicKey | null = null,
): Promise<void> {
    const emptyMessage = new PublicKey(0);
    for (; ;) {
        if (message === null) {
            if (messages.length === 0) {
                return;
            }
            const lastMessage = messages[messages.length - 1].publicKey;
            const lastMessageData = await readMessage(connection, lastMessage);
            message = lastMessageData.nextMessage;
        }

        if (message.equals(emptyMessage)) {
            return;
        }

        const messageData = await readMessage(connection, message);
        messages.push({
            publicKey: message,
            from: messageData.from,
            name: publicKeyToName(messageData.from),
            text: messageData.text,
        });
        onNewMessage && onNewMessage();
        message = messageData.nextMessage;
    }
}