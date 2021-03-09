import {
    Account,
    Connection,
    SystemProgram,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
} from '@solana/web3.js';


export const userAccountSize = 1 + 32; // 32 = size of a public key
export function messageAccountSize(text: string): number {
    const textBuffer = Buffer.from(text);
    return 32 + 32 + 32 + textBuffer.length; // 32 = size of a public key
}

export async function createUser(
    connection: Connection,
    programId: PublicKey,
    payerAccount: Account,
    messageAccount: Account,
): Promise<Account> {
    console.log("entering createUser with program id", programId.toBase58());
    const transaction = new Transaction();
    const userAccount = await createUserAccount(
        connection,
        programId,
        payerAccount,
        messageAccount,
        transaction,
    );
    console.log("created user account", userAccount.publicKey.toBase58());

    await sendAndConfirmTransaction(
        connection,
        transaction,
        [payerAccount,
        userAccount,
        messageAccount,]
    );
    console.log("createUser transaction completed");
    return userAccount;
}

/**
 * Create user account
 */

export async function createUserAccount(connection: Connection,
                                        programId: PublicKey,
                                        payerAccount: Account,
                                        messageAccount: Account,
                                        transaction: Transaction,): Promise<Account> {
    const userAccount = new Account();

    // Allocate the user account
    transaction.add(
        SystemProgram.createAccount({
            fromPubkey: payerAccount.publicKey,
            newAccountPubkey: userAccount.publicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(
                userAccountSize,
            ),
            space: userAccountSize,
            programId,
        }),
    );

    // Initialize the user account
    const keys = [
        {pubkey: userAccount.publicKey, isSigner: true, isWritable: false},
    ];

    if (messageAccount) {
        keys.push({pubkey: messageAccount.publicKey, isSigner: true, isWritable: false});
    }
    transaction.add({
        keys,
        programId,
    });

    return userAccount;
}
